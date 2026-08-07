package com.ssafy.backend.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

/**
 * 비밀번호 재설정 메일 발송 요청의 결과다.
 *
 * <p>가입되지 않은 이메일이어도 같은 내용을 돌려준다. "이 주소는 가입되어 있다"는 사실이 응답으로
 * 드러나면 로그인 없이 회원 목록을 훑을 수 있기 때문이다.
 *
 * @param email 요청에 담겼던 이메일
 * @param expiresAt 발송한 링크의 만료 시각이며 발송 여부와 무관하게 같은 규칙으로 계산한다
 * @param resendAvailableAt 다음 요청이 가능한 시각
 * @param devToken 개발 프로파일에서만 채우는 토큰 원문이며 운영에서는 항상 비어 있다
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PasswordResetSendResponse(
        String email,
        LocalDateTime expiresAt,
        LocalDateTime resendAvailableAt,
        String devToken
) {

    /**
     * 발송 결과 응답을 만든다.
     *
     * @param email 요청에 담겼던 이메일
     * @param expiresAt 링크 만료 시각
     * @param resendAvailableAt 다음 요청 가능 시각
     * @param devToken 개발 프로파일에서만 노출할 토큰 원문
     * @return 발송 결과 응답
     */
    public static PasswordResetSendResponse of(String email, LocalDateTime expiresAt,
                                               LocalDateTime resendAvailableAt, String devToken) {
        return new PasswordResetSendResponse(email, expiresAt, resendAvailableAt, devToken);
    }
}
