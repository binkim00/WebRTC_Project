package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueEnterResponse;
import com.ssafy.backend.queue.dto.QueueOperationResponse;
import com.ssafy.backend.queue.dto.QueueSnapshotResponse;
import com.ssafy.backend.queue.redis.QueueClaimResult;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 대기실 입장, 참가자 호출, 재호출과 노쇼 상태 변경을 처리한다. */
@Service
public class QueueCommandService {
    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final MeetingOperationSettingRepository operationSettingRepository;
    private final QueueEntryRepository queueEntryRepository;
    private final QueueRealtimeStore realtimeStore;
    private final QueueQueryService queryService;
    private final Clock clock;

    /** 대기열 상태 변경에 필요한 구성 요소를 주입받는다. */
    public QueueCommandService(CurrentUserService currentUserService,
                               MeetingAccessService meetingAccessService,
                               MeetingOperationSettingRepository operationSettingRepository,
                               QueueEntryRepository queueEntryRepository,
                               QueueRealtimeStore realtimeStore,
                               QueueQueryService queryService,
                               Clock clock) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.operationSettingRepository = operationSettingRepository;
        this.queueEntryRepository = queueEntryRepository;
        this.realtimeStore = realtimeStore;
        this.queryService = queryService;
        this.clock = clock;
    }

    /**
     * 로그인 참가자를 대기실 운영 시작 이후 한 번만 입장시킨다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 대기열 최초 입장 결과
     * @throws BusinessException 대기실 오픈 전이거나 참가자 또는 상태 검증에 실패한 경우
     */
    @Transactional
    public QueueEnterResponse enter(Long meetingId, AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository
                .findByMeeting_IdAndParticipant_Fan_Id(meetingId, user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTICIPANT_NOT_FOUND));
        LocalDateTime now = LocalDateTime.now(clock);
        MeetingOperationSetting setting = operationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OPERATION_SETTING_NOT_FOUND));
        if (setting.getWaitingRoomOpenAt() != null && now.isBefore(setting.getWaitingRoomOpenAt())) {
            throw new BusinessException(ErrorCode.WAITING_ROOM_NOT_OPEN);
        }
        QueueEntry locked = queueEntryRepository.findForUpdate(meetingId, entry.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        try {
            locked.enter(now);
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_ENTRY_ALREADY_ENTERED);
        }
        realtimeStore.updateStatus(meetingId, locked.getId(), locked.getStatus());
        QueueSnapshotResponse snapshot = queryService.getMySnapshot(meetingId, principal);
        return new QueueEnterResponse(
                snapshot.queueEntryId(),
                snapshot.position(),
                QueueEntryStatus.WAITING,
                locked.getEnteredAt(),
                snapshot.aheadCount(),
                snapshot.estimatedWaitSec()
        );
    }

    /**
     * 매니저가 지정한 참가자를 호출하고 동일 API의 두 번째 요청을 재호출로 처리한다.
     *
     * @param entryId 호출할 대기열 항목 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 호출 또는 재호출 결과
     * @throws BusinessException 매니저 권한, 호출 상태 또는 최대 횟수 검증에 실패한 경우
     */
    @Transactional
    public QueueOperationResponse call(Long entryId, AuthenticatedUser principal) {
        User manager = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository.findByIdForUpdate(entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        Long meetingId = entry.getMeeting().getId();
        meetingAccessService.requireManager(meetingId, manager);

        if (entry.getStatus() == QueueEntryStatus.CALLED) {
            return recallCurrent(meetingId, entry);
        }
        if (entry.getStatus() != QueueEntryStatus.WAITING) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }

        QueueClaimResult claimResult = realtimeStore.claimEntry(meetingId, entryId);
        if (claimResult == QueueClaimResult.ACTIVE_CALL) {
            throw new BusinessException(ErrorCode.ACTIVE_CALL_EXISTS);
        }
        if (claimResult == QueueClaimResult.STATE_CONFLICT) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        try {
            entry.call(LocalDateTime.now(clock));
            return queryService.toOperationResponse(entry);
        } catch (RuntimeException exception) {
            realtimeStore.releaseClaim(meetingId, entryId);
            if (exception instanceof BusinessException businessException) {
                throw businessException;
            }
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
    }

    /**
     * 현재 선점된 참가자를 명세상 허용된 한 번만 재호출한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param entry 재호출할 대기열 항목
     * @return 재호출 결과
     * @throws BusinessException 현재 호출자가 아니거나 최대 호출 횟수를 초과한 경우
     */
    private QueueOperationResponse recallCurrent(Long meetingId, QueueEntry entry) {
        Long currentEntryId = realtimeStore.getCurrentEntryId(meetingId);
        if (!entry.getId().equals(currentEntryId)) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        if (entry.getRecallCount() >= 1) {
            throw new BusinessException(ErrorCode.CALL_ATTEMPT_LIMIT_EXCEEDED);
        }
        try {
            entry.recall(LocalDateTime.now(clock));
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        return queryService.toOperationResponse(entry);
    }

    /**
     * 매니저가 현재 호출 중인 참가자를 노쇼 처리하고 현재 선점을 해제한다.
     *
     * @param entryId 노쇼 처리할 대기열 항목 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 노쇼 처리 결과
     * @throws BusinessException 매니저 권한 또는 호출 상태 검증에 실패한 경우
     */
    @Transactional
    public QueueOperationResponse markNoShow(Long entryId, AuthenticatedUser principal) {
        User manager = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository.findByIdForUpdate(entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        Long meetingId = entry.getMeeting().getId();
        meetingAccessService.requireManager(meetingId, manager);
        try {
            entry.markNoShow(LocalDateTime.now(clock));
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        realtimeStore.updateStatus(meetingId, entryId, entry.getStatus());
        realtimeStore.clearCurrent(meetingId, entryId);
        return queryService.toOperationResponse(entry);
    }
}
