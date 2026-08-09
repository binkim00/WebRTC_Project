package com.ssafy.backend.participant.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.dto.ParticipantCallSessionView;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.domain.ParticipantSource;
import com.ssafy.backend.participant.dto.ParticipantSummaryResponse;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/** 팬미팅 운영자에게 확정 참가자 목록과 상세 정보를 제공한다. */
@Service
public class ParticipantQueryService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final String COMPLETED_QUEUE_STATUS = "COMPLETED";

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final ParticipantRepository participantRepository;
    private final QueueEntryRepository queueEntryRepository;
    private final CallSessionRepository callSessionRepository;

    /**
     * 참가자 조회에 필요한 권한 검증기와 저장소를 주입받는다.
     *
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param participantRepository 참가자 저장소
     * @param queueEntryRepository 대기열 항목 저장소
     * @param callSessionRepository 영상통화 세션 저장소
     */
    public ParticipantQueryService(CurrentUserService currentUserService,
                                   MeetingAccessService meetingAccessService,
                                   ParticipantRepository participantRepository,
                                   QueueEntryRepository queueEntryRepository,
                                   CallSessionRepository callSessionRepository) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.participantRepository = participantRepository;
        this.queueEntryRepository = queueEntryRepository;
        this.callSessionRepository = callSessionRepository;
    }

    /**
     * 팬미팅 운영자가 확정 참가자를 배정 순번대로 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param participantStatus 참가자 상태 필터이며 비우면 전체 상태를 조회한다
     * @param keyword 팬 닉네임 검색어이며 비우면 전체 참가자를 조회한다
     * @param participantSource 참가자 출처 필터이며 비우면 출처를 구분하지 않는다
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 참가자 요약 페이지
     * @throws BusinessException 팬미팅이 없거나 운영 권한이 없거나 페이지 값이 잘못된 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<ParticipantSummaryResponse> getParticipants(
            Long meetingId, String participantStatus, String keyword,
            ParticipantSource participantSource, int page, int size, AuthenticatedUser principal
    ) {
        User operator = currentUserService.requireActiveUser(principal);
        meetingAccessService.requireOperator(meetingId, operator);
        validatePage(page, size);

        String status = normalizeFilter(participantStatus);
        String normalizedKeyword = normalizeFilter(keyword);
        PageRequest pageRequest = PageRequest.of(page, size);
        Page<Participant> participants = participantSource == null
                ? participantRepository.searchByMeeting(
                        meetingId, status, normalizedKeyword, pageRequest)
                : participantRepository.searchByMeetingAndSource(
                        meetingId, status, normalizedKeyword, participantSource, pageRequest);
        if (participants.isEmpty()) {
            return PageResponse.from(participants.map(
                    participant -> ParticipantSummaryResponse.of(participant, null, null)));
        }
        Map<Long, String> queueStatuses = queueStatusesByParticipantId(meetingId);
        Map<Long, Long> callSessionIds = callSessionIdsByParticipantId(meetingId);
        return PageResponse.from(participants.map(participant ->
                ParticipantSummaryResponse.of(participant,
                        queueStatuses.get(participant.getId()),
                        callSessionIds.get(participant.getId()))));
    }

    /**
     * 팬미팅 운영자가 선택한 참가자 한 명의 정보를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param participantId 참가자 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 참가자 요약 정보
     * @throws BusinessException 팬미팅이 없거나 운영 권한이 없거나 해당 팬미팅의 참가자가 아닌 경우
     */
    @Transactional(readOnly = true)
    public ParticipantSummaryResponse getParticipant(
            Long meetingId, Long participantId, AuthenticatedUser principal
    ) {
        User operator = currentUserService.requireActiveUser(principal);
        meetingAccessService.requireOperator(meetingId, operator);

        Participant participant = participantRepository
                .findByIdAndMeeting_Id(participantId, meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTICIPANT_NOT_IN_MEETING));
        QueueEntry entry = queueEntryRepository
                .findByMeeting_IdAndParticipant_Fan_Id(meetingId, participant.getFan().getId())
                .orElse(null);
        String queueStatus = entry == null ? null : toQueueStatus(entry.getStatus());
        Long callSessionId = entry == null ? null : callSessionRepository
                .findByQueueEntry_Id(entry.getId())
                .map(CallSession::getId)
                .orElse(null);
        return ParticipantSummaryResponse.of(participant, queueStatus, callSessionId);
    }

    /**
     * 팬미팅의 대기열 항목을 한 번에 조회해 참가자별 대기열 상태를 만든다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 참가자 식별자별 대기열 상태 이름
     */
    private Map<Long, String> queueStatusesByParticipantId(Long meetingId) {
        Map<Long, String> statuses = new HashMap<>();
        for (QueueEntry entry : queueEntryRepository
                .findByMeeting_IdOrderByQueuePositionAsc(meetingId)) {
            statuses.put(entry.getParticipant().getId(), toQueueStatus(entry.getStatus()));
        }
        return statuses;
    }

    /**
     * 팬미팅의 영상통화 세션을 한 번에 조회해 참가자별 세션 식별자를 만든다.
     *
     * <p>대기열 항목 하나에 세션 하나가 붙고 참가자당 대기열 항목도 하나이므로 참가자마다
     * 세션은 최대 하나다. 그럼에도 중복이 생기면 가장 최근에 만들어진 세션(식별자가 큰 쪽)을
     * 남겨 최신 통화의 요약을 가리키게 한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 참가자 식별자별 영상통화 세션 식별자
     */
    private Map<Long, Long> callSessionIdsByParticipantId(Long meetingId) {
        Map<Long, Long> callSessionIds = new HashMap<>();
        for (ParticipantCallSessionView view
                : callSessionRepository.findParticipantCallSessions(meetingId)) {
            callSessionIds.merge(view.participantId(), view.callSessionId(), Math::max);
        }
        return callSessionIds;
    }

    /**
     * 내부 대기열 상태를 운영 API 응답 상태 이름으로 변환한다.
     *
     * <p>완료 상태 이름은 운영자용 대기열 조회 API와 동일하게 {@code COMPLETED}로 노출한다.
     *
     * @param status 내부 대기열 상태
     * @return API 응답 상태 이름이며 상태가 없으면 {@code null}
     */
    private String toQueueStatus(QueueEntryStatus status) {
        if (status == null) {
            return null;
        }
        return status == QueueEntryStatus.DONE ? COMPLETED_QUEUE_STATUS : status.name();
    }

    /**
     * 비어 있는 검색 조건을 필터를 적용하지 않는 값으로 변환한다.
     *
     * @param value 요청으로 전달된 검색 조건
     * @return 앞뒤 공백을 제거한 값이며 값이 없으면 빈 문자열
     */
    private String normalizeFilter(String value) {
        return value == null ? "" : value.trim();
    }

    /**
     * 목록 API의 페이지 번호와 크기가 허용 범위인지 검증한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @throws BusinessException 페이지 번호가 음수이거나 크기가 허용 범위를 벗어난 경우
     */
    private void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}
