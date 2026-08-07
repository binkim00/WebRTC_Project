package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.PasswordResetConfirmRequest;
import com.ssafy.backend.auth.dto.PasswordResetConfirmResponse;
import com.ssafy.backend.auth.dto.PasswordResetRequest;
import com.ssafy.backend.auth.dto.PasswordResetSendResponse;
import com.ssafy.backend.auth.service.PasswordResetService;
import com.ssafy.backend.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 로그인하지 못하는 사용자의 비밀번호 재설정 API를 제공한다.
 *
 * <p>두 엔드포인트 모두 로그인 없이 호출한다. 신원은 URL 권한이 아니라 메일함으로 전달된
 * 1회용 토큰으로 확인한다.
 */
@RestController
@RequestMapping("/api/v1/auth/password-reset")
public class PasswordResetController {

    private final PasswordResetService passwordResetService;

    /**
     * 비밀번호 재설정 서비스를 주입받는다.
     *
     * @param passwordResetService 비밀번호 재설정 서비스
     */
    public PasswordResetController(PasswordResetService passwordResetService) {
        this.passwordResetService = passwordResetService;
    }

    /**
     * 입력한 이메일로 비밀번호 재설정 링크를 발송한다.
     *
     * <p>가입되지 않은 주소여도 같은 응답을 돌려주므로 응답만으로 가입 여부를 알 수 없다.
     *
     * @param request 재설정 메일을 받을 이메일
     * @return 공통 성공 형식으로 감싼 만료 시각과 다음 요청 가능 시각
     */
    @PostMapping
    public ApiResponse<PasswordResetSendResponse> requestReset(
            @Valid @RequestBody PasswordResetRequest request
    ) {
        return ApiResponse.success(passwordResetService.requestReset(request));
    }

    /**
     * 메일로 받은 토큰을 검증해 새 비밀번호를 저장한다.
     *
     * @param request 토큰 원문과 새 비밀번호
     * @return 공통 성공 형식으로 감싼 계정 로그인 ID와 처리 시각
     */
    @PostMapping("/confirm")
    public ApiResponse<PasswordResetConfirmResponse> confirmReset(
            @Valid @RequestBody PasswordResetConfirmRequest request
    ) {
        return ApiResponse.success(passwordResetService.confirmReset(request));
    }
}
