package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.AvailabilityResponse;
import com.ssafy.backend.auth.dto.AvailabilityTarget;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AccountAvailabilityServiceTest {

    private UserRepository userRepository;
    private AccountAvailabilityService accountAvailabilityService;

    /** 각 테스트가 독립적으로 실행되도록 저장소 mock을 새로 구성한다. */
    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        accountAvailabilityService = new AccountAvailabilityService(userRepository);
    }

    /** 사용 중이지 않은 로그인 ID는 사용 가능으로 응답하는지 확인한다. */
    @Test
    void reportsUnusedLoginIdAsAvailable() {
        when(userRepository.existsByLoginId("newbie")).thenReturn(false);

        AvailabilityResponse response = accountAvailabilityService.check("LOGIN_ID", "newbie");

        assertThat(response.target()).isEqualTo(AvailabilityTarget.LOGIN_ID);
        assertThat(response.value()).isEqualTo("newbie");
        assertThat(response.available()).isTrue();
    }

    /** 이미 쓰이고 있는 로그인 ID는 사용 불가로 응답하는지 확인한다. */
    @Test
    void reportsTakenLoginIdAsUnavailable() {
        when(userRepository.existsByLoginId("taken")).thenReturn(true);

        assertThat(accountAvailabilityService.check("LOGIN_ID", "taken").available()).isFalse();
    }

    /** 이미 쓰이고 있는 닉네임은 사용 불가로 응답하는지 확인한다. */
    @Test
    void reportsTakenNicknameAsUnavailable() {
        when(userRepository.existsByNickname("멜리")).thenReturn(true);

        AvailabilityResponse response = accountAvailabilityService.check("NICKNAME", "멜리");

        assertThat(response.target()).isEqualTo(AvailabilityTarget.NICKNAME);
        assertThat(response.available()).isFalse();
    }

    /** 가입과 같은 기준으로 확인하도록 앞뒤 공백을 제거한 값으로 조회하는지 확인한다. */
    @Test
    void checksTrimmedValue() {
        when(userRepository.existsByLoginId("spaced")).thenReturn(false);

        AvailabilityResponse response = accountAvailabilityService.check("login-id", "  spaced  ");

        assertThat(response.value()).isEqualTo("spaced");
        assertThat(response.available()).isTrue();
    }

    /** 지원하지 않는 확인 항목은 조회 없이 거부하는지 확인한다. */
    @Test
    void rejectsUnsupportedTarget() {
        assertThatThrownBy(() -> accountAvailabilityService.check("EMAIL", "user@example.com"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DUPLICATE_CHECK_TARGET_NOT_SUPPORTED));
        verifyNoInteractions(userRepository);
    }

    /** 공백만 있는 값은 조회 없이 거부하는지 확인한다. */
    @Test
    void rejectsBlankValue() {
        assertThatThrownBy(() -> accountAvailabilityService.check("NICKNAME", "   "))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
        verifyNoInteractions(userRepository);
    }

    /** 저장할 수 없는 길이의 닉네임을 사용 가능으로 응답하지 않는지 확인한다. */
    @Test
    void rejectsNicknameLongerThanColumnLength() {
        assertThatThrownBy(() -> accountAvailabilityService.check("NICKNAME", "가".repeat(51)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
        verifyNoInteractions(userRepository);
    }
}
