package com.ssafy.backend.user.dto;

import java.time.LocalDateTime;

/**
 * 비밀번호 변경 결과다.
 *
 * <p>{@code reloginRequired}는 항상 참이다. 변경과 동시에 모든 기기의 로그인 세션을 끊기 때문에,
 * 프론트가 이 값을 보고 세션을 정리하고 로그인 화면으로 안내할 수 있게 명시적으로 내려 준다.
 *
 * @param changedAt 비밀번호를 바꾼 시각
 * @param reloginRequired 다시 로그인해야 하는지 여부
 */
public record PasswordChangeResponse(LocalDateTime changedAt, boolean reloginRequired) {

    /**
     * 변경 결과 응답을 만든다.
     *
     * @param changedAt 비밀번호를 바꾼 시각
     * @return 재로그인이 필요함을 알리는 변경 결과
     */
    public static PasswordChangeResponse of(LocalDateTime changedAt) {
        return new PasswordChangeResponse(changedAt, true);
    }
}
