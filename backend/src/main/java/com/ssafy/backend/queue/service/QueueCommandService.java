package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.dto.QueueOperationResponse;
import com.ssafy.backend.queue.dto.QueueSnapshotResponse;
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
    private final QueueEntryRepository queueEntryRepository;
    private final QueueRealtimeStore realtimeStore;
    private final QueueQueryService queryService;
    private final Clock clock;

    /** 대기열 상태 변경에 필요한 구성 요소를 주입받는다. */
    public QueueCommandService(CurrentUserService currentUserService,
                               MeetingAccessService meetingAccessService,
                               QueueEntryRepository queueEntryRepository,
                               QueueRealtimeStore realtimeStore,
                               QueueQueryService queryService,
                               Clock clock) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.queueEntryRepository = queueEntryRepository;
        this.realtimeStore = realtimeStore;
        this.queryService = queryService;
        this.clock = clock;
    }

    /** 로그인 참가자를 대기실에 한 번만 입장시키고 현재 상태를 반환한다. */
    @Transactional
    public QueueSnapshotResponse enter(Long meetingId, AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository
                .findByMeeting_IdAndParticipant_Fan_Id(meetingId, user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTICIPANT_NOT_FOUND));
        QueueEntry locked = queueEntryRepository.findForUpdate(meetingId, entry.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        try {
            locked.enter(LocalDateTime.now(clock));
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_ENTRY_ALREADY_ENTERED);
        }
        realtimeStore.updateStatus(meetingId, locked.getId(), locked.getStatus());
        return queryService.getMySnapshot(meetingId, principal);
    }

    /** Redis Lua 원자 연산으로 다음 참가자 한 명을 선점하고 DB 호출 상태를 갱신한다. */
    @Transactional
    public QueueOperationResponse callNext(Long meetingId, AuthenticatedUser principal) {
        User operator = currentUserService.requireActiveUser(principal);
        meetingAccessService.requireOperator(meetingId, operator);
        Long entryId;
        try {
            entryId = realtimeStore.claimNext(meetingId);
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.ACTIVE_CALL_EXISTS);
        }
        if (entryId == null) {
            throw new BusinessException(ErrorCode.NO_CALLABLE_PARTICIPANT);
        }

        try {
            QueueEntry entry = queueEntryRepository.findForUpdate(meetingId, entryId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
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

    /** 현재 호출 중인 참가자를 재호출하고 재호출 횟수를 증가시킨다. */
    @Transactional
    public QueueOperationResponse recall(Long meetingId, Long entryId, AuthenticatedUser principal) {
        User operator = currentUserService.requireActiveUser(principal);
        meetingAccessService.requireOperator(meetingId, operator);
        QueueEntry entry = queueEntryRepository.findForUpdate(meetingId, entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        try {
            entry.recall(LocalDateTime.now(clock));
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        realtimeStore.updateStatus(meetingId, entryId, entry.getStatus());
        return queryService.toOperationResponse(entry);
    }

    /** 현재 호출 중인 참가자를 노쇼 처리하고 다음 호출이 가능하도록 현재 선점을 해제한다. */
    @Transactional
    public QueueOperationResponse markNoShow(Long meetingId, Long entryId,
                                             AuthenticatedUser principal) {
        User operator = currentUserService.requireActiveUser(principal);
        meetingAccessService.requireOperator(meetingId, operator);
        QueueEntry entry = queueEntryRepository.findForUpdate(meetingId, entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
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
