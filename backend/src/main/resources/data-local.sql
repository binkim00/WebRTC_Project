UPDATE users
SET preferred_language = 'KOREAN'
WHERE preferred_language = 'ko';

INSERT INTO users (
    login_id,
    password_hash,
    email,
    nickname,
    role,
    status,
    preferred_language,
    created_at,
    updated_at
)
SELECT
    'adminmelly',
    '$2y$10$E.SAetrejZ8uv8Il3EoTte.cYDU5piNc0fxbq7fv.8D0gJdbLoLDm',
    'admin@melly.test',
    '멜리관리자',
    'ADMIN',
    'ACTIVE',
    'KOREAN',
    NOW(),
    NOW()
    WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE login_id = 'adminmelly'
);

INSERT INTO users (
    login_id,
    password_hash,
    email,
    nickname,
    role,
    status,
    preferred_language,
    created_at,
    updated_at
)
SELECT
    'testuser1',
    '$2y$10$O.QlRVhtccpaGjg9ZrTlGegtkJ5t.5IXN/UbcNY/xhsghSA2C6pm2',
    'testuser1@melly.test',
    '테스트팬',
    'FAN',
    'ACTIVE',
    'KOREAN',
    NOW(),
    NOW()
    WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE login_id = 'testuser1'
);

INSERT INTO users (
    login_id,
    password_hash,
    email,
    nickname,
    role,
    status,
    preferred_language,
    created_at,
    updated_at
)
SELECT
    'testuser2',
    '$2y$10$O.QlRVhtccpaGjg9ZrTlGegtkJ5t.5IXN/UbcNY/xhsghSA2C6pm2',
    'testuser2@melly.test',
    '테스트인플루언서',
    'INFLUENCER',
    'ACTIVE',
    'KOREAN',
    NOW(),
    NOW()
    WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE login_id = 'testuser2'
);

INSERT INTO users (
    login_id,
    password_hash,
    email,
    nickname,
    role,
    status,
    preferred_language,
    created_at,
    updated_at
)
SELECT
    'testmanager1',
    '$2y$10$O.QlRVhtccpaGjg9ZrTlGegtkJ5t.5IXN/UbcNY/xhsghSA2C6pm2',
    'testmanager1@melly.test',
    '테스트매니저',
    'MANAGER',
    'ACTIVE',
    'KOREAN',
    NOW(),
    NOW()
    WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE login_id = 'testmanager1'
);
