package com.ssafy.backend.user.domain;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UserWithdrawTest {
    private static final LocalDateTime WITHDRAWN_AT = LocalDateTime.of(2026, 8, 2, 15, 30);

    /** 탈퇴가 식별 가능한 값을 식별자 기반의 결정적 값으로 바꾸는지 검증한다. */
    @Test
    void anonymizesIdentifiableValues() {
        User user = user();

        user.withdraw(WITHDRAWN_AT);

        assertThat(user.getStatus()).isEqualTo(UserStatus.WITHDRAWN);
        assertThat(user.getWithdrawnAt()).isEqualTo(WITHDRAWN_AT);
        assertThat(user.getLoginId()).isEqualTo("withdrawn_7");
        assertThat(user.getEmail()).isEqualTo("withdrawn_7@withdrawn.invalid");
        assertThat(user.getNickname()).isEqualTo("탈퇴한 사용자");
        assertThat(user.getProfileImageUrl()).isNull();
    }

    /** 비식별화 값이 컬럼 길이 제약을 넘지 않는지 검증한다. */
    @Test
    void keepsAnonymizedValuesWithinColumnLimits() {
        User user = user();
        ReflectionTestUtils.setField(user, "id", Long.MAX_VALUE);

        user.withdraw(WITHDRAWN_AT);

        assertThat(user.getLoginId().length()).isLessThanOrEqualTo(100);
        assertThat(user.getEmail().length()).isLessThanOrEqualTo(255);
        assertThat(user.getNickname().length()).isLessThanOrEqualTo(50);
    }

    /** 저장된 비밀번호가 어떤 입력과도 매칭될 수 없는 값으로 바뀌는지 검증한다. */
    @Test
    void replacesPasswordWithNonBcryptValue() {
        User user = user();

        user.withdraw(WITHDRAWN_AT);

        assertThat(user.getPassword()).isNotEqualTo("encoded").doesNotStartWith("$2");
    }

    /** 이미 탈퇴한 계정의 재탈퇴를 엔티티가 스스로 거부하는지 검증한다. */
    @Test
    void rejectsSecondWithdrawal() {
        User user = user();
        user.withdraw(WITHDRAWN_AT);

        assertThatThrownBy(() -> user.withdraw(WITHDRAWN_AT.plusDays(1)))
                .isInstanceOf(IllegalStateException.class);
    }

    /** 테스트에 사용할 활성 사용자 엔티티를 생성하고 식별자와 프로필 이미지를 설정한다. */
    private User user() {
        User user = User.createActive("fan01", "fan@example.com", "encoded", "원래닉네임",
                UserRole.FAN, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", 7L);
        ReflectionTestUtils.setField(user, "profileImageUrl", "https://cdn.example.com/profile.png");
        return user;
    }
}
