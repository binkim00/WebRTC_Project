-- 기존 로컬 데이터의 언어 코드를 PreferredLanguage Enum 값으로 보정한다.
UPDATE users
SET preferred_language = 'KOREAN'
WHERE preferred_language = 'ko';

-- 서비스 관리 기능 확인을 위한 관리자 계정을 생성한다.
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

-- 대기열 입장과 LiveKit 팬 권한 확인을 위한 팬 계정을 생성한다.
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

-- 팬미팅 진행과 LiveKit 호스트 권한 확인을 위한 인플루언서 계정을 생성한다.
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

-- 참가자 호출과 운영 API 권한 확인을 위한 매니저 계정을 생성한다.
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

-- 조직 없이 팬미팅을 직접 만들고 진행하는 1인 인플루언서 계정을 생성한다.
-- SOLO_INFLUENCER 는 매니저와 달리 organization_id·manager_id 가 없는 팬미팅을 만들기 때문에
-- 생성·발행·대기실 권한 경로가 매니저와 다르다. 이 계정이 없으면 그 경로를 로컬에서 확인할 수 없다.
-- 비밀번호는 다른 테스트 계정과 같다.
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
    'testsolo1',
    '$2y$10$O.QlRVhtccpaGjg9ZrTlGegtkJ5t.5IXN/UbcNY/xhsghSA2C6pm2',
    'testsolo1@melly.test',
    '테스트솔로인플루언서',
    'SOLO_INFLUENCER',
    'ACTIVE',
    'KOREAN',
    NOW(),
    NOW()
    WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE login_id = 'testsolo1'
);

-- 대기열부터 LiveKit 연결까지 확인할 로컬 팬미팅을 생성한다.
INSERT INTO fan_meetings (
    organization_id,
    manager_id,
    influencer_id,
    title,
    description,
    status,
    scheduled_start_at,
    actual_start_at,
    published_at,
    created_at,
    updated_at
)
SELECT
    NULL,
    manager.user_id,
    influencer.user_id,
    '로컬 RTC 테스트 팬미팅',
    '대기열 및 LiveKit 연결 테스트용 팬미팅',
    'LIVE',
    NOW(),
    NOW(),
    NOW(),
    NOW(),
    NOW()
FROM users manager
JOIN users influencer
    ON influencer.login_id = 'testuser2'
WHERE manager.login_id = 'testmanager1'
  AND NOT EXISTS (
      SELECT 1
      FROM fan_meetings
      WHERE title = '로컬 RTC 테스트 팬미팅'
        AND deleted_at IS NULL
  );

-- 대기실을 즉시 열고 참가자당 통화시간을 60초로 설정한다.
INSERT INTO meeting_operation_settings (
    meeting_id,
    waiting_room_open_at,
    call_duration_sec,
    recording_enabled,
    translation_enabled,
    created_at,
    updated_at
)
SELECT
    meeting.meeting_id,
    DATE_SUB(NOW(), INTERVAL 1 HOUR),
    60,
    FALSE,
    TRUE,
    NOW(),
    NOW()
FROM fan_meetings meeting
WHERE meeting.title = '로컬 RTC 테스트 팬미팅'
  AND meeting.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM meeting_operation_settings setting
      WHERE setting.meeting_id = meeting.meeting_id
  );

-- 테스트 팬을 당첨 상태로 만들어 Participant가 참조할 응모 데이터를 생성한다.
INSERT INTO applications (
    meeting_id,
    fan_id,
    status,
    personal_information_consent_at,
    submitted_at,
    result_decided_at,
    created_at,
    updated_at
)
SELECT
    meeting.meeting_id,
    fan.user_id,
    'SELECTED',
    NOW(),
    DATE_SUB(NOW(), INTERVAL 1 DAY),
    NOW(),
    NOW(),
    NOW()
FROM fan_meetings meeting
JOIN users fan
    ON fan.login_id = 'testuser1'
WHERE meeting.title = '로컬 RTC 테스트 팬미팅'
  AND meeting.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM applications application
      WHERE application.meeting_id = meeting.meeting_id
        AND application.fan_id = fan.user_id
  );

-- 테스트 팬을 첫 번째 참가자로 확정하고 대기열 생성에 사용할 순번을 배정한다.
INSERT INTO participants (
    meeting_id,
    fan_id,
    application_id,
    status,
    assigned_order,
    recording_consent_at,
    created_at,
    updated_at
)
SELECT
    application.meeting_id,
    application.fan_id,
    application.application_id,
    'READY',
    1,
    NOW(),
    NOW(),
    NOW()
FROM applications application
JOIN users fan
    ON fan.user_id = application.fan_id
   AND fan.login_id = 'testuser1'
JOIN fan_meetings meeting
    ON meeting.meeting_id = application.meeting_id
   AND meeting.title = '로컬 RTC 테스트 팬미팅'
   AND meeting.deleted_at IS NULL
WHERE application.status = 'SELECTED'
  AND NOT EXISTS (
      SELECT 1
      FROM participants participant
      WHERE participant.meeting_id = application.meeting_id
        AND participant.fan_id = application.fan_id
  );
