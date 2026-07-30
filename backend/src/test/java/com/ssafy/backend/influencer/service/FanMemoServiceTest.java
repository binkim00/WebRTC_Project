package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.influencer.dto.FanMemoContentPolicy;
import com.ssafy.backend.influencer.dto.FanMemoCreateRequest;
import com.ssafy.backend.influencer.dto.FanMemoCreateResponse;
import com.ssafy.backend.influencer.dto.FanMemoDeleteResponse;
import com.ssafy.backend.influencer.dto.FanMemoListResponse;
import com.ssafy.backend.influencer.dto.FanMemoUpdateRequest;
import com.ssafy.backend.influencer.dto.FanMemoUpdateResponse;
import com.ssafy.backend.influencer.repository.FanMemoRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.organization.domain.Organization;
import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class FanMemoServiceTest {

    private static final Long INFLUENCER_ID = 10L;
    private static final Long OTHER_INFLUENCER_ID = 11L;
    private static final Long MANAGER_ID = 20L;
    private static final Long FAN_ID = 7L;
    private static final Long MEETING_ID = 100L;
    private static final Long MEMO_ID = 1L;
    private static final Long ORGANIZATION_ID = 50L;
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 31, 12, 0);

    private FanMemoRepository fanMemoRepository;
    private UserRepository userRepository;
    private OrganizationMemberRepository organizationMemberRepository;
    private ParticipantRepository participantRepository;
    private MeetingAccessService meetingAccessService;
    private CurrentUserService currentUserService;
    private FanMemoService service;

    private AuthenticatedUser influencerPrincipal;
    private AuthenticatedUser managerPrincipal;
    private User loginInfluencer;
    private User loginManager;
    private User fan;

    /** 인플루언서·매니저·팬 사용자와 고정 시계를 갖춘 서비스를 준비한다. */
    @BeforeEach
    void setUp() {
        fanMemoRepository = mock(FanMemoRepository.class);
        userRepository = mock(UserRepository.class);
        organizationMemberRepository = mock(OrganizationMemberRepository.class);
        participantRepository = mock(ParticipantRepository.class);
        meetingAccessService = mock(MeetingAccessService.class);
        currentUserService = mock(CurrentUserService.class);
        Clock clock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        service = new FanMemoService(
                fanMemoRepository,
                userRepository,
                organizationMemberRepository,
                participantRepository,
                meetingAccessService,
                currentUserService,
                clock
        );

        influencerPrincipal = new AuthenticatedUser(INFLUENCER_ID, UserRole.INFLUENCER);
        managerPrincipal = new AuthenticatedUser(MANAGER_ID, UserRole.MANAGER);
        loginInfluencer = user(INFLUENCER_ID, UserRole.INFLUENCER);
        loginManager = user(MANAGER_ID, UserRole.MANAGER);
        fan = user(FAN_ID, UserRole.FAN);
        when(currentUserService.requireActiveUser(influencerPrincipal)).thenReturn(loginInfluencer);
        when(currentUserService.requireActiveUser(managerPrincipal)).thenReturn(loginManager);
    }

    /** 인플루언서가 자신이 작성한 메모만 최신순 페이지로 조회하는지 검증한다. */
    @Test
    void getsOwnMemosAsPage() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        FanMemo memo = savedMemo(MEMO_ID, loginInfluencer, meeting("7월 팬미팅"), "이전 대화 내용");
        when(fanMemoRepository.findByInfluencer_IdAndFan_IdAndDeletedAtIsNullOrderByCreatedAtDescIdDesc(
                eq(INFLUENCER_ID), eq(FAN_ID), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(memo), PageRequest.of(0, 20), 1));

        PageResponse<FanMemoListResponse> response = service.getMemos(FAN_ID, 0, 20, influencerPrincipal);

        assertThat(response.page()).isZero();
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.hasNext()).isFalse();
        assertThat(response.content()).singleElement().satisfies(item -> {
            assertThat(item.memoId()).isEqualTo(MEMO_ID);
            assertThat(item.meetingId()).isEqualTo(MEETING_ID);
            assertThat(item.meetingTitle()).isEqualTo("7월 팬미팅");
            assertThat(item.content()).isEqualTo("이전 대화 내용");
            assertThat(item.createdAt()).isEqualTo(NOW);
            assertThat(item.updatedAt()).isEqualTo(NOW);
        });
    }

    /** 1인 인플루언서도 자신의 메모 목록을 조회할 수 있는지 검증한다. */
    @Test
    void getsOwnMemosAsSoloInfluencer() {
        AuthenticatedUser soloPrincipal = new AuthenticatedUser(INFLUENCER_ID, UserRole.SOLO_INFLUENCER);
        User solo = user(INFLUENCER_ID, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(soloPrincipal)).thenReturn(solo);
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        when(fanMemoRepository.findByInfluencer_IdAndFan_IdAndDeletedAtIsNullOrderByCreatedAtDescIdDesc(
                eq(INFLUENCER_ID), eq(FAN_ID), any(Pageable.class)))
                .thenReturn(emptyPage());

        PageResponse<FanMemoListResponse> response = service.getMemos(FAN_ID, 0, 20, soloPrincipal);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }

    /** 회차와 연결되지 않은 메모가 회차 정보 없이 응답되는지 검증한다. */
    @Test
    void getsMemoWithoutMeeting() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        FanMemo memo = savedMemo(MEMO_ID, loginInfluencer, null, "회차 없는 메모");
        when(fanMemoRepository.findByInfluencer_IdAndFan_IdAndDeletedAtIsNullOrderByCreatedAtDescIdDesc(
                eq(INFLUENCER_ID), eq(FAN_ID), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(memo), PageRequest.of(0, 20), 1));

        PageResponse<FanMemoListResponse> response = service.getMemos(FAN_ID, 0, 20, influencerPrincipal);

        assertThat(response.content()).singleElement().satisfies(item -> {
            assertThat(item.meetingId()).isNull();
            assertThat(item.meetingTitle()).isNull();
            assertThat(item.content()).isEqualTo("회차 없는 메모");
        });
    }

    /** 같은 활성 조직 매니저가 조직 인플루언서 범위로 메모를 조회하는지 검증한다. */
    @Test
    void getsOrganizationScopedMemosAsManager() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        List<OrganizationMember> memberships = List.of(organizationMember(ORGANIZATION_ID));
        when(organizationMemberRepository.findAllByUserIdAndMemberTypeAndStatus(
                MANAGER_ID, OrganizationMemberType.MANAGER, OrganizationMemberStatus.ACTIVE))
                .thenReturn(memberships);
        FanMemo memo = savedMemo(MEMO_ID, user(OTHER_INFLUENCER_ID, UserRole.INFLUENCER),
                meeting("조직 팬미팅"), "조직 인플루언서 메모");
        when(fanMemoRepository.findOrganizationScopedByFan(
                eq(FAN_ID), eq(List.of(ORGANIZATION_ID)),
                eq(OrganizationMemberType.INFLUENCER), eq(OrganizationMemberStatus.ACTIVE),
                any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(memo), PageRequest.of(0, 20), 1));

        PageResponse<FanMemoListResponse> response = service.getMemos(FAN_ID, 0, 20, managerPrincipal);

        assertThat(response.content()).singleElement()
                .satisfies(item -> assertThat(item.content()).isEqualTo("조직 인플루언서 메모"));
        verify(fanMemoRepository, never())
                .findByInfluencer_IdAndFan_IdAndDeletedAtIsNullOrderByCreatedAtDescIdDesc(
                        anyLong(), anyLong(), any(Pageable.class));
    }

    /** 활성 소속 조직이 없는 매니저의 조회가 거부되는지 검증한다. */
    @Test
    void rejectsManagerWithoutActiveOrganization() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        when(organizationMemberRepository.findAllByUserIdAndMemberTypeAndStatus(
                MANAGER_ID, OrganizationMemberType.MANAGER, OrganizationMemberStatus.ACTIVE))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.getMemos(FAN_ID, 0, 20, managerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_MEMO_ACCESS_DENIED));
    }

    /** 팬 역할 사용자의 메모 조회가 거부되는지 검증한다. */
    @Test
    void rejectsFanFromReadingMemos() {
        AuthenticatedUser fanPrincipal = new AuthenticatedUser(FAN_ID, UserRole.FAN);
        when(currentUserService.requireActiveUser(fanPrincipal)).thenReturn(fan);
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));

        assertThatThrownBy(() -> service.getMemos(FAN_ID, 0, 20, fanPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_MEMO_ACCESS_DENIED));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 존재하지 않는 팬 식별자로 조회하면 거부되는지 검증한다. */
    @Test
    void rejectsUnknownFanOnRead() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getMemos(FAN_ID, 0, 20, influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_NOT_FOUND));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 팬이 아닌 사용자를 대상으로 조회하면 거부되는지 검증한다. */
    @Test
    void rejectsNonFanTargetOnRead() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(user(FAN_ID, UserRole.INFLUENCER)));

        assertThatThrownBy(() -> service.getMemos(FAN_ID, 0, 20, influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_NOT_FOUND));
    }

    /** 탈퇴한 팬을 대상으로 조회하면 거부되는지 검증한다. */
    @Test
    void rejectsWithdrawnFanOnRead() {
        User withdrawn = user(FAN_ID, UserRole.FAN);
        ReflectionTestUtils.setField(withdrawn, "status", UserStatus.WITHDRAWN);
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(withdrawn));

        assertThatThrownBy(() -> service.getMemos(FAN_ID, 0, 20, influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_NOT_FOUND));
    }

    /** 음수 페이지 번호와 상한을 넘는 페이지 크기가 거부되는지 검증한다. */
    @Test
    void rejectsInvalidPageArguments() {
        assertThatThrownBy(() -> service.getMemos(FAN_ID, -1, 20, influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST));
        assertThatThrownBy(() -> service.getMemos(FAN_ID, 0, 101, influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST));
        assertThatThrownBy(() -> service.getMemos(FAN_ID, 0, 0, influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 상한과 같은 페이지 크기는 허용되는지 검증한다. */
    @Test
    void allowsMaximumPageSize() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        when(fanMemoRepository.findByInfluencer_IdAndFan_IdAndDeletedAtIsNullOrderByCreatedAtDescIdDesc(
                eq(INFLUENCER_ID), eq(FAN_ID), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 100), 0));

        PageResponse<FanMemoListResponse> response = service.getMemos(FAN_ID, 0, 100, influencerPrincipal);

        assertThat(response.size()).isEqualTo(100);
    }

    /** 회차를 지정한 메모가 참가 관계 검증을 거쳐 저장되는지 검증한다. */
    @Test
    void createsMemoWithMeeting() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        FanMeeting meeting = meeting("7월 팬미팅");
        when(meetingAccessService.requireInfluencer(MEETING_ID, loginInfluencer)).thenReturn(meeting);
        when(participantRepository.findByMeeting_IdAndFan_Id(MEETING_ID, FAN_ID))
                .thenReturn(Optional.of(mock(Participant.class)));
        when(fanMemoRepository.save(any(FanMemo.class))).thenAnswer(invocation -> {
            FanMemo memo = invocation.getArgument(0);
            ReflectionTestUtils.setField(memo, "id", MEMO_ID);
            ReflectionTestUtils.setField(memo, "createdAt", NOW);
            ReflectionTestUtils.setField(memo, "updatedAt", NOW);
            return memo;
        });

        FanMemoCreateResponse response = service.createMemo(
                FAN_ID, new FanMemoCreateRequest(MEETING_ID, "통화에서 나눈 이야기"), influencerPrincipal);

        assertThat(response.memoId()).isEqualTo(MEMO_ID);
        assertThat(response.fanId()).isEqualTo(FAN_ID);
        assertThat(response.meetingId()).isEqualTo(MEETING_ID);
        assertThat(response.content()).isEqualTo("통화에서 나눈 이야기");
        assertThat(response.createdAt()).isEqualTo(NOW);
    }

    /** 회차를 지정하지 않은 일반 메모가 저장되는지 검증한다. */
    @Test
    void createsMemoWithoutMeeting() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        when(fanMemoRepository.save(any(FanMemo.class))).thenAnswer(invocation -> {
            FanMemo memo = invocation.getArgument(0);
            ReflectionTestUtils.setField(memo, "id", MEMO_ID);
            ReflectionTestUtils.setField(memo, "createdAt", NOW);
            ReflectionTestUtils.setField(memo, "updatedAt", NOW);
            return memo;
        });

        FanMemoCreateResponse response = service.createMemo(
                FAN_ID, new FanMemoCreateRequest(null, "회차와 무관한 메모"), influencerPrincipal);

        assertThat(response.meetingId()).isNull();
        assertThat(response.content()).isEqualTo("회차와 무관한 메모");
        verifyNoInteractions(meetingAccessService);
        verifyNoInteractions(participantRepository);
    }

    /** 앞뒤 공백이 제거된 내용으로 저장되는지 검증한다. */
    @Test
    void createsMemoWithTrimmedContent() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        when(fanMemoRepository.save(any(FanMemo.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.createMemo(FAN_ID, new FanMemoCreateRequest(null, "  공백 포함 메모  "), influencerPrincipal);

        verify(fanMemoRepository).save(
                org.mockito.ArgumentMatchers.argThat(memo -> "공백 포함 메모".equals(memo.getContent())));
    }

    /** 매니저의 메모 작성이 거부되는지 검증한다. */
    @Test
    void rejectsManagerFromCreatingMemo() {
        assertThatThrownBy(() -> service.createMemo(
                FAN_ID, new FanMemoCreateRequest(null, "매니저 메모"), managerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 다른 인플루언서가 주최한 회차로 메모를 작성하려는 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMemoOnOtherInfluencersMeeting() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        when(meetingAccessService.requireInfluencer(MEETING_ID, loginInfluencer))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> service.createMemo(
                FAN_ID, new FanMemoCreateRequest(MEETING_ID, "내용"), influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 팬이 참가하지 않은 회차로 메모를 작성하려는 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMemoOnMeetingWithoutFanParticipation() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        FanMeeting ownedMeeting = meeting("7월 팬미팅");
        when(meetingAccessService.requireInfluencer(MEETING_ID, loginInfluencer))
                .thenReturn(ownedMeeting);
        when(participantRepository.findByMeeting_IdAndFan_Id(MEETING_ID, FAN_ID))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createMemo(
                FAN_ID, new FanMemoCreateRequest(MEETING_ID, "내용"), influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PARTICIPANT_NOT_IN_MEETING));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 공백만 있는 내용의 작성 요청이 거부되는지 검증한다. */
    @Test
    void rejectsBlankContentOnCreate() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));

        assertThatThrownBy(() -> service.createMemo(
                FAN_ID, new FanMemoCreateRequest(null, "   "), influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 최대 길이를 초과한 내용의 작성 요청이 거부되는지 검증한다. */
    @Test
    void rejectsTooLongContentOnCreate() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        String tooLong = "가".repeat(FanMemoContentPolicy.MAX_LENGTH + 1);

        assertThatThrownBy(() -> service.createMemo(
                FAN_ID, new FanMemoCreateRequest(null, tooLong), influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 최대 길이와 같은 내용은 저장되는지 검증한다. */
    @Test
    void createsMemoWithMaximumLengthContent() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.of(fan));
        when(fanMemoRepository.save(any(FanMemo.class))).thenAnswer(invocation -> invocation.getArgument(0));
        String maxContent = "가".repeat(FanMemoContentPolicy.MAX_LENGTH);

        service.createMemo(FAN_ID, new FanMemoCreateRequest(null, maxContent), influencerPrincipal);

        verify(fanMemoRepository).save(
                org.mockito.ArgumentMatchers.argThat(memo -> maxContent.equals(memo.getContent())));
    }

    /** 존재하지 않는 팬을 대상으로 한 작성 요청이 거부되는지 검증한다. */
    @Test
    void rejectsUnknownFanOnCreate() {
        when(userRepository.findById(FAN_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createMemo(
                FAN_ID, new FanMemoCreateRequest(null, "내용"), influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_NOT_FOUND));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 작성자 본인의 수정 요청이 메모 내용에 반영되는지 검증한다. */
    @Test
    void updatesContentByAuthor() {
        FanMemo memo = savedMemo(MEMO_ID, loginInfluencer, meeting("7월 팬미팅"), "원본 메모");
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));
        when(fanMemoRepository.saveAndFlush(any(FanMemo.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        FanMemoUpdateResponse response = service.updateMemo(
                MEMO_ID, new FanMemoUpdateRequest("  수정된 메모  "), influencerPrincipal);

        assertThat(memo.getContent()).isEqualTo("수정된 메모");
        assertThat(response.memoId()).isEqualTo(MEMO_ID);
        assertThat(response.meetingId()).isEqualTo(MEETING_ID);
        assertThat(response.content()).isEqualTo("수정된 메모");
    }

    /** 존재하지 않는 메모의 수정 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMissingMemoOnUpdate() {
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateMemo(
                MEMO_ID, new FanMemoUpdateRequest("내용"), influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_MEMO_NOT_FOUND));
    }

    /** 작성자가 아닌 인플루언서의 수정 요청이 거부되는지 검증한다. */
    @Test
    void rejectsNonAuthorOnUpdate() {
        FanMemo memo = savedMemo(MEMO_ID, user(OTHER_INFLUENCER_ID, UserRole.INFLUENCER), null, "원본 메모");
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        assertThatThrownBy(() -> service.updateMemo(
                MEMO_ID, new FanMemoUpdateRequest("내용"), influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_MEMO_ACCESS_DENIED));
        assertThat(memo.getContent()).isEqualTo("원본 메모");
    }

    /** 매니저의 수정 요청이 거부되는지 검증한다. */
    @Test
    void rejectsManagerOnUpdate() {
        assertThatThrownBy(() -> service.updateMemo(
                MEMO_ID, new FanMemoUpdateRequest("내용"), managerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
        verifyNoInteractions(fanMemoRepository);
    }

    /** 이미 삭제된 메모의 수정 요청이 거부되는지 검증한다. */
    @Test
    void rejectsDeletedMemoOnUpdate() {
        FanMemo memo = savedMemo(MEMO_ID, loginInfluencer, null, "원본 메모");
        memo.delete(NOW.minusDays(1));
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        assertThatThrownBy(() -> service.updateMemo(
                MEMO_ID, new FanMemoUpdateRequest("내용"), influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_MEMO_ALREADY_DELETED));
    }

    /** 공백만 있는 내용의 수정 요청이 거부되는지 검증한다. */
    @Test
    void rejectsBlankContentOnUpdate() {
        FanMemo memo = savedMemo(MEMO_ID, loginInfluencer, null, "원본 메모");
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        assertThatThrownBy(() -> service.updateMemo(
                MEMO_ID, new FanMemoUpdateRequest("   "), influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST));
        assertThat(memo.getContent()).isEqualTo("원본 메모");
    }

    /** 작성자 본인의 삭제 요청이 주입된 시계 기준으로 소프트 삭제되는지 검증한다. */
    @Test
    void softDeletesByAuthor() {
        FanMemo memo = savedMemo(MEMO_ID, loginInfluencer, null, "원본 메모");
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));
        when(fanMemoRepository.saveAndFlush(any(FanMemo.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        FanMemoDeleteResponse response = service.deleteMemo(MEMO_ID, influencerPrincipal);

        assertThat(memo.getDeletedAt()).isEqualTo(NOW);
        assertThat(response.memoId()).isEqualTo(MEMO_ID);
        assertThat(response.deleted()).isTrue();
        assertThat(response.deletedAt()).isEqualTo(NOW);
    }

    /** 이미 소프트 삭제된 메모의 재삭제 요청이 충돌로 거부되는지 검증한다. */
    @Test
    void rejectsAlreadyDeletedMemoOnDelete() {
        FanMemo memo = savedMemo(MEMO_ID, loginInfluencer, null, "원본 메모");
        memo.delete(NOW.minusDays(1));
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        assertThatThrownBy(() -> service.deleteMemo(MEMO_ID, influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_MEMO_ALREADY_DELETED));
        assertThat(memo.getDeletedAt()).isEqualTo(NOW.minusDays(1));
    }

    /** 작성자가 아닌 인플루언서의 삭제 요청이 거부되는지 검증한다. */
    @Test
    void rejectsNonAuthorOnDelete() {
        FanMemo memo = savedMemo(MEMO_ID, user(OTHER_INFLUENCER_ID, UserRole.INFLUENCER), null, "원본 메모");
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        assertThatThrownBy(() -> service.deleteMemo(MEMO_ID, influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_MEMO_ACCESS_DENIED));
        assertThat(memo.getDeletedAt()).isNull();
    }

    /** 작성자가 아닌 사용자에게는 삭제 상태보다 권한 오류가 먼저 응답되는지 검증한다. */
    @Test
    void hidesDeletedStateFromNonAuthor() {
        FanMemo memo = savedMemo(MEMO_ID, user(OTHER_INFLUENCER_ID, UserRole.INFLUENCER), null, "원본 메모");
        memo.delete(NOW.minusDays(1));
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        assertThatThrownBy(() -> service.deleteMemo(MEMO_ID, influencerPrincipal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_MEMO_ACCESS_DENIED));
    }

    /**
     * 지정한 식별자와 역할을 가진 사용자를 만든다.
     *
     * @param id 사용자 식별자
     * @param role 사용자 역할
     * @return 활성 상태의 사용자
     */
    private User user(Long id, UserRole role) {
        User user = User.createActive("login" + id, id + "@melly.test", "hash", "닉네임" + id, role, null);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    /**
     * 지정한 제목을 가진 팬미팅 목을 만든다.
     *
     * @param title 팬미팅 제목
     * @return 식별자와 제목만 응답하는 팬미팅 목
     */
    private FanMeeting meeting(String title) {
        FanMeeting meeting = mock(FanMeeting.class);
        when(meeting.getId()).thenReturn(MEETING_ID);
        when(meeting.getTitle()).thenReturn(title);
        return meeting;
    }

    /**
     * 저장이 끝난 상태의 팬 메모를 만든다.
     *
     * @param memoId 메모 식별자
     * @param author 작성자
     * @param meeting 연결된 회차이며 없으면 null
     * @param content 메모 내용
     * @return 식별자와 생성·수정 시각이 채워진 팬 메모
     */
    private FanMemo savedMemo(Long memoId, User author, FanMeeting meeting, String content) {
        FanMemo memo = FanMemo.create(author, fan, meeting, content);
        ReflectionTestUtils.setField(memo, "id", memoId);
        ReflectionTestUtils.setField(memo, "createdAt", NOW);
        ReflectionTestUtils.setField(memo, "updatedAt", NOW);
        return memo;
    }

    /**
     * 지정한 조직에 활성 매니저로 소속된 구성원 목을 만든다.
     *
     * @param organizationId 조직 식별자
     * @return 조직 식별자만 응답하는 구성원 목
     */
    private OrganizationMember organizationMember(Long organizationId) {
        Organization organization = mock(Organization.class);
        when(organization.getId()).thenReturn(organizationId);
        OrganizationMember member = mock(OrganizationMember.class);
        when(member.getOrganization()).thenReturn(organization);
        return member;
    }

    /**
     * 비어 있는 메모 페이지를 만든다.
     *
     * @return 항목이 없는 첫 페이지
     */
    private Page<FanMemo> emptyPage() {
        return new PageImpl<>(List.of(), PageRequest.of(0, 20), 0);
    }
}
