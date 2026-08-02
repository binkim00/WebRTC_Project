package com.ssafy.backend.participant.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.dto.ParticipantSummaryResponse;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.BeanUtils;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ParticipantQueryServiceTest {

    private static final AuthenticatedUser MANAGER_PRINCIPAL =
            new AuthenticatedUser(10L, UserRole.MANAGER);

    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private ParticipantRepository participantRepository;
    private QueueEntryRepository queueEntryRepository;
    private ParticipantQueryService service;
    private User manager;
    private FanMeeting meeting;

    /** 각 테스트마다 협력 객체를 새로 만들고 운영자 권한 검증이 성공하도록 준비한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        participantRepository = mock(ParticipantRepository.class);
        queueEntryRepository = mock(QueueEntryRepository.class);
        service = new ParticipantQueryService(currentUserService, meetingAccessService,
                participantRepository, queueEntryRepository);

        manager = user(10L, "manager", "테스트매니저", UserRole.MANAGER);
        meeting = meeting(1L, user(20L, "influencer", "인플루언서", UserRole.INFLUENCER));
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(manager);
        when(meetingAccessService.requireOperator(1L, manager)).thenReturn(meeting);
    }

    /** 참가자 목록이 배정 순번 정보와 대기열 상태를 포함해 반환되는지 검증한다. */
    @Test
    void returnsParticipantsWithQueueStatus() {
        Participant first = participant(100L, meeting, user(30L, "fan1", "첫째팬", UserRole.FAN),
                "READY", 1);
        Participant second = participant(101L, meeting, user(31L, "fan2", "둘째팬", UserRole.FAN),
                "READY", 2);
        when(participantRepository.searchByMeeting(eq(1L), eq(""), eq(""), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(first, second), PageRequest.of(0, 20), 2));
        when(queueEntryRepository.findByMeeting_IdOrderByQueuePositionAsc(1L)).thenReturn(List.of(
                queueEntry(first, QueueEntryStatus.IN_CALL),
                queueEntry(second, QueueEntryStatus.WAITING)
        ));

        PageResponse<ParticipantSummaryResponse> response =
                service.getParticipants(1L, null, null, 0, 20, MANAGER_PRINCIPAL);

        assertThat(response.content()).hasSize(2);
        assertThat(response.content().get(0)).isEqualTo(new ParticipantSummaryResponse(
                100L, 30L, "첫째팬", null, 1, "READY", "IN_CALL"));
        assertThat(response.content().get(1).queueStatus()).isEqualTo("WAITING");
        assertThat(response.totalElements()).isEqualTo(2L);
        assertThat(response.page()).isZero();
        assertThat(response.size()).isEqualTo(20);
    }

    /** 통화가 끝난 대기열 상태가 운영 API와 동일하게 COMPLETED로 노출되는지 검증한다. */
    @Test
    void exposesDoneQueueStatusAsCompleted() {
        Participant participant = participant(100L, meeting,
                user(30L, "fan1", "첫째팬", UserRole.FAN), "READY", 1);
        when(participantRepository.searchByMeeting(eq(1L), eq(""), eq(""), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(participant), PageRequest.of(0, 20), 1));
        when(queueEntryRepository.findByMeeting_IdOrderByQueuePositionAsc(1L))
                .thenReturn(List.of(queueEntry(participant, QueueEntryStatus.DONE)));

        PageResponse<ParticipantSummaryResponse> response =
                service.getParticipants(1L, null, null, 0, 20, MANAGER_PRINCIPAL);

        assertThat(response.content().get(0).queueStatus()).isEqualTo("COMPLETED");
    }

    /** 대기열 항목이 없는 참가자의 대기열 상태가 비어 있는지 검증한다. */
    @Test
    void returnsNullQueueStatusWhenQueueEntryMissing() {
        Participant participant = participant(100L, meeting,
                user(30L, "fan1", "첫째팬", UserRole.FAN), "READY", 1);
        when(participantRepository.searchByMeeting(eq(1L), eq(""), eq(""), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(participant), PageRequest.of(0, 20), 1));
        when(queueEntryRepository.findByMeeting_IdOrderByQueuePositionAsc(1L))
                .thenReturn(List.of());

        PageResponse<ParticipantSummaryResponse> response =
                service.getParticipants(1L, null, null, 0, 20, MANAGER_PRINCIPAL);

        assertThat(response.content().get(0).queueStatus()).isNull();
    }

    /** 참가자가 없는 팬미팅에서 빈 페이지를 반환하고 대기열을 조회하지 않는지 검증한다. */
    @Test
    void returnsEmptyPageWhenNoParticipantExists() {
        when(participantRepository.searchByMeeting(eq(1L), eq(""), eq(""), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        PageResponse<ParticipantSummaryResponse> response =
                service.getParticipants(1L, null, null, 0, 20, MANAGER_PRINCIPAL);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalElements()).isZero();
        assertThat(response.hasNext()).isFalse();
        verifyNoInteractions(queueEntryRepository);
    }

    /** 검색어가 일치하지 않으면 빈 페이지가 반환되는지 검증한다. */
    @Test
    void returnsEmptyPageWhenKeywordDoesNotMatch() {
        when(participantRepository.searchByMeeting(eq(1L), eq(""), eq("없는닉네임"),
                any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        PageResponse<ParticipantSummaryResponse> response =
                service.getParticipants(1L, null, "없는닉네임", 0, 20, MANAGER_PRINCIPAL);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalPages()).isZero();
    }

    /** 상태와 검색어의 앞뒤 공백을 제거하고 빈 값은 필터 미적용으로 전달하는지 검증한다. */
    @Test
    void normalizesStatusAndKeywordFilters() {
        when(participantRepository.searchByMeeting(anyLong(), anyString(), anyString(),
                any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 6), 0));

        service.getParticipants(1L, "  READY  ", "   ", 0, 6, MANAGER_PRINCIPAL);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(participantRepository)
                .searchByMeeting(eq(1L), eq("READY"), eq(""), pageable.capture());
        assertThat(pageable.getValue().getPageNumber()).isZero();
        assertThat(pageable.getValue().getPageSize()).isEqualTo(6);
    }

    /** 허용 범위의 경계 페이지 크기가 그대로 저장소에 전달되는지 검증한다. */
    @Test
    void acceptsBoundaryPageSizes() {
        when(participantRepository.searchByMeeting(anyLong(), anyString(), anyString(),
                any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 1), 0));

        for (int size : new int[]{1, 6, 100}) {
            service.getParticipants(1L, null, null, 0, size, MANAGER_PRINCIPAL);
            verify(participantRepository).searchByMeeting(eq(1L), eq(""), eq(""),
                    eq(PageRequest.of(0, size)));
        }
    }

    /** 음수 페이지 번호를 잘못된 요청으로 거부하는지 검증한다. */
    @Test
    void rejectsNegativePage() {
        assertThatThrownBy(() -> service.getParticipants(1L, null, null, -1, 20, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);
    }

    /** 허용 범위를 벗어난 페이지 크기를 잘못된 요청으로 거부하는지 검증한다. */
    @Test
    void rejectsOutOfRangePageSize() {
        assertThatThrownBy(() -> service.getParticipants(1L, null, null, 0, 101, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThatThrownBy(() -> service.getParticipants(1L, null, null, 0, 0, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        verifyNoInteractions(participantRepository);
    }

    /** 운영 권한이 없으면 참가자 목록을 조회하지 못하는지 검증한다. */
    @Test
    void rejectsNonOperatorParticipantList() {
        when(meetingAccessService.requireOperator(1L, manager))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> service.getParticipants(1L, null, null, 0, 20, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ACCESS_DENIED);
        verifyNoInteractions(participantRepository);
    }

    /** 존재하지 않는 팬미팅의 참가자 목록 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMissingMeetingParticipantList() {
        when(meetingAccessService.requireOperator(1L, manager))
                .thenThrow(new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));

        assertThatThrownBy(() -> service.getParticipants(1L, null, null, 0, 20, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND);
    }

    /** 참가자 상세 조회가 대기열 상태를 포함해 반환되는지 검증한다. */
    @Test
    void returnsParticipantDetail() {
        Participant participant = participant(100L, meeting,
                user(30L, "fan1", "첫째팬", UserRole.FAN), "READY", 3);
        when(participantRepository.findByIdAndMeeting_Id(100L, 1L))
                .thenReturn(Optional.of(participant));
        when(queueEntryRepository.findByMeeting_IdAndParticipant_Fan_Id(1L, 30L))
                .thenReturn(Optional.of(queueEntry(participant, QueueEntryStatus.CALLED)));

        ParticipantSummaryResponse response =
                service.getParticipant(1L, 100L, MANAGER_PRINCIPAL);

        assertThat(response).isEqualTo(new ParticipantSummaryResponse(
                100L, 30L, "첫째팬", null, 3, "READY", "CALLED"));
    }

    /** 다른 팬미팅의 참가자 식별자로 상세 조회하면 거부되는지 검증한다. */
    @Test
    void rejectsParticipantFromAnotherMeeting() {
        when(participantRepository.findByIdAndMeeting_Id(999L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getParticipant(1L, 999L, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PARTICIPANT_NOT_IN_MEETING);
    }

    /** 운영 권한이 없으면 참가자 상세를 조회하지 못하는지 검증한다. */
    @Test
    void rejectsNonOperatorParticipantDetail() {
        when(meetingAccessService.requireOperator(1L, manager))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> service.getParticipant(1L, 100L, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ACCESS_DENIED);
        verifyNoInteractions(participantRepository);
    }

    /** 테스트에 사용할 활성 사용자를 만든다. */
    private User user(Long id, String loginId, String nickname, UserRole role) {
        User user = User.createActive(loginId, loginId + "@melly.test", "encoded", nickname,
                role, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    /** 테스트에 사용할 팬미팅을 만든다. */
    private FanMeeting meeting(Long id, User influencer) {
        FanMeeting meeting = BeanUtils.instantiateClass(FanMeeting.class);
        ReflectionTestUtils.setField(meeting, "id", id);
        ReflectionTestUtils.setField(meeting, "influencer", influencer);
        return meeting;
    }

    /** 테스트에 사용할 참가자를 만든다. */
    private Participant participant(Long id, FanMeeting meeting, User fan, String status,
                                    int assignedOrder) {
        Participant participant = BeanUtils.instantiateClass(Participant.class);
        ReflectionTestUtils.setField(participant, "id", id);
        ReflectionTestUtils.setField(participant, "meeting", meeting);
        ReflectionTestUtils.setField(participant, "fan", fan);
        ReflectionTestUtils.setField(participant, "status", status);
        ReflectionTestUtils.setField(participant, "assignedOrder", assignedOrder);
        return participant;
    }

    /** 테스트에 사용할 대기열 항목을 만든다. */
    private QueueEntry queueEntry(Participant participant, QueueEntryStatus status) {
        QueueEntry entry = BeanUtils.instantiateClass(QueueEntry.class);
        ReflectionTestUtils.setField(entry, "participant", participant);
        ReflectionTestUtils.setField(entry, "status", status);
        return entry;
    }
}
