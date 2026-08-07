package com.ssafy.backend.user.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 회원 상태 enum이 현재 ERD에 확정된 값만 포함하는지 검증한다. */
class UserStatusTest {
    /** 기존 INACTIVE가 제거되고 ACTIVE·SUSPENDED·WITHDRAWN 순서가 유지되는지 확인한다. */
    @Test
        void containsOnlyErdAccountStatuses() {
        assertThat(UserStatus.values())
                .containsExactly(UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.WITHDRAWN);
    }
}
