package com.ssafy.backend.meeting.service;

import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.meeting.dto.FanMeetingDetailResponse;
import com.ssafy.backend.meeting.dto.FanMeetingSummaryResponse;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Root;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FanMeetingQueryServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-30T00:00:00Z");

    private CurrentUserService currentUserService;
    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private MeetingOperationSettingRepository operationSettingRepository;
    private ApplicationRepository applicationRepository;
    private ParticipantRepository participantRepository;
    private FanMeetingQueryService queryService;

    /** 각 테스트에서 사용할 저장소와 고정 시각 기반 조회 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationSettingRepository = mock(MeetingApplicationSettingRepository.class);
        operationSettingRepository = mock(MeetingOperationSettingRepository.class);
        applicationRepository = mock(ApplicationRepository.class);
        participantRepository = mock(ParticipantRepository.class);
        queryService = new FanMeetingQueryService(
                currentUserService,
                fanMeetingRepository,
                applicationSettingRepository,
                operationSettingRepository,
                applicationRepository,
                participantRepository,
                Clock.fixed(NOW, SEOUL)
        );
    }

    /** 익명 사용자가 초안 팬미팅 상세를 조회할 때 존재하지 않는 것처럼 처리하는지 검증한다. */
    @Test
    void hidesDraftDetailFromAnonymousViewer() {
        FanMeeting meeting = meeting(mock(User.class));
        when(fanMeetingRepository.findById(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> queryService.getDetail(1L, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 응모 중인 팬미팅을 아직 응모하지 않은 팬이 조회하면 응모 가능 상태인지 검증한다. */
    @Test
    void allowsFanToApplyDuringOpenPeriod() {
        User influencer = mock(User.class);
        when(influencer.getId()).thenReturn(10L);
        when(influencer.getNickname()).thenReturn("인플루언서");
        FanMeeting meeting = meeting(influencer);
        meeting.publish(LocalDateTime.now(Clock.fixed(NOW, SEOUL)).minusDays(2));
        meeting.openApplications();

        LocalDateTime now = LocalDateTime.now(Clock.fixed(NOW, SEOUL));
        MeetingApplicationSetting application = MeetingApplicationSetting.create(
                meeting, true, now.minusDays(1), now.plusDays(1), now.plusDays(2), 20
        );
        MeetingOperationSetting operation = MeetingOperationSetting.create(
                meeting, now.plusHours(1), 120, true, true, 60, 30, 1
        );
        User fan = mock(User.class);
        when(fan.getId()).thenReturn(20L);
        when(fan.getRole()).thenReturn(UserRole.FAN);
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.FAN);

        when(fanMeetingRepository.findById(1L)).thenReturn(Optional.of(meeting));
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.of(application));
        when(operationSettingRepository.findById(1L)).thenReturn(Optional.of(operation));
        when(applicationRepository.findByMeeting_IdAndFan_Id(1L, 20L))
                .thenReturn(Optional.empty());
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 20L))
                .thenReturn(Optional.empty());

        FanMeetingDetailResponse response = queryService.getDetail(1L, principal);

        assertThat(response.viewer().canApply()).isTrue();
        assertThat(response.viewer().canEnter()).isFalse();
        assertThat(response.viewer().applicationStatus()).isNull();
    }

    /** 취소 상태의 응모가 있는 팬에게 응모 기간 중 재응모 가능 상태를 제공하는지 검증한다. */
    @Test
    void allowsWithdrawnFanToReapplyDuringOpenPeriod() {
        User influencer = mock(User.class);
        when(influencer.getId()).thenReturn(10L);
        when(influencer.getNickname()).thenReturn("인플루언서");
        FanMeeting meeting = meeting(influencer);
        meeting.publish(LocalDateTime.now(Clock.fixed(NOW, SEOUL)).minusDays(2));
        meeting.openApplications();

        LocalDateTime now = LocalDateTime.now(Clock.fixed(NOW, SEOUL));
        MeetingApplicationSetting applicationSetting = MeetingApplicationSetting.create(
                meeting, true, now.minusDays(1), now.plusDays(1), now.plusDays(2), 20
        );
        MeetingOperationSetting operation = MeetingOperationSetting.create(
                meeting, now.plusHours(1), 120, true, true, 60, 30, 1
        );
        User fan = mock(User.class);
        when(fan.getId()).thenReturn(20L);
        when(fan.getRole()).thenReturn(UserRole.FAN);
        Application withdrawn = Application.submit(meeting, fan, now.minusHours(2));
        withdrawn.withdraw(now.minusHours(1));
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.FAN);

        when(fanMeetingRepository.findById(1L)).thenReturn(Optional.of(meeting));
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.of(applicationSetting));
        when(operationSettingRepository.findById(1L)).thenReturn(Optional.of(operation));
        when(applicationRepository.findByMeeting_IdAndFan_Id(1L, 20L))
                .thenReturn(Optional.of(withdrawn));
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 20L))
                .thenReturn(Optional.empty());

        FanMeetingDetailResponse response = queryService.getDetail(1L, principal);

        assertThat(response.viewer().applicationStatus()).isEqualTo(ApplicationStatus.WITHDRAWN);
        assertThat(response.viewer().canApply()).isTrue();
    }

    /** 공개 목록에서 초안 상태 필터를 요청하면 잘못된 요청으로 거부하는지 검증한다. */
    @Test
    void rejectsPrivateStatusFromPublicList() {
        assertThatThrownBy(() -> queryService.getPublicMeetings(
                null, FanMeetingStatus.DRAFT, 0, 20, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_REQUEST));
    }

    /** 매니저의 담당 팬미팅 목록이 매니저 소유 조건과 최신 일정순으로 조회되는지 검증한다. */
    @Test
    void listsManagerOwnedMeetingsOrderedByScheduleDescending() {
        User influencer = mock(User.class);
        when(influencer.getNickname()).thenReturn("인플루언서");
        FanMeeting meeting = meeting(influencer);
        User manager = mock(User.class);
        when(manager.getId()).thenReturn(30L);
        when(manager.getRole()).thenReturn(UserRole.MANAGER);
        AuthenticatedUser principal = new AuthenticatedUser(30L, UserRole.MANAGER);

        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.empty());
        when(applicationRepository.countByMeeting_IdAndStatusNot(
                1L, ApplicationStatus.WITHDRAWN)).thenReturn(7L);
        when(participantRepository.countByMeeting_Id(1L)).thenReturn(3L);
        stubOwnedPage(List.of(meeting));

        PageResponse<FanMeetingSummaryResponse> response =
                queryService.getMyMeetings(null, 0, 20, principal);

        assertThat(response.content()).hasSize(1);
        FanMeetingSummaryResponse summary = response.content().get(0);
        assertThat(summary.meetingId()).isEqualTo(1L);
        assertThat(summary.status()).isEqualTo(FanMeetingStatus.DRAFT);
        assertThat(summary.influencerName()).isEqualTo("인플루언서");
        assertThat(summary.applicationCount()).isEqualTo(7L);
        assertThat(summary.participantCount()).isEqualTo(3L);
        Pageable pageable = capturedPageable();
        assertThat(pageable.getSort()).isEqualTo(Sort.by(Sort.Direction.DESC, "scheduledStartAt"));
        assertThat(pageable.getPageNumber()).isZero();
        assertThat(pageable.getPageSize()).isEqualTo(20);

        Root<FanMeeting> root = mock(Root.class);
        applyOwnedSpecification(root, null);
        verify(root).get("manager");
        verify(root).get("deletedAt");
        verify(root, never()).get("influencer");
        verify(root, never()).get("status");
    }

    /** 인플루언서의 담당 팬미팅 목록이 진행자 소유 조건으로 조회되는지 검증한다. */
    @Test
    void listsInfluencerOwnedMeetings() {
        User influencer = mock(User.class);
        when(influencer.getId()).thenReturn(10L);
        when(influencer.getRole()).thenReturn(UserRole.INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.INFLUENCER);

        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);
        stubOwnedPage(List.of());

        PageResponse<FanMeetingSummaryResponse> response =
                queryService.getMyMeetings(null, 0, 20, principal);

        assertThat(response.content()).isEmpty();
        Root<FanMeeting> root = applyOwnedSpecificationRoot(null);
        verify(root).get("influencer");
    }

    /** 1인 인플루언서의 담당 팬미팅 목록도 진행자 소유 조건으로 조회되는지 검증한다. */
    @Test
    void listsSoloInfluencerOwnedMeetings() {
        User solo = mock(User.class);
        when(solo.getId()).thenReturn(11L);
        when(solo.getRole()).thenReturn(UserRole.SOLO_INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(11L, UserRole.SOLO_INFLUENCER);

        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        stubOwnedPage(List.of());

        queryService.getMyMeetings(null, 0, 20, principal);

        Root<FanMeeting> root = applyOwnedSpecificationRoot(null);
        verify(root).get("influencer");
        verify(root, never()).get("manager");
    }

    /** 상태 필터를 지정하면 담당 팬미팅 조건에 상태 비교가 추가되는지 검증한다. */
    @Test
    void appliesStatusFilterToMyMeetings() {
        User manager = mock(User.class);
        when(manager.getId()).thenReturn(30L);
        when(manager.getRole()).thenReturn(UserRole.MANAGER);
        AuthenticatedUser principal = new AuthenticatedUser(30L, UserRole.MANAGER);

        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);
        stubOwnedPage(List.of());

        queryService.getMyMeetings(FanMeetingStatus.READY, 0, 20, principal);

        Root<FanMeeting> root = mock(Root.class);
        CriteriaBuilder builder = applyOwnedSpecification(root, FanMeetingStatus.READY);
        verify(root).get("status");
        verify(builder).equal(any(Path.class), eq(FanMeetingStatus.READY));
    }

    /** 팬 역할 사용자의 담당 팬미팅 목록 조회를 권한 오류로 거부하는지 검증한다. */
    @Test
    void rejectsMyMeetingsForFanRole() {
        User fan = mock(User.class);
        when(fan.getRole()).thenReturn(UserRole.FAN);
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.FAN);
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);

        assertThatThrownBy(() -> queryService.getMyMeetings(null, 0, 20, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));
    }

    /** 허용 범위를 벗어난 페이지 값의 담당 팬미팅 목록 요청을 거부하는지 검증한다. */
    @Test
    void rejectsMyMeetingsWithInvalidPaging() {
        AuthenticatedUser principal = new AuthenticatedUser(30L, UserRole.MANAGER);

        assertThatThrownBy(() -> queryService.getMyMeetings(null, -1, 20, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
        assertThatThrownBy(() -> queryService.getMyMeetings(null, 0, 101, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
    }

    /** 담당 팬미팅이 없으면 빈 페이지와 0건 집계를 반환하는지 검증한다. */
    @Test
    void returnsEmptyPageWhenOperatorHasNoMeetings() {
        User manager = mock(User.class);
        when(manager.getId()).thenReturn(30L);
        when(manager.getRole()).thenReturn(UserRole.MANAGER);
        AuthenticatedUser principal = new AuthenticatedUser(30L, UserRole.MANAGER);

        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);
        stubOwnedPage(List.of());

        PageResponse<FanMeetingSummaryResponse> response =
                queryService.getMyMeetings(null, 0, 20, principal);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalElements()).isZero();
        assertThat(response.totalPages()).isZero();
        assertThat(response.hasNext()).isFalse();
    }

    /** 담당 팬미팅 목록 조회가 주어진 팬미팅 페이지를 반환하도록 대역을 설정한다. */
    @SuppressWarnings("unchecked")
    private void stubOwnedPage(List<FanMeeting> meetings) {
        when(fanMeetingRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenAnswer(invocation -> new PageImpl<>(
                        meetings, invocation.getArgument(1), meetings.size()
                ));
    }

    /** 담당 팬미팅 목록 조회에 전달된 페이지 요청을 가져온다. */
    @SuppressWarnings("unchecked")
    private Pageable capturedPageable() {
        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(fanMeetingRepository).findAll(any(Specification.class), captor.capture());
        return captor.getValue();
    }

    /**
     * 담당 팬미팅 조건을 주어진 Root 대역에 적용하고 사용한 빌더를 반환한다.
     *
     * @param root 조건을 적용할 Root 대역
     * @param status 상태 필터이며 전체 조회면 null
     * @return 조건 생성에 사용된 CriteriaBuilder 대역
     */
    @SuppressWarnings("unchecked")
    private CriteriaBuilder applyOwnedSpecification(Root<FanMeeting> root,
                                                    FanMeetingStatus status) {
        ArgumentCaptor<Specification<FanMeeting>> captor =
                ArgumentCaptor.forClass(Specification.class);
        verify(fanMeetingRepository).findAll(captor.capture(), any(Pageable.class));

        Path<Object> path = mock(Path.class);
        when(root.get(anyString())).thenReturn(path);
        when(path.get(anyString())).thenReturn(path);
        CriteriaBuilder builder = mock(CriteriaBuilder.class);

        captor.getValue().toPredicate(root, mock(CriteriaQuery.class), builder);
        return builder;
    }

    /**
     * 담당 팬미팅 조건을 새 Root 대역에 적용하고 그 Root를 반환한다.
     *
     * @param status 상태 필터이며 전체 조회면 null
     * @return 조건 생성에 사용된 Root 대역
     */
    @SuppressWarnings("unchecked")
    private Root<FanMeeting> applyOwnedSpecificationRoot(FanMeetingStatus status) {
        Root<FanMeeting> root = mock(Root.class);
        applyOwnedSpecification(root, status);
        return root;
    }

    /** 테스트용 초안 팬미팅을 생성하고 식별자를 설정한다. */
    private FanMeeting meeting(User influencer) {
        FanMeeting meeting = FanMeeting.create(
                null, null, influencer, "팬미팅", null, null,
                LocalDateTime.now(Clock.fixed(NOW, SEOUL)).plusDays(10)
        );
        org.springframework.test.util.ReflectionTestUtils.setField(meeting, "id", 1L);
        return meeting;
    }
}
