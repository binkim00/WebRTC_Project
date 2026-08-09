package com.ssafy.backend.auth.dto;

import java.time.LocalDateTime;

/**
 * 비밀번호 재설정 완료 결과다.
 *
 * <p>토큰을 가진 사람은 이미 그 계정의 메일함을 확인한 사람이므로 로그인 ID를 함께 돌려준다.
 * 재설정 직후 로그인 화면에서 아이디를 다시 떠올리지 않아도 되게 하기 위해서다.
 *
 * @param loginId 비밀번호를 바꾼 계정의 로그인 ID
 * @param resetAt 재설정을 마친 시각
 */
public record PasswordResetConfirmResponse(String loginId, LocalDateTime resetAt) {

    /**
     * 재설정 완료 응답을 만든다.
     *
     * @param loginId 비밀번호를 바꾼 계정의 로그인 ID
     * @param resetAt 재설정 시각
     * @return 재설정 완료 응답
     */
    public static PasswordResetConfirmResponse of(String loginId, LocalDateTime resetAt) {
        return new PasswordResetConfirmResponse(loginId, resetAt);
    }
}
