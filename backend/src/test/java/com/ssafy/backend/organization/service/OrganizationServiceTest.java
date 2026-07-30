package com.ssafy.backend.organization.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.organization.domain.Organization;
import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.dto.OrganizationCreateRequest;
import com.ssafy.backend.organization.dto.OrganizationMemberAddRequest;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.organization.repository.OrganizationRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrganizationServiceTest {

    private static final AuthenticatedUser MANAGER_PRINCIPAL =
            new AuthenticatedUser(1L, UserRole.MANAGER);
    private static final AuthenticatedUser ADMIN_PRINCIPAL =
            new AuthenticatedUser(99L, UserRole.ADMIN);

    private CurrentUserService currentUserService;
    private UserRepository userRepository;
    private OrganizationRepository organizationRepository;
    private OrganizationMemberRepository organizationMemberRepository;
    private OrganizationService organizationService;

    /** 각 테스트에서 독립적인 저장소 모의 객체와 조직 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        userRepository = mock(UserRepository.class);
        organizationRepository = mock(OrganizationRepository.class);
        organizationMemberRepository = mock(OrganizationMemberRepository.class);
        organizationService = new OrganizationService(
                currentUserService,
                userRepository,
                organizationRepository,
                organizationMemberRepository
        );
    }

    /** 조직 생성과 생성 매니저의 활성 소속이 한 트랜잭션 흐름에서 저장되는지 검증한다. */
    @Test
    void createsOrganizationAndManagerMembershipTogether() {
        User manager = user(1L, UserRole.MANAGER, "manager");
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(manager);
        when(userRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(manager));
        when(organizationMemberRepository.findFirstByUser_IdAndStatus(
                1L, OrganizationMemberStatus.ACTIVE)).thenReturn(Optional.empty());
        when(organizationRepository.existsByBusinessNumber("123-45-67890")).thenReturn(false);
        when(organizationRepository.saveAndFlush(any())).thenAnswer(invocation -> {
            Organization organization = invocation.getArgument(0);
            ReflectionTestUtils.setField(organization, "id", 10L);
            return organization;
        });
        when(organizationMemberRepository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = organizationService.createOrganization(MANAGER_PRINCIPAL,
                new OrganizationCreateRequest(" 멜리 엔터 ", "123-45-67890", "대표자",
                        "contact@example.com", null, null, null));

        assertThat(response.organizationId()).isEqualTo(10L);
        assertThat(response.name()).isEqualTo("멜리 엔터");
        assertThat(response.status()).isEqualTo("ACTIVE");
        ArgumentCaptor<OrganizationMember> memberCaptor =
                ArgumentCaptor.forClass(OrganizationMember.class);
        verify(organizationMemberRepository).saveAndFlush(memberCaptor.capture());
        assertThat(memberCaptor.getValue().getUser()).isEqualTo(manager);
        assertThat(memberCaptor.getValue().getMemberType()).isEqualTo(OrganizationMemberType.MANAGER);
        assertThat(memberCaptor.getValue().getStatus()).isEqualTo(OrganizationMemberStatus.ACTIVE);
        InOrder lockOrder = inOrder(userRepository, organizationMemberRepository);
        lockOrder.verify(userRepository).findByIdForUpdate(1L);
        lockOrder.verify(organizationMemberRepository).findFirstByUser_IdAndStatus(
                1L, OrganizationMemberStatus.ACTIVE);
    }

    /** 이미 활성 조직이 있는 매니저가 두 번째 조직을 생성할 수 없는지 검증한다. */
    @Test
    void rejectsManagerWithAnotherActiveOrganization() {
        User manager = user(1L, UserRole.MANAGER, "manager");
        Organization organization = organization(10L);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(manager);
        when(userRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(manager));
        when(organizationMemberRepository.findFirstByUser_IdAndStatus(
                1L, OrganizationMemberStatus.ACTIVE))
                .thenReturn(Optional.of(member(100L, organization, manager,
                        OrganizationMemberType.MANAGER)));

        assertThatThrownBy(() -> organizationService.createOrganization(
                MANAGER_PRINCIPAL,
                new OrganizationCreateRequest("다른 조직", null, null, null, null, null, null)))
                .isInstanceOf(BusinessException.class);
        verify(organizationRepository, never()).saveAndFlush(any());
    }

    /** 관리자가 활성 인플루언서를 조직에 직접 연결하는지 검증한다. */
    @Test
    void adminAddsActiveInfluencerToOrganization() {
        User admin = user(99L, UserRole.ADMIN, "admin");
        User influencer = user(2L, UserRole.INFLUENCER, "influencer");
        Organization organization = organization(10L);
        when(currentUserService.requireActiveUser(ADMIN_PRINCIPAL)).thenReturn(admin);
        when(userRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(influencer));
        when(organizationMemberRepository.findFirstByUser_IdAndStatus(
                2L, OrganizationMemberStatus.ACTIVE)).thenReturn(Optional.empty());
        when(organizationRepository.findById(10L)).thenReturn(Optional.of(organization));
        when(organizationMemberRepository.findByOrganization_IdAndUser_Id(10L, 2L))
                .thenReturn(Optional.empty());
        when(organizationMemberRepository.saveAndFlush(any())).thenAnswer(invocation -> {
            OrganizationMember member = invocation.getArgument(0);
            ReflectionTestUtils.setField(member, "id", 101L);
            return member;
        });

        var response = organizationService.addMember(
                10L, new OrganizationMemberAddRequest(2L), ADMIN_PRINCIPAL);

        assertThat(response.organizationMemberId()).isEqualTo(101L);
        assertThat(response.userId()).isEqualTo(2L);
        assertThat(response.memberType()).isEqualTo(OrganizationMemberType.INFLUENCER);
        assertThat(response.status()).isEqualTo(OrganizationMemberStatus.ACTIVE);
        InOrder lockOrder = inOrder(userRepository, organizationMemberRepository);
        lockOrder.verify(userRepository).findByIdForUpdate(2L);
        lockOrder.verify(organizationMemberRepository).findFirstByUser_IdAndStatus(
                2L, OrganizationMemberStatus.ACTIVE);
    }

    /** 1인 인플루언서는 조직 구성원으로 등록할 수 없는지 검증한다. */
    @Test
    void rejectsSoloInfluencerMembership() {
        User admin = user(99L, UserRole.ADMIN, "admin");
        User soloInfluencer = user(2L, UserRole.SOLO_INFLUENCER, "solo");
        when(currentUserService.requireActiveUser(ADMIN_PRINCIPAL)).thenReturn(admin);
        when(userRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(soloInfluencer));

        assertThatThrownBy(() -> organizationService.addMember(
                10L, new OrganizationMemberAddRequest(2L), ADMIN_PRINCIPAL))
                .isInstanceOf(BusinessException.class);
    }

    /** 일반 매니저가 초대 수락을 우회해 인플루언서를 직접 등록할 수 없는지 검증한다. */
    @Test
    void rejectsManagerDirectMembershipRegistration() {
        User manager = user(1L, UserRole.MANAGER, "manager");
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(manager);

        assertThatThrownBy(() -> organizationService.addMember(
                10L, new OrganizationMemberAddRequest(2L), MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class);
        verify(userRepository, never()).findByIdForUpdate(2L);
    }

    /** 현재 사용자가 속한 조직의 활성 구성원만 목록으로 반환하는지 검증한다. */
    @Test
    void returnsCurrentOrganizationsActiveMembers() {
        User manager = user(1L, UserRole.MANAGER, "manager");
        User influencer = user(2L, UserRole.INFLUENCER, "influencer");
        Organization organization = organization(10L);
        OrganizationMember managerMember = member(
                100L, organization, manager, OrganizationMemberType.MANAGER);
        OrganizationMember influencerMember = member(
                101L, organization, influencer, OrganizationMemberType.INFLUENCER);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(manager);
        when(organizationMemberRepository.findFirstByUser_IdAndStatus(
                1L, OrganizationMemberStatus.ACTIVE)).thenReturn(Optional.of(managerMember));
        when(organizationMemberRepository
                .findAllByOrganization_IdAndStatusOrderByJoinedAtAscIdAsc(
                        10L, OrganizationMemberStatus.ACTIVE))
                .thenReturn(List.of(managerMember, influencerMember));

        var response = organizationService.getMyOrganizationMembers(MANAGER_PRINCIPAL);

        assertThat(response.organization().organizationId()).isEqualTo(10L);
        assertThat(response.members()).extracting(member -> member.userId())
                .containsExactly(1L, 2L);
    }

    /** 구성원을 삭제하지 않고 INACTIVE 상태와 종료 시각으로 변경하는지 검증한다. */
    @Test
    void deactivatesMembershipInsteadOfDeletingIt() {
        User manager = user(1L, UserRole.MANAGER, "manager");
        User influencer = user(2L, UserRole.INFLUENCER, "influencer");
        Organization organization = organization(10L);
        OrganizationMember influencerMember = member(
                101L, organization, influencer, OrganizationMemberType.INFLUENCER);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(manager);
        when(organizationMemberRepository
                .existsByOrganization_IdAndUser_IdAndMemberTypeAndStatus(
                        10L, 1L, OrganizationMemberType.MANAGER,
                        OrganizationMemberStatus.ACTIVE)).thenReturn(true);
        when(organizationMemberRepository.findByOrganization_IdAndUser_Id(10L, 2L))
                .thenReturn(Optional.of(influencerMember));
        when(organizationMemberRepository.saveAndFlush(influencerMember))
                .thenReturn(influencerMember);

        var response = organizationService.removeMember(10L, 2L, MANAGER_PRINCIPAL);

        assertThat(response.status()).isEqualTo(OrganizationMemberStatus.INACTIVE);
        assertThat(response.leftAt()).isNotNull();
        verify(organizationMemberRepository, never()).delete(any());
    }

    /** 테스트용 활성 사용자를 생성하고 식별자를 설정한다. */
    private User user(Long id, UserRole role, String nickname) {
        User user = User.createActive(
                nickname + "Login",
                nickname + "@example.com",
                "encoded",
                nickname,
                role,
                PreferredLanguage.KOREAN
        );
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

    /** 테스트용 활성 조직 소속을 생성하고 식별자를 설정한다. */
    private OrganizationMember member(Long id, Organization organization, User user,
                                      OrganizationMemberType memberType) {
        OrganizationMember member = OrganizationMember.join(
                organization, user, memberType, LocalDateTime.of(2026, 7, 30, 15, 0));
        ReflectionTestUtils.setField(member, "id", id);
        return member;
    }
}
