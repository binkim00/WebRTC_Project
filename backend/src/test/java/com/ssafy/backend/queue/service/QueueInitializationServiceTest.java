package com.ssafy.backend.queue.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueInitializationResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QueueInitializationServiceTest {

    /** 최초 참가자 입장 시 참가 순번으로 DB와 Redis 대기열을 생성하는지 검증한다. */
    @SuppressWarnings("unchecked")
    @Test
    void initializesQueueOnFirstParticipantEntry() {
        TestFixture fixture = new TestFixture();
        FanMeeting meeting = mock(FanMeeting.class);
        Participant participant = mock(Participant.class);
        when(meeting.getId()).thenReturn(1L);
        when(participant.getAssignedOrder()).thenReturn(3);
        when(fixture.participantRepository.findByMeeting_IdAndFan_Id(1L, 10L))
                .thenReturn(Optional.of(participant));
        when(fixture.meetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(fixture.queueEntryRepository.findByMeeting_IdOrderByQueuePositionAsc(1L))
                .thenReturn(List.of());
        when(fixture.participantRepository.findByMeeting_IdOrderByAssignedOrderAsc(1L))
                .thenReturn(List.of(participant));
        when(fixture.queueEntryRepository.saveAllAndFlush(anyList()))
                .thenAnswer(invocation -> {
                    List<QueueEntry> entries = invocation.getArgument(0);
                    ReflectionTestUtils.setField(entries.get(0), "id", 7L);
                    return entries;
                });
        when(fixture.realtimeStore.isInitialized(1L)).thenReturn(false);
        when(fixture.realtimeStore.initialize(org.mockito.ArgumentMatchers.eq(1L), anyList()))
                .thenReturn(1L);

        QueueInitializationResponse response = fixture.service
                .ensureInitializedForParticipant(1L, 10L);

        ArgumentCaptor<List<QueueEntry>> entriesCaptor = ArgumentCaptor.forClass(List.class);
        verify(fixture.queueEntryRepository).saveAllAndFlush(entriesCaptor.capture());
        QueueEntry created = entriesCaptor.getValue().get(0);
        assertThat(created.getQueuePosition()).isEqualTo(3);
        assertThat(created.getStatus()).isEqualTo(QueueEntryStatus.NOT_ENTERED);
        verify(fixture.realtimeStore).initialize(1L, entriesCaptor.getValue());
        assertThat(response.initializedCount()).isEqualTo(1);
    }

    /** DB 대기열이 존재하고 Redis만 비어 있으면 DB 상태로 Redis를 복구하는지 검증한다. */
    @Test
    void restoresRedisFromExistingDatabaseQueue() {
        TestFixture fixture = new TestFixture();
        FanMeeting meeting = mock(FanMeeting.class);
        Participant participant = mock(Participant.class);
        QueueEntry entry = mock(QueueEntry.class);
        when(fixture.participantRepository.findByMeeting_IdAndFan_Id(1L, 10L))
                .thenReturn(Optional.of(participant));
        when(fixture.meetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(fixture.queueEntryRepository.findByMeeting_IdOrderByQueuePositionAsc(1L))
                .thenReturn(List.of(entry));
        when(fixture.realtimeStore.isInitialized(1L)).thenReturn(false);
        when(fixture.realtimeStore.initialize(1L, List.of(entry))).thenReturn(1L);

        fixture.service.ensureInitializedForParticipant(1L, 10L);

        verify(fixture.queueEntryRepository, never()).saveAllAndFlush(anyList());
        verify(fixture.realtimeStore).initialize(1L, List.of(entry));
    }

    /** 확정 참가자가 아닌 팬은 대기열 초기화를 시작할 수 없는지 검증한다. */
    @Test
    void rejectsInitializationByNonParticipant() {
        TestFixture fixture = new TestFixture();
        when(fixture.participantRepository.findByMeeting_IdAndFan_Id(1L, 10L))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> fixture.service.ensureInitializedForParticipant(1L, 10L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.PARTICIPANT_NOT_FOUND));

        verify(fixture.meetingRepository, never()).findByIdForUpdate(1L);
    }

    /** 테스트마다 초기화 서비스와 협력 객체를 동일한 구성으로 제공한다. */
    private static class TestFixture {
        private final CurrentUserService currentUserService = mock(CurrentUserService.class);
        private final MeetingAccessService meetingAccessService = mock(MeetingAccessService.class);
        private final FanMeetingRepository meetingRepository = mock(FanMeetingRepository.class);
        private final ParticipantRepository participantRepository = mock(ParticipantRepository.class);
        private final QueueEntryRepository queueEntryRepository = mock(QueueEntryRepository.class);
        private final QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        private final QueueInitializationService service = new QueueInitializationService(
                currentUserService,
                meetingAccessService,
                meetingRepository,
                participantRepository,
                queueEntryRepository,
                realtimeStore
        );
    }
}
