package com.ssafy.backend.organization.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.organization.domain.Organization;
import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.dto.OrganizationInvitationAcceptResponse;
import com.ssafy.backend.organization.dto.OrganizationInvitationCreateRequest;
import com.ssafy.backend.organization.dto.OrganizationInvitationResponse;
import com.ssafy.backend.organization.dto.OrganizationMemberResponse;
import com.ssafy.backend.organization.dto.OrganizationResponse;
import com.ssafy.backend.organization.redis.OrganizationInvitationStore;
import com.ssafy.backend.organization.redis.OrganizationInvitationStore.InvitationData;
import com.ssafy.backend.organization.redis.OrganizationInvitationStore.IssuedInvitation;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.organization.repository.OrganizationRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/**
 * 매니저의 조직 초대 발급과 인플루언서의 일회성 초대 수락을 처리한다.
 */
@Service
public class OrganizationInvitationService {

    private final CurrentUserService currentUserService;
    private final UserRepository userRepository;
    private final OrganizationRepository organizationRepository;
    private final OrganizationMemberRepository organizationMemberRepository;
    private final OrganizationInvitationStore invitationStore;
    private final Clock clock;

    /**
     * 조직 초대 검증과 저장에 필요한 구성 요소를 주입받는다.
     *
     * @param currentUserService 현재 활성 사용자 조회 서비스
     * @param userRepository 사용자 저장소
     * @param organizationRepository 조직 저장소
     * @param organizationMemberRepository 조직 소속 저장소
     * @param invitationStore Redis 조직 초대 저장소
     * @param clock 현재 시각을 제공하는 시계
     */
    public OrganizationInvitationService(
            CurrentUserService currentUserService,
            UserRepository userRepository,
            OrganizationRepository organizationRepository,
            OrganizationMemberRepository organizationMemberRepository,
            OrganizationInvitationStore invitationStore,
            Clock clock
    ) {
        this.currentUserService = currentUserService;
        this.userRepository = userRepository;
        this.organizationRepository = organizationRepository;
        this.organizationMemberRepository = organizationMemberRepository;
        this.invitationStore = invitationStore;
        this.clock = clock;
    }

    /**
     * 같은 조직의 매니저가 활성 인플루언서에게 24시간 일회성 초대를 발급한다.
     *
     * @param organizationId 초대 조직 식별자
     * @param request 초대 대상 인플루언서 정보
     * @param principal JWT 인증 사용자 정보
     * @return 원본 토큰과 만료 시각이 포함된 초대 응답
     * @throws BusinessException 요청자가 조직 매니저가 아니거나 대상이 이미 조직에 소속된 경우
     */
    @Transactional
    public OrganizationInvitationResponse issue(
            Long organizationId,
            OrganizationInvitationCreateRequest request,
            AuthenticatedUser principal
    ) {
        User manager = requireManager(principal);
        requireOrganizationManager(organizationId, manager.getId());
        User influencer = requireInfluencer(request.influencerId());
        requireNoActiveOrganization(influencer.getId());

        IssuedInvitation issued = invitationStore.issue(
                organizationId, influencer.getId(), manager.getId());
        return new OrganizationInvitationResponse(
                organizationId,
                influencer.getId(),
                issued.token(),
                issued.expiresAt()
        );
    }

    /**
     * 로그인 인플루언서가 자신에게 발급된 초대를 한 번만 수락한다.
     *
     * @param token 수락할 원본 초대 토큰
     * @param principal JWT 인증 사용자 정보
     * @return 확정된 조직과 소속 정보
     * @throws BusinessException 초대가 만료·사용됐거나 다른 사용자의 초대인 경우
     */
    @Transactional
    public OrganizationInvitationAcceptResponse accept(
            String token,
            AuthenticatedUser principal
    ) {
        User influencer = requireCurrentInfluencer(principal);
        InvitationData preview = requireInvitation(invitationStore.peek(token));
        if (!preview.influencerId().equals(influencer.getId())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        User lockedInfluencer = lockInfluencer(influencer.getId());
        requireNoActiveOrganization(lockedInfluencer.getId());

        InvitationData consumed = requireInvitation(invitationStore.consume(token));
        if (!consumed.organizationId().equals(preview.organizationId())
                || !consumed.influencerId().equals(preview.influencerId())) {
            throw new BusinessException(ErrorCode.ORGANIZATION_INVITATION_NOT_FOUND);
        }

        Organization organization = organizationRepository.findById(consumed.organizationId())
                .filter(candidate -> "ACTIVE".equals(candidate.getStatus()))
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.ORGANIZATION_MEMBERSHIP_CONFLICT,
                        "초대 조직이 존재하지 않거나 비활성 상태입니다."));
        LocalDateTime joinedAt = LocalDateTime.ofInstant(clock.instant(), clock.getZone());
        OrganizationMember member = organizationMemberRepository
                .findByOrganization_IdAndUser_Id(organization.getId(), lockedInfluencer.getId())
                .map(existing -> reactivate(existing, joinedAt))
                .orElseGet(() -> OrganizationMember.join(
                        organization,
                        lockedInfluencer,
                        OrganizationMemberType.INFLUENCER,
                        joinedAt
                ));

        try {
            OrganizationMember saved = organizationMemberRepository.saveAndFlush(member);
            return new OrganizationInvitationAcceptResponse(
                    OrganizationResponse.from(organization),
                    OrganizationMemberResponse.from(saved)
            );
        } catch (DataIntegrityViolationException exception) {
            throw new BusinessException(
                    ErrorCode.ORGANIZATION_MEMBERSHIP_CONFLICT,
                    "조직 소속을 중복 등록할 수 없습니다.");
        }
    }

    /** 현재 사용자가 활성 매니저인지 검증한다. */
    private User requireManager(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.getRole() != UserRole.MANAGER) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /** 현재 사용자가 조직에 가입 가능한 활성 인플루언서인지 검증한다. */
    private User requireCurrentInfluencer(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.getRole() != UserRole.INFLUENCER) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /** 요청자가 대상 조직의 활성 매니저인지 검증한다. */
    private void requireOrganizationManager(Long organizationId, Long managerId) {
        if (!organizationMemberRepository
                .existsByOrganization_IdAndUser_IdAndMemberTypeAndStatus(
                        organizationId,
                        managerId,
                        OrganizationMemberType.MANAGER,
                        OrganizationMemberStatus.ACTIVE
                )) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
    }

    /** 초대할 수 있는 활성 인플루언서를 조회한다. */
    private User requireInfluencer(Long influencerId) {
        return userRepository.findById(influencerId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .filter(user -> user.getRole() == UserRole.INFLUENCER)
                .orElseThrow(() -> new BusinessException(ErrorCode.INFLUENCER_NOT_FOUND));
    }

    /** 초대 수락 중 다른 조직 가입을 막기 위해 인플루언서 사용자 행을 잠근다. */
    private User lockInfluencer(Long influencerId) {
        return userRepository.findByIdForUpdate(influencerId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .filter(user -> user.getRole() == UserRole.INFLUENCER)
                .orElseThrow(() -> new BusinessException(ErrorCode.INFLUENCER_NOT_FOUND));
    }

    /** 사용자가 다른 활성 조직에 소속되지 않았는지 검증한다. */
    private void requireNoActiveOrganization(Long userId) {
        if (organizationMemberRepository.findFirstByUser_IdAndStatus(
                userId, OrganizationMemberStatus.ACTIVE).isPresent()) {
            throw new BusinessException(ErrorCode.ORGANIZATION_MEMBERSHIP_CONFLICT);
        }
    }

    /** Redis 조회 결과에 유효한 초대가 존재하는지 검증한다. */
    private InvitationData requireInvitation(InvitationData invitation) {
        if (invitation == null) {
            throw new BusinessException(ErrorCode.ORGANIZATION_INVITATION_NOT_FOUND);
        }
        return invitation;
    }

    /** 종료된 기존 소속을 인플루언서 소속으로 다시 활성화한다. */
    private OrganizationMember reactivate(OrganizationMember member, LocalDateTime joinedAt) {
        member.reactivate(OrganizationMemberType.INFLUENCER, joinedAt);
        return member;
    }
}
