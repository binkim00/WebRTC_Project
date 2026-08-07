package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.SignupRequest;
import com.ssafy.backend.auth.exception.DuplicateEmailException;
import com.ssafy.backend.auth.exception.DuplicateLoginIdException;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SignupServiceTest {
    private UserRepository userRepository;
    private PasswordEncoder passwordEncoder;
    private SignupService signupService;

    /** 각 테스트가 독립적으로 실행되도록 저장소와 암호화기 mock을 새로 구성한다. */
    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        signupService = new SignupService(userRepository, passwordEncoder);
    }

    /** 일반 가입이 허용된 역할별로 사용자 정보와 서버 기본값이 올바르게 저장되는지 확인한다. */
    @ParameterizedTest
    @EnumSource(value = UserRole.class, mode = EnumSource.Mode.EXCLUDE, names = "ADMIN")
    void signsUpWithEachAllowedRole(UserRole role) {
        SignupRequest request = request(role);
        when(passwordEncoder.encode("password123")).thenReturn("encoded-password");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        signupService.signup(request);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();
        assertThat(saved.getLoginId()).isEqualTo("login-user");
        assertThat(saved.getEmail()).isEqualTo("user@example.com");
        assertThat(saved.getPassword()).isEqualTo("encoded-password");
        assertThat(saved.getNickname()).isEqualTo("tester");
        assertThat(saved.getRole()).isEqualTo(role);
        assertThat(saved.getPreferredLanguage()).isEqualTo(PreferredLanguage.KOREAN);
        assertThat(saved.getStatus()).isEqualTo(UserStatus.ACTIVE);
        assertThat(saved.getProfileImageUrl()).isNull();
        assertThat(saved.getLastLoginAt()).isNull();
        assertThat(saved.getWithdrawnAt()).isNull();
    }

    /** 로그인 ID가 중복되면 암호화와 저장 전에 가입을 중단하는지 확인한다. */
    @Test
    void rejectsDuplicateLoginIdBeforeEncodingOrSaving() {
        when(userRepository.existsByLoginId("login-user")).thenReturn(true);

        assertThatThrownBy(() -> signupService.signup(request(UserRole.FAN)))
                .isInstanceOf(DuplicateLoginIdException.class);
        verifyNoInteractions(passwordEncoder);
        verify(userRepository, never()).save(any());
    }

    /** 이메일이 중복되면 암호화와 저장 전에 가입을 중단하는지 확인한다. */
    @Test
    void rejectsDuplicateEmailBeforeEncodingOrSaving() {
        when(userRepository.existsByEmail("user@example.com")).thenReturn(true);

        assertThatThrownBy(() -> signupService.signup(request(UserRole.FAN)))
                .isInstanceOf(DuplicateEmailException.class);
        verifyNoInteractions(passwordEncoder);
        verify(userRepository, never()).save(any());
    }

    /**
     * 닉네임이 중복되면 암호화와 저장 전에 가입을 중단하는지 확인한다.
     *
     * <p>가입 화면의 중복 확인과 가입 요청 사이에 같은 닉네임이 먼저 등록될 수 있어
     * 서버가 같은 기준으로 다시 확인해야 한다.
     */
    @Test
    void rejectsDuplicateNicknameBeforeEncodingOrSaving() {
        when(userRepository.existsByNickname("tester")).thenReturn(true);

        assertThatThrownBy(() -> signupService.signup(request(UserRole.FAN)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DUPLICATE_NICKNAME));
        verifyNoInteractions(passwordEncoder);
        verify(userRepository, never()).save(any());
    }

    /** 역할별 서비스 테스트에서 공통으로 사용할 유효한 회원가입 요청을 생성한다. */
    private SignupRequest request(UserRole role) {
        return new SignupRequest(
                " login-user ", "password123", " User@Example.com ", " tester ",
                role, PreferredLanguage.KOREAN, true, true
        );
    }
}
