package com.ssafy.backend.organization.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.organization.domain.Organization;
import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.dto.OrganizationInvitationCreateRequest;
import com.ssafy.backend.organization.redis.OrganizationInvitationStore;
import com.ssafy.backend.organization.redis.OrganizationInvitationStore.InvitationData;
import com.ssafy.backend.organization.redis.OrganizationInvitationStore.IssuedInvitation;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.organization.repository.OrganizationRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrganizationInvitationServiceTest {

    private static final AuthenticatedUser MANAGER_PRINCIPAL =
            new AuthenticatedUser(7L, UserRole.MANAGER);
    private static final AuthenticatedUser INFLUENCER_PRINCIPAL =
            new AuthenticatedUser(25L, UserRole.INFLUENCER);

    private CurrentUserService currentUserService;
    private UserRepository userRepository;
    private OrganizationRepository organizationRepository;
    private OrganizationMemberRepository organizationMemberRepository;
    private OrganizationInvitationStore invitationStore;
    private OrganizationInvitationService invitationService;

    /** 각 테스트에서 독립적인 저장소와 Redis 초대 모의 객체를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        userRepository = mock(UserRepository.class);
        organizationRepository = mock(OrganizationRepository.class);
        organizationMemberRepository = mock(OrganizationMemberRepository.class);
        invitationStore = mock(OrganizationInvitationStore.class);
        invitationService = new OrganizationInvitationService(
                currentUserService,
                userRepository,
                organizationRepository,
                organizationMemberRepository,
                invitationStore,
                Clock.fixed(Instant.parse("2026-07-30T06:00:00Z"), ZoneId.of("Asia/Seoul"))
        );
    }

    /** 같은 조직의 활성 매니저가 미소속 인플루언서에게 초대를 발급하는지 검증한다. */
    @Test
    void issuesInvitationForUnassignedInfluencer() {
        User manager = user(7L, UserRole.MANAGER, "manager");
        User influencer = user(25L, UserRole.INFLUENCER, "influencer");
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(manager);
        when(organizationMemberRepository
                .existsByOrganization_IdAndUser_IdAndMemberTypeAndStatus(
                        3L, 7L, OrganizationMemberType.MANAGER,
                        OrganizationMemberStatus.ACTIVE)).thenReturn(true);
        when(userRepository.findById(25L)).thenReturn(Optional.of(influencer));
        when(organizationMemberRepository.findFirstByUser_IdAndStatus(
                25L, OrganizationMemberStatus.ACTIVE)).thenReturn(Optional.empty());
        when(invitationStore.issue(3L, 25L, 7L)).thenReturn(
                new IssuedInvitation("issued-token",
                        LocalDateTime.of(2026, 7, 31, 15, 0)));

        var response = invitationService.issue(
                3L, new OrganizationInvitationCreateRequest(25L), MANAGER_PRINCIPAL);

        assertThat(response.token()).isEqualTo("issued-token");
        assertThat(response.expiresAt()).isEqualTo("2026-07-31T15:00:00");
    }

    /** 초대 대상 인플루언서가 토큰을 수락하면 ACTIVE 소속이 생성되는지 검증한다. */
    @Test
    void acceptsInvitationAndCreatesMembership() {
        User influencer = user(25L, UserRole.INFLUENCER, "influencer");
        Organization organization = organization(3L);
        InvitationData invitation = new InvitationData(3L, 25L, 7L);
        when(currentUserService.requireActiveUser(INFLUENCER_PRINCIPAL)).thenReturn(influencer);
        when(invitationStore.peek("valid-token")).thenReturn(invitation);
        when(userRepository.findByIdForUpdate(25L)).thenReturn(Optional.of(influencer));
        when(organizationMemberRepository.findFirstByUser_IdAndStatus(
                25L, OrganizationMemberStatus.ACTIVE)).thenReturn(Optional.empty());
        when(invitationStore.consume("valid-token")).thenReturn(invitation);
        when(organizationRepository.findById(3L)).thenReturn(Optional.of(organization));
        when(organizationMemberRepository.findByOrganization_IdAndUser_Id(3L, 25L))
                .thenReturn(Optional.empty());
        when(organizationMemberRepository.saveAndFlush(any())).thenAnswer(invocation -> {
            OrganizationMember member = invocation.getArgument(0);
            ReflectionTestUtils.setField(member, "id", 100L);
            return member;
        });

        var response = invitationService.accept("valid-token", INFLUENCER_PRINCIPAL);

        assertThat(response.organization().organizationId()).isEqualTo(3L);
        assertThat(response.member().organizationMemberId()).isEqualTo(100L);
        assertThat(response.member().status()).isEqualTo(OrganizationMemberStatus.ACTIVE);
        assertThat(response.member().joinedAt()).isEqualTo("2026-07-30T15:00:00");
        InOrder lockOrder = inOrder(userRepository, organizationMemberRepository);
        lockOrder.verify(userRepository).findByIdForUpdate(25L);
        lockOrder.verify(organizationMemberRepository).findFirstByUser_IdAndStatus(
                25L, OrganizationMemberStatus.ACTIVE);
    }

    /** 다른 사용자가 초대 토큰을 제시해도 토큰을 소비하지 않고 접근을 거부하는지 검증한다. */
    @Test
    void rejectsDifferentInfluencerWithoutConsumingToken() {
        User anotherInfluencer = user(26L, UserRole.INFLUENCER, "another");
        AuthenticatedUser anotherPrincipal = new AuthenticatedUser(26L, UserRole.INFLUENCER);
        when(currentUserService.requireActiveUser(anotherPrincipal)).thenReturn(anotherInfluencer);
        when(invitationStore.peek("other-token")).thenReturn(new InvitationData(3L, 25L, 7L));

        assertThatThrownBy(() -> invitationService.accept("other-token", anotherPrincipal))
                .isInstanceOf(BusinessException.class)
                .satisfies(exception -> assertThat(((BusinessException) exception).getErrorCode())
                        .isEqualTo(ErrorCode.ACCESS_DENIED));
        verify(invitationStore, never()).consume("other-token");
    }

    /** 이미 사용됐거나 만료된 초대 토큰이 NOT_FOUND 오류로 거부되는지 검증한다. */
    @Test
    void rejectsExpiredOrUsedInvitation() {
        User influencer = user(25L, UserRole.INFLUENCER, "influencer");
        when(currentUserService.requireActiveUser(INFLUENCER_PRINCIPAL)).thenReturn(influencer);
        when(invitationStore.peek("expired-token")).thenReturn(null);

        assertThatThrownBy(() -> invitationService.accept("expired-token", INFLUENCER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .satisfies(exception -> assertThat(((BusinessException) exception).getErrorCode())
                        .isEqualTo(ErrorCode.ORGANIZATION_INVITATION_NOT_FOUND));
    }

    /** 이미 활성 조직이 있는 인플루언서에게 초대를 발급하지 않는지 검증한다. */
    @Test
    void rejectsInvitationForAssignedInfluencer() {
        User manager = user(7L, UserRole.MANAGER, "manager");
        User influencer = user(25L, UserRole.INFLUENCER, "influencer");
        Organization organization = organization(3L);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(manager);
        when(organizationMemberRepository
                .existsByOrganization_IdAndUser_IdAndMemberTypeAndStatus(
                        3L, 7L, OrganizationMemberType.MANAGER,
                        OrganizationMemberStatus.ACTIVE)).thenReturn(true);
        when(userRepository.findById(25L)).thenReturn(Optional.of(influencer));
        when(organizationMemberRepository.findFirstByUser_IdAndStatus(
                25L, OrganizationMemberStatus.ACTIVE)).thenReturn(Optional.of(
                        OrganizationMember.join(organization, influencer,
                                OrganizationMemberType.INFLUENCER,
                                LocalDateTime.of(2026, 7, 29, 15, 0))));

        assertThatThrownBy(() -> invitationService.issue(
                3L, new OrganizationInvitationCreateRequest(25L), MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class);
        verify(invitationStore, never()).issue(any(), any(), any());
    }

    /** 테스트용 활성 사용자를 생성하고 식별자를 설정한다. */
    private User user(Long id, UserRole role, String nickname) {
        User user = User.createActive(
                nickname + "Login", nickname + "@example.com", "encoded", nickname,
                role, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    /** 테스트용 활성 조직을 생성하고 식별자를 설정한다. */
    private Organization organization(Long id) {
        Organization organization = Organization.createActive(
                "멜리 엔터", null, null, null, null, null, null);
        ReflectionTestUtils.setField(organization, "id", id);
        return organization;
    }
}
