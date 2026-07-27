package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.dto.QueueInitializationResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 생성된 참가자와 배정 순번을 사용해 행사 대기열을 초기화한다. */
@Service
public class QueueInitializationService {
    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final ParticipantRepository participantRepository;
    private final QueueEntryRepository queueEntryRepository;
    private final QueueRealtimeStore realtimeStore;

    /** 대기열 초기화에 필요한 조회·저장 구성 요소를 주입받는다. */
    public QueueInitializationService(CurrentUserService currentUserService,
                                      MeetingAccessService meetingAccessService,
                                      ParticipantRepository participantRepository,
                                      QueueEntryRepository queueEntryRepository,
                                      QueueRealtimeStore realtimeStore) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.participantRepository = participantRepository;
        this.queueEntryRepository = queueEntryRepository;
        this.realtimeStore = realtimeStore;
    }

    /** 참가자를 순번대로 DB에 저장하고 Redis 실시간 상태를 원자적으로 생성한다. */
    @Transactional
    public QueueInitializationResponse initialize(Long meetingId, AuthenticatedUser principal) {
        User operator = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = meetingAccessService.requireOperator(meetingId, operator);
        if (queueEntryRepository.existsByMeeting_Id(meetingId) || realtimeStore.isInitialized(meetingId)) {
            throw new BusinessException(ErrorCode.QUEUE_ALREADY_INITIALIZED);
        }

        List<Participant> participants = participantRepository
                .findByMeeting_IdOrderByAssignedOrderAsc(meetingId);
        if (participants.isEmpty()) {
            throw new BusinessException(ErrorCode.NO_PARTICIPANTS);
        }

        List<QueueEntry> entries = participants.stream()
                .map(participant -> QueueEntry.create(meeting, participant))
                .toList();
        entries = queueEntryRepository.saveAllAndFlush(entries);
        long initialized = realtimeStore.initialize(meetingId, entries);
        if (initialized != entries.size()) {
            throw new BusinessException(ErrorCode.QUEUE_ALREADY_INITIALIZED);
        }
        return new QueueInitializationResponse(meetingId, entries.size());
    }
}
