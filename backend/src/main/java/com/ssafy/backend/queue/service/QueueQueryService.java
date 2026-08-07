package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.domain.QueueDisplayStatus;
import com.ssafy.backend.queue.dto.QueueOperationResponse;
import com.ssafy.backend.queue.dto.QueueManagementResponse;
import com.ssafy.backend.queue.dto.QueueSnapshotResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

/** 참가자와 운영자에게 필요한 현재 대기열 상태를 조회한다. */
@Service
public class QueueQueryService {
    private static final Set<QueueEntryStatus> FINISHED_STATUSES = Set.of(
            QueueEntryStatus.DONE,
            QueueEntryStatus.NO_SHOW,
            QueueEntryStatus.SKIPPED,
            QueueEntryStatus.REMOVED);

    private final CurrentUserService currentUserService;
    private final QueueEntryRepository queueEntryRepository;
    private final CallSessionRepository callSessionRepository;
    private final MeetingOperationSettingRepository operationSettingRepository;
    private final QueueRealtimeStore realtimeStore;
    private final MeetingAccessService meetingAccessService;

    /**
     * 대기열 조회에 필요한 저장소와 현재 사용자 처리기를 주입받는다.
     *
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param queueEntryRepository 대기열 항목 저장소
     * @param callSessionRepository 영상통화 세션 저장소
     * @param operationSettingRepository 팬미팅 운영 설정 저장소
     * @param realtimeStore 실시간 대기열 상태 저장소
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     */
    public QueueQueryService(CurrentUserService currentUserService,
                             QueueEntryRepository queueEntryRepository,
                             CallSessionRepository callSessionRepository,
                             MeetingOperationSettingRepository operationSettingRepository,
                             QueueRealtimeStore realtimeStore,
                             MeetingAccessService meetingAccessService) {
        this.currentUserService = currentUserService;
        this.queueEntryRepository = queueEntryRepository;
        this.callSessionRepository = callSessionRepository;
        this.operationSettingRepository = operationSettingRepository;
        this.realtimeStore = realtimeStore;
        this.meetingAccessService = meetingAccessService;
    }

    /**
     * 로그인 참가자의 순번, 앞선 인원과 예상 대기시간을 조회한다.
     *
     * <p>팬미팅이 종료되면 Redis 실시간 상태가 모두 정리되므로, 실시간 상태를 찾을 수 없으면
     * 권위 있는 DB 상태로 되돌아가 종료를 알린다. 그렇지 않으면 이미 끝난 팬미팅에서 대기 화면이
     * 종료를 인지하지 못하고 오류만 반복해서 받는다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 현재 대기 상태 스냅샷이며 팬미팅이 끝났으면 종료 상태로 응답한다
     * @throws BusinessException 참가자가 아니거나 아직 대기열이 초기화되지 않은 경우
     */
    @Transactional(readOnly = true)
    public QueueSnapshotResponse getMySnapshot(Long meetingId, AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository
                .findByMeeting_IdAndParticipant_Fan_Id(meetingId, user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTICIPANT_NOT_FOUND));
        if (!realtimeStore.isInitialized(meetingId)) {
            return finishedSnapshot(entry);
        }

        QueueEntryStatus status = realtimeStore.getStatus(meetingId, entry.getId());
        Integer position = realtimeStore.getPosition(meetingId, entry.getId());
        long peopleAhead = realtimeStore.countAhead(meetingId, entry.getId());
        MeetingOperationSetting setting = operationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OPERATION_SETTING_NOT_FOUND));
        if (status == null || position == null || peopleAhead < 0) {
            return finishedSnapshot(entry);
        }
        if (status == QueueEntryStatus.NOT_ENTERED) {
            throw new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_ENTERED);
        }
        Long callSessionId = null;
        if (status == QueueEntryStatus.CALLED || status == QueueEntryStatus.IN_CALL) {
            callSessionId = callSessionRepository.findByQueueEntry_Id(entry.getId())
                    .map(CallSession::getId)
                    .orElse(null);
        }
        return new QueueSnapshotResponse(
                entry.getId(),
                position,
                peopleAhead,
                peopleAhead * setting.getCallDurationSec(),
                QueueDisplayStatus.from(status),
                entry.getCallAttemptCount(),
                entry.getCalledAt(),
                callSessionId,
                callSessionId != null,
                entry.getLastChangeReason(),
                entry.getLastChangeKey(),
                entry.getLastChangeArguments(),
                entry.getLastChangedAt()
        );
    }

    /**
     * 실시간 상태가 없는 참가자를 권위 있는 DB 상태로 응답한다.
     *
     * <p>DB 상태가 이미 종결됐다면 팬미팅이 끝나 실시간 상태가 정리된 경우이므로 종료로 안내하고,
     * 아직 진행 중이어야 하는 상태라면 실시간 상태가 있어야 하므로 미초기화 오류를 그대로 알린다.
     *
     * @param entry 조회 대상 대기열 항목
     * @return DB 상태로 만든 종료 스냅샷
     * @throws BusinessException 아직 종결되지 않아 실시간 상태가 있어야 하는 경우
     */
    private QueueSnapshotResponse finishedSnapshot(QueueEntry entry) {
        QueueEntryStatus status = entry.getStatus();
        if (status == null || !FINISHED_STATUSES.contains(status)) {
            throw new BusinessException(ErrorCode.QUEUE_NOT_INITIALIZED);
        }
        return new QueueSnapshotResponse(
                entry.getId(),
                entry.getQueuePosition(),
                0L,
                0L,
                QueueDisplayStatus.from(status),
                entry.getCallAttemptCount(),
                entry.getCalledAt(),
                null,
                false,
                entry.getLastChangeReason(),
                entry.getLastChangeKey(),
                entry.getLastChangeArguments(),
                entry.getLastChangedAt()
        );
    }

    /** 현재 호출 또는 통화 중인 참가자를 운영자 응답 형식으로 조회한다. */
    @Transactional(readOnly = true)
    public QueueOperationResponse getCurrent(Long meetingId) {
        Long entryId = realtimeStore.getCurrentEntryId(meetingId);
        if (entryId == null) {
            return null;
        }
        QueueEntry entry = queueEntryRepository.findByMeeting_IdAndId(meetingId, entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        return toOperationResponse(entry);
    }

    /**
     * 팬미팅 운영자가 현재 통화와 전체 대기열을 조회합니다.
     *
     * <p>팬미팅이 종료되면 실시간 대기열이 정리되므로, 운영 화면이 종료와 아직 초기화되지 않은
     * 상태를 구분할 수 있도록 서로 다른 오류로 알린다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 현재 통화와 입장한 참가자 대기열
     * @throws BusinessException 운영 권한이 없거나 팬미팅이 이미 종료되었거나 대기열이 초기화되지 않은 경우
     */
    @Transactional(readOnly = true)
    public QueueManagementResponse getManagementQueue(
            Long meetingId, AuthenticatedUser principal
    ) {
        User operator = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = meetingAccessService.requireOperator(meetingId, operator);
        if (!realtimeStore.isInitialized(meetingId)) {
            throw new BusinessException(meeting.getStatus() == FanMeetingStatus.ENDED
                    ? ErrorCode.FAN_MEETING_ALREADY_ENDED
                    : ErrorCode.QUEUE_NOT_INITIALIZED);
        }

        List<QueueManagementResponse.Entry> entries = queueEntryRepository
                .findByMeeting_IdOrderByQueuePositionAsc(meetingId)
                .stream()
                .filter(entry -> {
                    QueueEntryStatus status =
                            realtimeStore.getStatus(meetingId, entry.getId());
                    return status != null && status != QueueEntryStatus.NOT_ENTERED;
                })
                .map(entry -> toManagementEntry(meetingId, entry))
                .toList();

        return new QueueManagementResponse(findCurrentCall(meetingId), entries);
    }

    /**
     * 대기열 엔티티를 운영자 화면 응답 항목으로 변환합니다.
     *
     * @param meetingId 팬미팅 식별자
     * @param entry 변환할 대기열 엔티티
     * @return 운영자 화면용 대기열 항목
     */
    private QueueManagementResponse.Entry toManagementEntry(
            Long meetingId, QueueEntry entry
    ) {
        QueueEntryStatus status = realtimeStore.getStatus(meetingId, entry.getId());
        Integer position = realtimeStore.getPosition(meetingId, entry.getId());
        User fan = entry.getParticipant().getFan();
        return new QueueManagementResponse.Entry(
                entry.getId(),
                entry.getParticipant().getId(),
                fan.getId(),
                fan.getNickname(),
                fan.getProfileImageUrl(),
                position != null ? position : entry.getQueuePosition(),
                toManagementStatus(status),
                entry.getCallAttemptCount(),
                entry.getEnteredAt()
        );
    }

    /**
     * 현재 호출 또는 통화 중인 참가자의 통화 세션을 조회합니다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 현재 통화 정보이며 진행 중인 참가자가 없으면 {@code null}
     */
    private QueueManagementResponse.CurrentCall findCurrentCall(Long meetingId) {
        Long entryId = realtimeStore.getCurrentEntryId(meetingId);
        if (entryId == null) {
            return null;
        }
        QueueEntry entry = queueEntryRepository.findByMeeting_IdAndId(meetingId, entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        CallSession session = callSessionRepository.findByQueueEntry_Id(entryId)
                .orElse(null);
        if (session == null) {
            return null;
        }
        return new QueueManagementResponse.CurrentCall(
                session.getId(),
                entry.getParticipant().getId(),
                entry.getParticipant().getFan().getNickname(),
                session.getStartedAt(),
                session.getEndsAt()
        );
    }

    /**
     * 내부 대기열 상태를 API 명세의 상태 이름으로 변환합니다.
     *
     * @param status 내부 대기열 상태
     * @return API 응답 상태 이름
     */
    private String toManagementStatus(QueueEntryStatus status) {
        if (status == QueueEntryStatus.DONE) {
            return "COMPLETED";
        }
        return status != null ? status.name() : QueueEntryStatus.NOT_ENTERED.name();
    }

    /** 대기열 엔티티를 운영 API 응답으로 변환한다. */
    QueueOperationResponse toOperationResponse(QueueEntry entry) {
        return new QueueOperationResponse(
                entry.getId(),
                entry.getParticipant().getId(),
                entry.getQueuePosition(),
                entry.getStatus(),
                entry.getCallAttemptCount(),
                entry.getCalledAt(),
                entry.getNoShowAt()
        );
    }
}
