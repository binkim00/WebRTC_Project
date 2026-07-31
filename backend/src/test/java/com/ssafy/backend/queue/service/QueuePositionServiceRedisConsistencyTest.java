package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueuePositionChangeRequest;
import com.ssafy.backend.queue.dto.QueuePositionChangeResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.redis.QueueRedisKeys;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.queue.support.QueueRedisTestSupport;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 순서 이동 서비스가 실제 Redis Sorted Set과 대기열 항목의 순번을 일치시키는지 검증한다.
 *
 * <p>Redis는 이 세션 전용 database 5에 실제로 접속하고 DB 계층만 mock 저장소로 대체하여
 * Lua 스크립트 실행 결과와 엔티티 순번을 직접 비교한다.
 */
class QueuePositionServiceRedisConsistencyTest {
    private static final Long MEETING_ID = 990101L;
    private static final AuthenticatedUser PRINCIPAL =
            new AuthenticatedUser(20L, UserRole.MANAGER);
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 30, 12, 0);

    private StringRedisTemplate redisTemplate;
    private QueueRealtimeStore realtimeStore;
    private QueueEntryRepository entryRepository;
    private QueuePositionService service;

    /** 실제 Redis에 연결하고 mock DB 저장소로 순서 이동 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        redisTemplate = QueueRedisTestSupport.connect();
        assumeTrue(QueueRedisTestSupport.isAvailable(redisTemplate),
                "로컬 Redis(localhost:6379 database 5)가 없어 실제 Redis 검증을 건너뛴다.");
        deleteTestKeys();
        realtimeStore = new QueueRealtimeStore(redisTemplate);
        entryRepository = mock(QueueEntryRepository.class);
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        MeetingAccessService meetingAccessService = mock(MeetingAccessService.class);
        User manager = mock(User.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(manager);
        when(meetingAccessService.requireManager(MEETING_ID, manager))
                .thenReturn(mock(FanMeeting.class));
        service = new QueuePositionService(currentUserService, meetingAccessService,
                entryRepository, realtimeStore,
                Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(),
                        ZoneId.systemDefault()));
    }

    /** 테스트가 사용한 Redis Key만 삭제하고 연결을 닫는다. */
    @AfterEach
    void tearDown() {
        if (redisTemplate == null) {
            return;
        }
        if (QueueRedisTestSupport.isAvailable(redisTemplate)) {
            deleteTestKeys();
        }
        QueueRedisTestSupport.close(redisTemplate);
    }

    /** 순서 이동 후 Redis 순번과 대기열 항목 순번이 모두 일치하는지 검증한다. */
    @Test
    void keepsRedisAndEntryPositionsConsistentAfterMove() {
        List<QueueEntry> entries = List.of(
                waitingEntry(11L, 1), waitingEntry(12L, 2),
                waitingEntry(13L, 3), waitingEntry(14L, 4));
        givenInitializedQueue(entries);

        QueuePositionChangeResponse response =
                service.changePosition(14L, new QueuePositionChangeRequest(2), PRINCIPAL);

        assertThat(response.previousPosition()).isEqualTo(4);
        assertThat(response.newPosition()).isEqualTo(2);
        assertRedisMatchesEntries(entries);
        assertThat(realtimeStore.getPosition(MEETING_ID, 14L)).isEqualTo(2);
        assertThat(realtimeStore.getPosition(MEETING_ID, 12L)).isEqualTo(3);
        assertThat(realtimeStore.getPosition(MEETING_ID, 13L)).isEqualTo(4);
    }

    /** 순번을 생략한 마지막 이동에서도 Redis와 대기열 항목 순번이 일치하는지 검증한다. */
    @Test
    void keepsRedisAndEntryPositionsConsistentAfterMoveToLast() {
        List<QueueEntry> entries = List.of(
                waitingEntry(11L, 1), waitingEntry(12L, 2), waitingEntry(13L, 3));
        givenInitializedQueue(entries);

        QueuePositionChangeResponse response = service.moveEntry(MEETING_ID, 11L, null);

        assertThat(response.newPosition()).isEqualTo(3);
        assertRedisMatchesEntries(entries);
        assertThat(realtimeStore.getPosition(MEETING_ID, 11L)).isEqualTo(3);
    }

    /** 통화 중·완료 참가자의 Redis 순번이 이동 후에도 유지되는지 검증한다. */
    @Test
    void keepsNonMovableEntryPositionsInRedis() {
        QueueEntry done = entryWithStatus(11L, 1, QueueEntryStatus.DONE);
        QueueEntry inCall = entryWithStatus(12L, 2, QueueEntryStatus.IN_CALL);
        QueueEntry waitingThird = waitingEntry(13L, 3);
        QueueEntry waitingFourth = waitingEntry(14L, 4);
        List<QueueEntry> entries = List.of(done, inCall, waitingThird, waitingFourth);
        givenInitializedQueue(entries);

        service.changePosition(14L, new QueuePositionChangeRequest(3), PRINCIPAL);

        assertRedisMatchesEntries(entries);
        assertThat(realtimeStore.getPosition(MEETING_ID, 11L)).isEqualTo(1);
        assertThat(realtimeStore.getPosition(MEETING_ID, 12L)).isEqualTo(2);
        assertThat(realtimeStore.getPosition(MEETING_ID, 14L)).isEqualTo(3);
        assertThat(realtimeStore.getPosition(MEETING_ID, 13L)).isEqualTo(4);
    }

    /**
     * DB 반영이 실패하면 실제 Redis 순번을 이동 전 값으로 되돌리는지 검증한다.
     *
     * <p>운영에서는 같은 트랜잭션의 엔티티 변경도 롤백되므로 되돌린 Redis 순번이
     * DB에 남는 순번과 같아진다.
     */
    @Test
    void restoresRedisPositionsWhenDatabaseUpdateFails() {
        List<QueueEntry> entries = List.of(
                waitingEntry(11L, 1), waitingEntry(12L, 2), waitingEntry(13L, 3));
        givenInitializedQueue(entries);
        doThrow(new IllegalStateException("DB 반영 실패")).when(entryRepository).flush();

        assertThatThrownBy(() ->
                service.changePosition(13L, new QueuePositionChangeRequest(1), PRINCIPAL))
                .isInstanceOf(BusinessException.class);

        assertThat(realtimeStore.getPosition(MEETING_ID, 11L)).isEqualTo(1);
        assertThat(realtimeStore.getPosition(MEETING_ID, 12L)).isEqualTo(2);
        assertThat(realtimeStore.getPosition(MEETING_ID, 13L)).isEqualTo(3);
    }

    /**
     * 대기열을 실제 Redis에 초기화하고 잠금 조회 결과를 준비한다.
     *
     * @param entries 팬미팅의 전체 대기열 항목
     */
    private void givenInitializedQueue(List<QueueEntry> entries) {
        realtimeStore.initialize(MEETING_ID, entries);
        entries.forEach(queueEntry ->
                when(entryRepository.findById(queueEntry.getId()))
                        .thenReturn(Optional.of(queueEntry)));
        when(entryRepository.findAllByMeetingIdOrderByIdForUpdate(MEETING_ID)).thenReturn(entries);
    }

    /**
     * 모든 대기열 항목의 순번이 Redis Sorted Set 점수와 같은지 확인한다.
     *
     * @param entries 확인할 대기열 항목
     */
    private void assertRedisMatchesEntries(List<QueueEntry> entries) {
        for (QueueEntry queueEntry : entries) {
            assertThat(realtimeStore.getPosition(MEETING_ID, queueEntry.getId()))
                    .as("대기열 항목 %d 의 Redis 순번", queueEntry.getId())
                    .isEqualTo(queueEntry.getQueuePosition());
        }
    }

    /**
     * 대기 상태의 대기열 항목을 만든다.
     *
     * @param entryId 대기열 항목 식별자
     * @param position 초기 대기 순번
     * @return 대기 상태 대기열 항목
     */
    private QueueEntry waitingEntry(long entryId, int position) {
        return entryWithStatus(entryId, position, QueueEntryStatus.WAITING);
    }

    /**
     * 지정한 상태와 순번을 가진 대기열 항목을 만든다.
     *
     * @param entryId 대기열 항목 식별자
     * @param position 초기 대기 순번
     * @param status 대기열 상태
     * @return 조건에 맞는 대기열 항목
     */
    private QueueEntry entryWithStatus(long entryId, int position, QueueEntryStatus status) {
        FanMeeting meeting = mock(FanMeeting.class);
        when(meeting.getId()).thenReturn(MEETING_ID);
        Participant participant = mock(Participant.class);
        when(participant.getAssignedOrder()).thenReturn(position);
        QueueEntry queueEntry = QueueEntry.create(meeting, participant);
        ReflectionTestUtils.setField(queueEntry, "id", entryId);
        ReflectionTestUtils.setField(queueEntry, "status", status);
        return queueEntry;
    }

    /** 테스트가 사용한 대기열 Key를 삭제한다. */
    private void deleteTestKeys() {
        redisTemplate.delete(List.of(
                QueueRedisKeys.initialized(MEETING_ID),
                QueueRedisKeys.order(MEETING_ID),
                QueueRedisKeys.status(MEETING_ID),
                QueueRedisKeys.current(MEETING_ID)
        ));
    }
}
