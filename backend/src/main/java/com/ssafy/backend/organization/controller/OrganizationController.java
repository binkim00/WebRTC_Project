package com.ssafy.backend.organization.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.organization.dto.MyOrganizationMembersResponse;
import com.ssafy.backend.organization.dto.OrganizationCreateRequest;
import com.ssafy.backend.organization.dto.OrganizationMemberAddRequest;
import com.ssafy.backend.organization.dto.OrganizationMemberRemoveResponse;
import com.ssafy.backend.organization.dto.OrganizationMemberResponse;
import com.ssafy.backend.organization.dto.OrganizationResponse;
import com.ssafy.backend.organization.service.OrganizationService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 조직 생성과 매니저·인플루언서 소속 관리 API를 제공한다.
 */
@RestController
@RequestMapping("/api/v1/organizations")
public class OrganizationController {

    private final OrganizationService organizationService;

    /**
     * 조직 관리 서비스를 주입받는다.
     *
     * @param organizationService 조직 관리 서비스
     */
    public OrganizationController(OrganizationService organizationService) {
        this.organizationService = organizationService;
    }

    /**
     * 매니저의 조직을 생성하고 생성자를 매니저 구성원으로 등록한다.
     *
     * @param request 조직 생성 정보
     * @param principal JWT 인증 사용자 정보
     * @return 생성된 조직 정보
     */
    @PostMapping
    public ApiResponse<OrganizationResponse> createOrganization(
            @Valid @RequestBody OrganizationCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(organizationService.createOrganization(principal, request));
    }

    /**
     * 가입된 인플루언서를 요청 조직의 활성 구성원으로 연결한다.
     *
     * @param organizationId 조직 식별자
     * @param request 연결할 인플루언서 정보
     * @param principal JWT 인증 사용자 정보
     * @return 연결된 조직 구성원 정보
     */
    @PostMapping("/{organizationId}/members")
    public ApiResponse<OrganizationMemberResponse> addMember(
            @PathVariable Long organizationId,
            @Valid @RequestBody OrganizationMemberAddRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(organizationService.addMember(
                organizationId, request, principal));
    }

    /**
     * 현재 사용자의 활성 조직과 같은 조직의 구성원 목록을 조회한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 현재 조직과 활성 구성원 목록
     */
    @GetMapping("/me/members")
    public ApiResponse<MyOrganizationMembersResponse> getMyOrganizationMembers(
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(organizationService.getMyOrganizationMembers(principal));
    }

    /**
     * 대상 사용자의 조직 소속을 삭제하지 않고 비활성화한다.
     *
     * @param organizationId 조직 식별자
     * @param userId 소속을 종료할 사용자 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 소속 종료 결과
     */
    @DeleteMapping("/{organizationId}/members/{userId}")
    public ApiResponse<OrganizationMemberRemoveResponse> removeMember(
            @PathVariable Long organizationId,
            @PathVariable Long userId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(organizationService.removeMember(
                organizationId, userId, principal));
    }
}
