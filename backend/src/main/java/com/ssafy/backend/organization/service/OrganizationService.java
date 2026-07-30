package com.ssafy.backend.organization.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.organization.domain.Organization;
import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.dto.MyOrganizationMembersResponse;
import com.ssafy.backend.organization.dto.OrganizationCreateRequest;
import com.ssafy.backend.organization.dto.OrganizationMemberAddRequest;
import com.ssafy.backend.organization.dto.OrganizationMemberRemoveResponse;
import com.ssafy.backend.organization.dto.OrganizationMemberResponse;
import com.ssafy.backend.organization.dto.OrganizationResponse;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.organization.repository.OrganizationRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 조직 생성과 매니저·인플루언서 소속 관리를 처리한다.
 */
@Service
public class OrganizationService {

    private final CurrentUserService currentUserService;
    private final UserRepository userRepository;
    private final OrganizationRepository organizationRepository;
    private final OrganizationMemberRepository organizationMemberRepository;

    /**
     * 조직 관리에 필요한 사용자와 조직 저장소를 주입받는다.
     *
     * @param currentUserService 현재 활성 사용자 조회 서비스
     * @param userRepository 사용자 저장소
     * @param organizationRepository 조직 저장소
     * @param organizationMemberRepository 조직 소속 저장소
     */
    public OrganizationService(
            CurrentUserService currentUserService,
            UserRepository userRepository,
            OrganizationRepository organizationRepository,
            OrganizationMemberRepository organizationMemberRepository
    ) {
        this.currentUserService = currentUserService;
        this.userRepository = userRepository;
        this.organizationRepository = organizationRepository;
        this.organizationMemberRepository = organizationMemberRepository;
    }

    /**
     * 매니저의 조직을 만들고 생성자를 활성 매니저 구성원으로 함께 등록한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @param request 조직 생성 정보
     * @return 생성된 조직 정보
     * @throws BusinessException 매니저가 아니거나 이미 활성 조직이 있는 경우
     */
    @Transactional
    public OrganizationResponse createOrganization(
            AuthenticatedUser principal,
            OrganizationCreateRequest request
    ) {
        User manager = lockUser(
                requireManager(principal).getId(),
                UserRole.MANAGER,
                ErrorCode.ACTIVE_USER_NOT_FOUND
        );
        requireNoActiveOrganization(manager.getId());

        String businessNumber = normalizeOptional(request.businessNumber());
        if (businessNumber != null && organizationRepository.existsByBusinessNumber(businessNumber)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "이미 등록된 사업자등록번호입니다.");
        }

        Organization organization = Organization.createActive(
                request.name().trim(),
                businessNumber,
                normalizeOptional(request.representativeName()),
                normalizeOptional(request.contactEmail()),
                normalizeOptional(request.contactPhone()),
                normalizeOptional(request.logoUrl()),
                normalizeOptional(request.description())
        );

        try {
            Organization savedOrganization = organizationRepository.saveAndFlush(organization);
            organizationMemberRepository.saveAndFlush(OrganizationMember.join(
                    savedOrganization,
                    manager,
                    OrganizationMemberType.MANAGER,
                    LocalDateTime.now()
            ));
            return OrganizationResponse.from(savedOrganization);
        } catch (DataIntegrityViolationException exception) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "조직 정보가 중복되었거나 유효하지 않습니다.");
        }
    }

    /**
     * 같은 조직의 매니저가 가입된 인플루언서를 활성 구성원으로 연결한다.
     *
     * @param organizationId 조직 식별자
     * @param request 연결할 인플루언서 정보
     * @param principal JWT 인증 사용자 정보
     * @return 활성화된 조직 구성원 정보
     * @throws BusinessException 권한이 없거나 대상 사용자를 연결할 수 없는 경우
     */
    @Transactional
    public OrganizationMemberResponse addMember(
            Long organizationId,
            OrganizationMemberAddRequest request,
            AuthenticatedUser principal
    ) {
        requireAdmin(principal);
        User influencer = lockUser(
                request.userId(),
                UserRole.INFLUENCER,
                ErrorCode.INFLUENCER_NOT_FOUND
        );

        organizationMemberRepository.findFirstByUser_IdAndStatus(
                influencer.getId(), OrganizationMemberStatus.ACTIVE
        ).ifPresent(member -> {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "이미 활성 조직에 소속된 사용자입니다.");
        });

        Organization organization = organizationRepository.findById(organizationId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.INVALID_REQUEST, "조직을 찾을 수 없습니다."));
        LocalDateTime joinedAt = LocalDateTime.now();
        OrganizationMember member = organizationMemberRepository
                .findByOrganization_IdAndUser_Id(organizationId, influencer.getId())
                .map(existing -> reactivate(existing, joinedAt))
                .orElseGet(() -> OrganizationMember.join(
                        organization, influencer, OrganizationMemberType.INFLUENCER, joinedAt));

        try {
            return OrganizationMemberResponse.from(organizationMemberRepository.saveAndFlush(member));
        } catch (DataIntegrityViolationException exception) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "조직 소속을 중복 등록할 수 없습니다.");
        }
    }

    /**
     * 현재 사용자의 활성 조직과 같은 조직의 활성 구성원 목록을 조회한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 현재 조직과 구성원 목록
     * @throws BusinessException 활성 조직 소속이 없는 경우
     */
    @Transactional(readOnly = true)
    public MyOrganizationMembersResponse getMyOrganizationMembers(AuthenticatedUser principal) {
        User currentUser = currentUserService.requireActiveUser(principal);
        OrganizationMember currentMembership = requireActiveMembership(currentUser.getId());
        List<OrganizationMemberResponse> members = organizationMemberRepository
                .findAllByOrganization_IdAndStatusOrderByJoinedAtAscIdAsc(
                        currentMembership.getOrganization().getId(),
                        OrganizationMemberStatus.ACTIVE
                )
                .stream()
                .map(OrganizationMemberResponse::from)
                .toList();
        return new MyOrganizationMembersResponse(
                OrganizationResponse.from(currentMembership.getOrganization()),
                members
        );
    }

    /**
     * 같은 조직의 매니저가 대상 구성원의 소속을 비활성화한다.
     *
     * @param organizationId 조직 식별자
     * @param userId 소속을 종료할 사용자 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 소속 종료 결과
     * @throws BusinessException 권한이 없거나 활성 소속을 찾을 수 없는 경우
     */
    @Transactional
    public OrganizationMemberRemoveResponse removeMember(
            Long organizationId,
            Long userId,
            AuthenticatedUser principal
    ) {
        User manager = requireOrganizationManager(organizationId, principal);
        if (manager.getId().equals(userId)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "자신의 매니저 소속은 직접 해제할 수 없습니다.");
        }
        OrganizationMember member = organizationMemberRepository
                .findByOrganization_IdAndUser_Id(organizationId, userId)
                .filter(existing -> existing.getStatus() == OrganizationMemberStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.INVALID_REQUEST, "활성 조직 소속을 찾을 수 없습니다."));
        member.deactivate(LocalDateTime.now());
        return OrganizationMemberRemoveResponse.from(organizationMemberRepository.saveAndFlush(member));
    }

    /** 현재 사용자가 매니저인지 검증한다. */
    private User requireManager(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.getRole() != UserRole.MANAGER) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /** 현재 사용자가 관리자인지 검증한다. */
    private User requireAdmin(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.getRole() != UserRole.ADMIN) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /** 현재 사용자가 요청 조직의 활성 매니저인지 검증한다. */
    private User requireOrganizationManager(Long organizationId, AuthenticatedUser principal) {
        User manager = requireManager(principal);
        if (!organizationMemberRepository
                .existsByOrganization_IdAndUser_IdAndMemberTypeAndStatus(
                        organizationId,
                        manager.getId(),
                        OrganizationMemberType.MANAGER,
                        OrganizationMemberStatus.ACTIVE
                )) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return manager;
    }

    /** 조직 소속 변경을 직렬화하기 위해 사용자 행을 잠그고 역할을 검증한다. */
    private User lockUser(Long userId, UserRole requiredRole, ErrorCode notFoundErrorCode) {
        return userRepository.findByIdForUpdate(userId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .filter(user -> user.getRole() == requiredRole)
                .orElseThrow(() -> new BusinessException(notFoundErrorCode));
    }

    /** 사용자가 다른 활성 조직에 소속되지 않았는지 검증한다. */
    private void requireNoActiveOrganization(Long userId) {
        if (organizationMemberRepository.findFirstByUser_IdAndStatus(
                userId, OrganizationMemberStatus.ACTIVE).isPresent()) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "이미 활성 조직에 소속되어 있습니다.");
        }
    }

    /** 사용자의 활성 조직 소속을 조회한다. */
    private OrganizationMember requireActiveMembership(Long userId) {
        return organizationMemberRepository.findFirstByUser_IdAndStatus(
                        userId, OrganizationMemberStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.INVALID_REQUEST, "활성 조직 소속이 없습니다."));
    }

    /** 종료된 기존 소속을 인플루언서 소속으로 다시 활성화한다. */
    private OrganizationMember reactivate(OrganizationMember member, LocalDateTime joinedAt) {
        member.reactivate(OrganizationMemberType.INFLUENCER, joinedAt);
        return member;
    }

    /** 선택 문자열의 앞뒤 공백을 제거하고 빈 값은 null로 변환한다. */
    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
