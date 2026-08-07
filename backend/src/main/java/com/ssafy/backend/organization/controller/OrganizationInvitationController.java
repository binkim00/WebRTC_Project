package com.ssafy.backend.organization.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.organization.dto.OrganizationInvitationAcceptResponse;
import com.ssafy.backend.organization.dto.OrganizationInvitationCreateRequest;
import com.ssafy.backend.organization.dto.OrganizationInvitationResponse;
import com.ssafy.backend.organization.service.OrganizationInvitationService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 조직 초대 토큰 발급과 수락 API를 제공한다.
 */
@RestController
@RequestMapping("/api/v1")
public class OrganizationInvitationController {

    private final OrganizationInvitationService invitationService;

    /**
     * 조직 초대 서비스를 주입받는다.
     *
     * @param invitationService 조직 초대 서비스
     */
    public OrganizationInvitationController(OrganizationInvitationService invitationService) {
        this.invitationService = invitationService;
    }

    /**
     * 조직의 활성 매니저가 인플루언서에게 일회성 초대 토큰을 발급한다.
     *
     * @param organizationId 초대 조직 식별자
     * @param request 초대 대상 인플루언서 정보
     * @param principal JWT 인증 사용자 정보
     * @return 발급한 원본 토큰과 만료 정보
     */
    @PostMapping("/organizations/{organizationId}/invitations")
    public ApiResponse<OrganizationInvitationResponse> issue(
            @PathVariable Long organizationId,
            @Valid @RequestBody OrganizationInvitationCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(invitationService.issue(
                organizationId, request, principal));
    }

    /**
     * 로그인 인플루언서가 자신에게 발급된 일회성 초대를 수락한다.
     *
     * @param token 수락할 원본 초대 토큰
     * @param principal JWT 인증 사용자 정보
     * @return 확정된 조직과 소속 정보
     */
    @PostMapping("/organization-invitations/{token}/accept")
    public ApiResponse<OrganizationInvitationAcceptResponse> accept(
            @PathVariable String token,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(invitationService.accept(token, principal));
    }
}
