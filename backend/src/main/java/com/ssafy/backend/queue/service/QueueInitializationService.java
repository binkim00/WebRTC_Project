package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.dto.QueueInitializationResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 생성된 참가자와 배정 순번을 사용해 행사 대기열을 초기화한다. */
@Service
public class QueueInitializationService {
    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final FanMeetingRepository fanMeetingRepository;
    private final ParticipantRepository participantRepository;
    private final QueueEntryRepository queueEntryRepository;
    private final QueueRealtimeStore realtimeStore;

    /** 대기열 초기화에 필요한 조회·저장 구성 요소를 주입받는다. */
    public QueueInitializationService(CurrentUserService currentUserService,
                                      MeetingAccessService meetingAccessService,
                                      FanMeetingRepository fanMeetingRepository,
                                      ParticipantRepository participantRepository,
                                      QueueEntryRepository queueEntryRepository,
                                      QueueRealtimeStore realtimeStore) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.participantRepository = participantRepository;
        this.queueEntryRepository = queueEntryRepository;
        this.realtimeStore = realtimeStore;
    }

    /** 참가자를 순번대로 DB에 저장하고 Redis 실시간 상태를 원자적으로 생성한다. */
    @Transactional
    public QueueInitializationResponse initialize(Long meetingId, AuthenticatedUser principal) {
        User operator = currentUserService.requireActiveUser(principal);
        meetingAccessService.requireOperator(meetingId, operator);
        FanMeeting meeting = requireMeetingForUpdate(meetingId);
        if (queueEntryRepository.existsByMeeting_Id(meetingId) || realtimeStore.isInitialized(meetingId)) {
            throw new BusinessException(ErrorCode.QUEUE_ALREADY_INITIALIZED);
        }

        List<QueueEntry> entries = createEntries(meeting);
        initializeRealtimeState(meetingId, entries);
        return new QueueInitializationResponse(meetingId, entries.size());
    }

    /**
     * 추첨 트랜잭션 안에서 방금 확정된 참가자로 대기열을 초기화한다.
     *
     * <p>외부 HTTP로 노출하지 않는 내부 진입점이며 호출 시점에 이미 운영 권한 검증과
     * 팬미팅 잠금이 끝나 있어야 한다. 호출자의 트랜잭션에 반드시 참여해 추첨과 대기열 생성이
     * 함께 성공하거나 함께 취소되도록 한다. 이미 대기열이 있으면 기존 데이터를 삭제하거나
     * 재동기화하지 않고 거부한다.
     *
     * @param meeting 대기열을 초기화할 팬미팅
     * @return 생성된 대기열 항목 수
     * @throws BusinessException 이미 초기화된 대기열이거나 초기화할 참가자가 없는 경우
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public QueueInitializationResponse initializeAfterDraw(FanMeeting meeting) {
        Long meetingId = meeting.getId();
        if (queueEntryRepository.existsByMeeting_Id(meetingId) || realtimeStore.isInitialized(meetingId)) {
            throw new BusinessException(ErrorCode.QUEUE_ALREADY_INITIALIZED);
        }
        List<QueueEntry> entries = createEntries(meeting);
        initializeRealtimeState(meetingId, entries);
        return new QueueInitializationResponse(meetingId, entries.size());
    }

    /**
     * 확정 참가자의 최초 대기실 입장 시 DB 대기열과 Redis 실시간 상태를 준비한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param fanId 입장을 요청한 팬 식별자
     * @return 생성 또는 복구된 대기열 항목 수
     * @throws BusinessException 참가자가 아니거나 팬미팅과 참가자 데이터가 없는 경우
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public QueueInitializationResponse ensureInitializedForParticipant(
            Long meetingId, Long fanId
    ) {
        participantRepository.findByMeeting_IdAndFan_Id(meetingId, fanId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTICIPANT_NOT_FOUND));
        FanMeeting meeting = requireMeetingForUpdate(meetingId);
        List<QueueEntry> entries = queueEntryRepository
                .findByMeeting_IdOrderByQueuePositionAsc(meetingId);
        if (entries.isEmpty()) {
            entries = createEntries(meeting);
        }
        if (!realtimeStore.isInitialized(meetingId)) {
            initializeRealtimeState(meetingId, entries);
        }
        return new QueueInitializationResponse(meetingId, entries.size());
    }

    /**
     * 팬미팅 행을 비관적 잠금으로 조회해 동일 팬미팅의 동시 초기화를 직렬화한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 잠금이 적용된 팬미팅
     * @throws BusinessException 팬미팅이 존재하지 않는 경우
     */
    private FanMeeting requireMeetingForUpdate(Long meetingId) {
        return fanMeetingRepository.findByIdForUpdate(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /**
     * 참가 순번 기준으로 DB 대기열 항목을 생성한다.
     *
     * @param meeting 대기열을 생성할 팬미팅
     * @return DB에 저장된 대기열 항목 목록
     * @throws BusinessException 초기화할 참가자가 없는 경우
     */
    private List<QueueEntry> createEntries(FanMeeting meeting) {
        List<Participant> participants = participantRepository
                .findByMeeting_IdOrderByAssignedOrderAsc(meeting.getId());
        if (participants.isEmpty()) {
            throw new BusinessException(ErrorCode.NO_PARTICIPANTS);
        }
        List<QueueEntry> entries = participants.stream()
                .map(participant -> QueueEntry.create(meeting, participant))
                .toList();
        return queueEntryRepository.saveAllAndFlush(entries);
    }

    /**
     * DB 대기열 항목을 Redis 실시간 대기열에 원자적으로 등록한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param entries Redis에 등록할 대기열 항목
     * @throws BusinessException 이미 Redis 초기화가 완료된 경우
     */
    private void initializeRealtimeState(Long meetingId, List<QueueEntry> entries) {
        long initialized = realtimeStore.initialize(meetingId, entries);
        if (initialized != entries.size()) {
            throw new BusinessException(ErrorCode.QUEUE_ALREADY_INITIALIZED);
        }
    }
}
