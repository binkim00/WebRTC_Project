package com.ssafy.backend.user.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;

class UserEntityMappingTest {

    /** User와 공통 시간 필드가 ERD의 컬럼명 및 nullable 조건과 일치하는지 확인한다. */
    @Test
    void mapsUserFieldsToErdColumnNames() throws Exception {
        assertColumn(User.class, "id", "user_id", false);
        assertColumn(User.class, "loginId", "login_id", false);
        assertColumn(User.class, "email", "email", false);
        assertColumn(User.class, "password", "password_hash", false);
        assertColumn(User.class, "nickname", "nickname", false);
        assertColumn(User.class, "role", "role", false);
        assertColumn(User.class, "preferredLanguage", "preferred_language", false);
        assertThat(User.class.getDeclaredField("preferredLanguage").getAnnotation(Enumerated.class).value())
                .isEqualTo(EnumType.STRING);
        assertColumn(User.class, "status", "status", false);
        assertColumn(User.class, "profileImageUrl", "profile_image_url", true);
        assertColumn(User.class, "lastLoginAt", "last_login_at", true);
        assertColumn(User.class, "withdrawnAt", "withdrawn_at", true);
        assertColumn(BaseTimeEntity.class, "createdAt", "created_at", false);
        assertColumn(BaseTimeEntity.class, "updatedAt", "updated_at", false);
    }

    /** 리플렉션으로 특정 필드의 Column 어노테이션 설정을 검증한다. */
    private void assertColumn(Class<?> type, String fieldName, String columnName, boolean nullable)
            throws NoSuchFieldException {
        Field field = type.getDeclaredField(fieldName);
        Column column = field.getAnnotation(Column.class);

        assertThat(column).isNotNull();
        assertThat(column.name()).isEqualTo(columnName);
        assertThat(column.nullable()).isEqualTo(nullable);
    }
}
