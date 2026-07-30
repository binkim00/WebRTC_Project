package com.ssafy.backend.application.controller;

import com.ssafy.backend.application.dto.ApplicationFormResponse;
import com.ssafy.backend.application.dto.ApplicationFormSaveRequest;
import com.ssafy.backend.application.dto.ApplicationFormSaveResponse;
import com.ssafy.backend.application.service.ApplicationFormService;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 팬미팅별 응모 폼 조회와 저장 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}/application-form")
public class ApplicationFormController {

    private final ApplicationFormService applicationFormService;

    /**
     * 응모 폼 서비스를 주입받는다.
     *
     * @param applicationFormService 응모 폼 서비스
     */
    public ApplicationFormController(ApplicationFormService applicationFormService) {
        this.applicationFormService = applicationFormService;
    }

    /**
     * 팬미팅의 응모 안내문과 질문 목록을 조회한다.
     *
     * @param meetingId 응모 폼을 조회할 팬미팅 식별자
     * @return 공통 성공 형식으로 감싼 응모 폼 정보
     */
    @GetMapping
    public ApiResponse<ApplicationFormResponse> getForm(@PathVariable Long meetingId) {
        return ApiResponse.success(applicationFormService.getForm(meetingId));
    }

    /**
     * 소유 운영자가 팬미팅의 응모 안내문과 질문 전체를 저장한다.
     *
     * @param meetingId 응모 폼을 저장할 팬미팅 식별자
     * @param request 저장할 안내문과 질문 전체 목록
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 저장된 응모 폼 정보
     */
    @PutMapping
    public ApiResponse<ApplicationFormSaveResponse> saveForm(
            @PathVariable Long meetingId,
            @Valid @RequestBody ApplicationFormSaveRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(applicationFormService.saveForm(meetingId, request, principal));
    }
}
