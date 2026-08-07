package com.ssafy.backend.user.support;

import com.ssafy.backend.user.config.AdminBootstrapProperties;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AdminBootstrapRunnerTest {

    private static final String LOGIN_ID = "adminmelly";
    private static final String PASSWORD = "admin-password";
    private static final String EMAIL = "admin@melly.test";

    private UserRepository userRepository;
    private PasswordEncoder passwordEncoder;

    /** 각 테스트마다 mock 저장소와 인코더를 새로 준비한다. */
    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
    }

    /** 활성 ADMIN이 없으면 설정값으로 운영자 계정을 만드는지 검증한다. */
    @Test
    void createsAdminWhenNoActiveAdminExists() {
        AdminBootstrapRunner runner = runner(properties("멜리관리자"));
        when(userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(0L);
        when(userRepository.existsByLoginId(LOGIN_ID)).thenReturn(false);
        when(userRepository.existsByEmail(EMAIL)).thenReturn(false);
        when(passwordEncoder.encode(PASSWORD)).thenReturn("encoded-password");

        runner.run(null);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();
        assertThat(saved.getLoginId()).isEqualTo(LOGIN_ID);
        assertThat(saved.getEmail()).isEqualTo(EMAIL);
        assertThat(saved.getNickname()).isEqualTo("멜리관리자");
        assertThat(saved.getRole()).isEqualTo(UserRole.ADMIN);
        assertThat(saved.getStatus()).isEqualTo(UserStatus.ACTIVE);
        assertThat(saved.getPreferredLanguage()).isEqualTo(PreferredLanguage.KOREAN);
        // 평문이 그대로 저장되지 않도록 인코더를 거친 값만 들어가야 한다.
        assertThat(saved.getPassword()).isEqualTo("encoded-password");
    }

    /** 이미 활성 ADMIN이 있으면 계정을 만들지 않는지 검증한다. */
    @Test
    void skipsWhenActiveAdminAlreadyExists() {
        AdminBootstrapRunner runner = runner(properties("멜리관리자"));
        when(userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(1L);

        runner.run(null);

        verify(userRepository, never()).save(any(User.class));
        verifyNoInteractions(passwordEncoder);
    }

    /** 설정값이 비어 있으면 저장소를 조회하지도 않는지 검증한다. */
    @Test
    void skipsWhenSettingsAreEmpty() {
        AdminBootstrapRunner runner = runner(
                new AdminBootstrapProperties("", "", "", "멜리관리자"));

        runner.run(null);

        verifyNoInteractions(userRepository);
        verifyNoInteractions(passwordEncoder);
    }

    /** 비밀번호만 비어도 계정을 만들지 않는지 검증한다. */
    @Test
    void skipsWhenPasswordIsMissing() {
        AdminBootstrapRunner runner = runner(
                new AdminBootstrapProperties(LOGIN_ID, null, EMAIL, "멜리관리자"));

        runner.run(null);

        verifyNoInteractions(userRepository);
    }

    /** 같은 로그인 아이디를 쓰는 계정이 있으면 저장하지 않는지 검증한다. */
    @Test
    void skipsWhenLoginIdIsAlreadyTaken() {
        AdminBootstrapRunner runner = runner(properties("멜리관리자"));
        when(userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(0L);
        when(userRepository.existsByLoginId(LOGIN_ID)).thenReturn(true);

        runner.run(null);

        verify(userRepository, never()).save(any(User.class));
        verify(passwordEncoder, never()).encode(anyString());
    }

    /** 같은 이메일을 쓰는 계정이 있으면 저장하지 않는지 검증한다. */
    @Test
    void skipsWhenEmailIsAlreadyTaken() {
        AdminBootstrapRunner runner = runner(properties("멜리관리자"));
        when(userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(0L);
        when(userRepository.existsByLoginId(LOGIN_ID)).thenReturn(false);
        when(userRepository.existsByEmail(EMAIL)).thenReturn(true);

        runner.run(null);

        verify(userRepository, never()).save(any(User.class));
    }

    /** 표시 이름을 비우면 로그인 아이디를 대신 쓰는지 검증한다. */
    @Test
    void fallsBackToLoginIdWhenNicknameIsBlank() {
        AdminBootstrapRunner runner = runner(properties("  "));
        when(userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(0L);
        when(userRepository.existsByLoginId(LOGIN_ID)).thenReturn(false);
        when(userRepository.existsByEmail(EMAIL)).thenReturn(false);
        when(passwordEncoder.encode(PASSWORD)).thenReturn("encoded-password");

        runner.run(null);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        assertThat(captor.getValue().getNickname()).isEqualTo(LOGIN_ID);
    }

    /**
     * 지정한 표시 이름을 가진 계정 생성 설정을 만든다.
     *
     * @param nickname 생성할 계정의 표시 이름
     * @return 운영자 계정 자동 생성 설정
     */
    private AdminBootstrapProperties properties(String nickname) {
        return new AdminBootstrapProperties(LOGIN_ID, PASSWORD, EMAIL, nickname);
    }

    /**
     * 주어진 설정으로 기동 시 실행할 러너를 만든다.
     *
     * @param properties 운영자 계정 자동 생성 설정
     * @return 검증 대상 러너
     */
    private AdminBootstrapRunner runner(AdminBootstrapProperties properties) {
        return new AdminBootstrapRunner(properties, userRepository, passwordEncoder);
    }
}
