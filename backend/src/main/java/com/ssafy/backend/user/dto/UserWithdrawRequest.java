package com.ssafy.backend.user.dto;

/**
 * 회원탈퇴 요청 시 본인 확인에 사용할 비밀번호를 전달한다.
 *
 * <p>{@code @NotBlank}를 걸지 않는다. 소셜 로그인만 사용하는 계정은 비밀번호가 없고 설정할 방법도 없어
 * 필수로 두면 탈퇴 자체가 불가능해진다. 비밀번호가 필요한 계정인지는 서비스 계층이 판단해
 * 누락 시 사용자에게 이유를 알려 준다.
 *
 * @param password 현재 로그인한 계정의 비밀번호이며 소셜 전용 계정은 생략할 수 있다
 */
public record UserWithdrawRequest(
        String password
) {
}
