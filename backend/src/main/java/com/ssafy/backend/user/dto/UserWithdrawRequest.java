package com.ssafy.backend.user.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 회원탈퇴 요청 시 본인 확인에 사용할 비밀번호를 전달한다.
 *
 * @param password 현재 로그인한 계정의 비밀번호
 */
public record UserWithdrawRequest(
        @NotBlank String password
) {
}
