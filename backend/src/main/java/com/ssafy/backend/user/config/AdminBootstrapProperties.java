package com.ssafy.backend.user.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 서버 기동 시 자동으로 만들 서비스 운영자(ADMIN) 계정 설정이다.
 *
 * <p>ADMIN은 회원가입 API로 만들 수 없고 시드 SQL({@code data-local.sql})은 local 프로파일에서만
 * 실행되므로, DB를 초기화하는 환경에서는 계정을 다시 확보할 수단이 없다. 이 설정으로 기동 시
 * 한 번만 계정을 만들어 그 공백을 메운다.
 *
 * <p>{@code loginId}·{@code password}·{@code email} 중 하나라도 비어 있으면 아무 계정도 만들지
 * 않으므로, 이 기능이 필요 없는 환경은 값을 설정하지 않으면 된다.
 *
 * @param loginId 생성할 계정의 로그인 아이디
 * @param password 생성할 계정의 평문 비밀번호이며 저장 시 BCrypt로 암호화한다
 * @param email 생성할 계정의 이메일
 * @param nickname 생성할 계정의 표시 이름
 */
@ConfigurationProperties(prefix = "app.admin-bootstrap")
public record AdminBootstrapProperties(
        String loginId,
        String password,
        String email,
        String nickname
) {
}
