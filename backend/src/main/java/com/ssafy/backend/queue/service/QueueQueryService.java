package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.domain.QueueDisplayStatus;
import com.ssafy.backend.queue.dto.QueueOperationResponse;
import com.ssafy.backend.queue.dto.QueueSnapshotResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 참가자와 운영자에게 필요한 현재 대기열 상태를 조회한다. */
@Service
public class QueueQueryService {
    private final CurrentUserService currentUserService;
    private final QueueEntryRepository queueEntryRepository;
    private final MeetingOperationSettingRepository operationSettingRepository;
    private final QueueRealtimeStore realtimeStore;

    /** 대기열 조회에 필요한 저장소와 현재 사용자 처리기를 주입받는다. */
    public QueueQueryService(CurrentUserService currentUserService,
                             QueueEntryRepository queueEntryRepository,
                             MeetingOperationSettingRepository operationSettingRepository,
                             QueueRealtimeStore realtimeStore) {
        this.currentUserService = currentUserService;
        this.queueEntryRepository = queueEntryRepository;
        this.operationSettingRepository = operationSettingRepository;
        this.realtimeStore = realtimeStore;
    }

    /** 로그인 참가자의 순번, 앞선 인원과 예상 대기시간을 조회한다. */
    @Transactional(readOnly = true)
    public QueueSnapshotResponse getMySnapshot(Long meetingId, AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository
                .findByMeeting_IdAndParticipant_Fan_Id(meetingId, user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTICIPANT_NOT_FOUND));
        if (!realtimeStore.isInitialized(meetingId)) {
            throw new BusinessException(ErrorCode.QUEUE_NOT_INITIALIZED);
        }

        QueueEntryStatus status = realtimeStore.getStatus(meetingId, entry.getId());
        Integer position = realtimeStore.getPosition(meetingId, entry.getId());
        long peopleAhead = realtimeStore.countAhead(meetingId, entry.getId());
        MeetingOperationSetting setting = operationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OPERATION_SETTING_NOT_FOUND));
        if (status == null || position == null || peopleAhead < 0) {
            throw new BusinessException(ErrorCode.QUEUE_NOT_INITIALIZED);
        }
        if (status == QueueEntryStatus.NOT_ENTERED) {
            throw new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_ENTERED);
        }
        return new QueueSnapshotResponse(
                entry.getId(),
                position,
                peopleAhead,
                peopleAhead * setting.getCallDurationSec(),
                QueueDisplayStatus.from(status),
                entry.getCallAttemptCount(),
                entry.getCalledAt(),
                status == QueueEntryStatus.CALLED
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
