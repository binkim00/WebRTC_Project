package com.ssafy.backend.meeting.service;

import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.dto.FanMeetingStatisticsResponse;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.domain.ParticipantSource;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 소유 운영자에게 제공할 팬미팅 결과 통계를 원본 데이터에서 집계한다. */
@Service
public class FanMeetingStatisticsService {

    /**
     * 유효 응모 집계에서 제외하는 상태다.
     *
     * <p>취소한 응모는 실제 삭제하지 않고 보관하므로 응모 수 집계에서 제외한다.
     * 응모 관리 화면의 통계와 같은 기준을 사용한다.
     */
    private static final ApplicationStatus EXCLUDED_APPLICATION_STATUS = ApplicationStatus.WITHDRAWN;

    /** 엑셀이 UTF-8로 인식하도록 내보내기 파일 앞에 붙이는 BOM이다. */
    private static final String CSV_BOM = "﻿";

    /** 참가자 운영 결과 내보내기 CSV의 헤더다. */
    private static final String EXPORT_HEADER =
            "participantId,participantSource,callOrder,nickname,"
                    + "participantStatus,queueStatus,callStatus,callDurationSec";

    /** 완료 상태를 운영 API와 동일한 이름으로 노출하기 위한 값이다. */
    private static final String COMPLETED_QUEUE_STATUS = "COMPLETED";

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final ApplicationRepository applicationRepository;
    private final ParticipantRepository participantRepository;
    private final QueueEntryRepository queueEntryRepository;
    private final CallSessionRepository callSessionRepository;

    /**
     * 통계 집계에 필요한 사용자, 권한, 응모, 참가자, 대기열, 영상통화 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param applicationRepository 응모 저장소
     * @param participantRepository 참가자 저장소
     * @param queueEntryRepository 대기열 항목 저장소
     * @param callSessionRepository 영상통화 세션 저장소
     */
    public FanMeetingStatisticsService(
            CurrentUserService currentUserService,
            MeetingAccessService meetingAccessService,
            ApplicationRepository applicationRepository,
            ParticipantRepository participantRepository,
            QueueEntryRepository queueEntryRepository,
            CallSessionRepository callSessionRepository
    ) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.applicationRepository = applicationRepository;
        this.participantRepository = participantRepository;
        this.queueEntryRepository = queueEntryRepository;
        this.callSessionRepository = callSessionRepository;
    }

    /**
     * 소유 운영자가 팬미팅의 응모·참가·통화·노쇼 결과를 집계해 조회한다.
     *
     * <p>진행 중에도 현재까지의 집계를 확인할 수 있도록 팬미팅 상태는 제한하지 않는다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 팬미팅 결과 통계
     * @throws BusinessException 팬미팅이 없거나 삭제되었거나 운영 권한이 없는 경우
     */
    @Transactional(readOnly = true)
    public FanMeetingStatisticsResponse getStatistics(
            Long meetingId, AuthenticatedUser principal
    ) {
        User operator = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = meetingAccessService.requireOperator(meetingId, operator);
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }

        List<Long> callDurations = callDurationsSec(callSessionRepository
                .findByQueueEntry_Meeting_IdAndStatus(meetingId, CallSessionStatus.ENDED));
        long totalDurationSec = callDurations.stream().mapToLong(Long::longValue).sum();
        return new FanMeetingStatisticsResponse(
                applicationRepository.countByMeeting_IdAndStatusNot(
                        meetingId, EXCLUDED_APPLICATION_STATUS),
                applicationRepository.countByMeeting_IdAndStatus(
                        meetingId, ApplicationStatus.SELECTED),
                participantRepository.countByMeeting_Id(meetingId),
                participantRepository.countByMeeting_IdAndParticipantSource(
                        meetingId, ParticipantSource.APPLICATION),
                participantRepository.countByMeeting_IdAndParticipantSource(
                        meetingId, ParticipantSource.EXTERNAL_SELECTION),
                callDurations.size(),
                queueEntryRepository.countByMeeting_IdAndStatus(
                        meetingId, QueueEntryStatus.NO_SHOW),
                callSessionRepository.countByQueueEntry_Meeting_IdAndStatus(
                        meetingId, CallSessionStatus.FAILED),
                averageDurationSec(totalDurationSec, callDurations.size()),
                totalDurationSec
        );
    }

    /**
     * 소유 운영자가 참가자별 운영 결과를 CSV 한 행씩 내려받는다.
     *
     * <p>이메일 등 개인정보는 포함하지 않고 운영에 필요한 닉네임과 상태만 담는다.
     * 한 참가자에게 통화 세션이 여러 건 있으면 가장 마지막 세션을 대표로 사용하며,
     * 대기열 상태는 실시간 저장소가 아니라 확정된 DB 상태를 기준으로 한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 엑셀에서 바로 열 수 있도록 BOM을 포함한 CSV 문자열
     * @throws BusinessException 팬미팅이 없거나 삭제되었거나 운영 권한이 없는 경우
     */
    @Transactional(readOnly = true)
    public String exportParticipantResultCsv(Long meetingId, AuthenticatedUser principal) {
        User operator = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = meetingAccessService.requireOperator(meetingId, operator);
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }

        Map<Long, QueueEntry> entriesByParticipantId = new HashMap<>();
        for (QueueEntry entry : queueEntryRepository
                .findByMeeting_IdOrderByQueuePositionAsc(meetingId)) {
            entriesByParticipantId.put(entry.getParticipant().getId(), entry);
        }
        Map<Long, CallSession> lastSessionByEntryId = lastSessionByQueueEntryId(meetingId);

        StringBuilder csv = new StringBuilder(CSV_BOM).append(EXPORT_HEADER).append('\n');
        for (Participant participant : participantRepository.findAllForExport(meetingId)) {
            QueueEntry entry = entriesByParticipantId.get(participant.getId());
            CallSession session = entry == null ? null : lastSessionByEntryId.get(entry.getId());
            csv.append(escape(String.valueOf(participant.getId()))).append(',')
                    .append(escape(participant.getParticipantSource().name())).append(',')
                    .append(escape(String.valueOf(participant.getAssignedOrder()))).append(',')
                    .append(escape(participant.getFan().getNickname())).append(',')
                    .append(escape(participant.getStatus())).append(',')
                    .append(escape(queueStatus(entry))).append(',')
                    .append(escape(session == null ? "" : session.getStatus().name())).append(',')
                    .append(escape(callDurationSec(session)))
                    .append('\n');
        }
        return csv.toString();
    }

    /**
     * 팬미팅의 통화 세션을 대기열 항목별로 모아 가장 마지막 세션만 남긴다.
     *
     * <p>노쇼 뒤 다시 호출하면 같은 대기열 항목에 세션이 여러 건 생길 수 있으므로
     * 식별자가 가장 큰 세션을 대표 통화로 본다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 대기열 항목 식별자별 마지막 통화 세션
     */
    private Map<Long, CallSession> lastSessionByQueueEntryId(Long meetingId) {
        Map<Long, CallSession> lastSessions = new HashMap<>();
        for (CallSession session : callSessionRepository.findByQueueEntry_Meeting_Id(meetingId)) {
            Long entryId = session.getQueueEntry().getId();
            CallSession current = lastSessions.get(entryId);
            if (current == null || session.getId() > current.getId()) {
                lastSessions.put(entryId, session);
            }
        }
        return lastSessions;
    }

    /**
     * 대기열 항목의 상태를 운영 API와 같은 이름으로 변환한다.
     *
     * @param entry 대기열 항목이며 없으면 null
     * @return 대기열 상태 이름이며 항목이 없으면 빈 문자열
     */
    private String queueStatus(QueueEntry entry) {
        if (entry == null || entry.getStatus() == null) {
            return "";
        }
        return entry.getStatus() == QueueEntryStatus.DONE
                ? COMPLETED_QUEUE_STATUS : entry.getStatus().name();
    }

    /**
     * 대표 통화의 지속 시간을 초 단위 문자열로 만든다.
     *
     * @param session 대표 통화 세션이며 없으면 null
     * @return 통화 시간(초)이며 계산할 수 없으면 빈 문자열
     */
    private String callDurationSec(CallSession session) {
        if (session == null || session.getStartedAt() == null || session.getEndedAt() == null) {
            return "";
        }
        return String.valueOf(Math.max(0L, Duration.between(
                session.getStartedAt(), session.getEndedAt()).toSeconds()));
    }

    /**
     * CSV 한 칸의 값을 RFC 4180 규칙으로 감싼다.
     *
     * <p>닉네임에 쉼표나 큰따옴표, 줄바꿈이 들어가도 열이 밀리지 않게 한다.
     *
     * @param value 내보낼 원본 값
     * @return 필요하면 큰따옴표로 감싼 CSV 칸 값
     */
    private String escape(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")
                || value.contains("\r")) {
            return '"' + value.replace("\"", "\"\"") + '"';
        }
        return value;
    }

    /**
     * 종료된 영상통화 세션의 통화 시간을 초 단위로 계산한다.
     *
     * <p>시작 또는 종료 시각이 없는 세션은 통화 시간을 계산할 수 없으므로 집계에서 제외한다.
     * 시각이 역전된 데이터가 평균을 왜곡하지 않도록 음수는 0으로 보정한다.
     *
     * @param sessions 종료된 영상통화 세션 목록
     * @return 세션별 통화 시간(초) 목록
     */
    private List<Long> callDurationsSec(List<CallSession> sessions) {
        List<Long> durations = new ArrayList<>(sessions.size());
        for (CallSession session : sessions) {
            if (session.getStartedAt() == null || session.getEndedAt() == null) {
                continue;
            }
            durations.add(Math.max(0L, Duration.between(
                    session.getStartedAt(), session.getEndedAt()).toSeconds()));
        }
        return durations;
    }

    /**
     * 종료된 통화 한 건의 평균 통화 시간을 초 단위로 반올림해 계산한다.
     *
     * @param totalDurationSec 전체 통화 시간 합계(초)
     * @param callCount 통화 시간을 집계한 통화 수
     * @return 평균 통화 시간(초)이며 집계할 통화가 없으면 0
     */
    private long averageDurationSec(long totalDurationSec, int callCount) {
        return callCount == 0 ? 0L : Math.round((double) totalDurationSec / callCount);
    }
}
