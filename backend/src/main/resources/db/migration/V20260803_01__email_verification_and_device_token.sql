-- =============================================================================
-- 이메일 인증 + 기기 토큰 기반 다계정 응모 탐지 스키마
--
-- 적용 대상 : MySQL 8.4
-- 작성일     : 2026-08-03
--
-- 이 프로젝트에는 Flyway/Liquibase 같은 마이그레이션 도구가 없고 스키마는
-- Hibernate `ddl-auto: update` 로 생성된다. 이 파일은 자동 실행되지 않으며,
-- 운영/스테이징에 애플리케이션을 배포하기 "전에" 수동으로 적용하기 위한
-- 기준 DDL이다. 기존 SQL 파일은 수정하지 않고 새 파일로만 추가한다.
--
-- MySQL 8.4에는 ADD COLUMN IF NOT EXISTS 가 없으므로, 이미 적용된 환경에서는
-- 해당 문에서 "Duplicate column name" 오류가 나면 그 문만 건너뛴다.
-- 적용 전에 아래 확인 쿼리로 현재 스키마 상태를 먼저 점검한다.
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = DATABASE() AND table_name = 'users';
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = DATABASE() AND table_name = 'applications';
--   SHOW INDEX FROM applications;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) users : 이메일 소유 확인 시각
--    null 이면 미인증이며 응모가 403 EMAIL_VERIFICATION_REQUIRED 로 거부된다.
--    기존 회원은 모두 null 로 채워지므로, 인증 유도 기간에는
--    APPLICATION_EMAIL_VERIFICATION_REQUIRED=false 로 두고 단계적으로 켠다.
-- -----------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN email_verified_at DATETIME(6) NULL COMMENT '이메일 소유 확인 완료 시각';

-- -----------------------------------------------------------------------------
-- 2) email_verification_tokens : 단발성 이메일 인증 토큰
--    토큰 원문은 저장하지 않고 HMAC-SHA-256 해시(64자 hex)만 남긴다.
--    컬럼 길이는 알고리즘 교체 여지를 두어 128 로 잡는다.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_tokens
(
    email_verification_token_id BIGINT       NOT NULL AUTO_INCREMENT,
    user_id                     BIGINT       NOT NULL,
    token_hash                  VARCHAR(128) NOT NULL COMMENT '토큰 원문의 HMAC-SHA-256 해시',
    expires_at                  DATETIME(6)  NOT NULL,
    consumed_at                 DATETIME(6)  NULL COMMENT '사용 완료 시각. 재사용 차단용',
    created_at                  DATETIME(6)  NOT NULL,
    updated_at                  DATETIME(6)  NOT NULL,
    PRIMARY KEY (email_verification_token_id),
    CONSTRAINT uk_email_verification_tokens_hash UNIQUE (token_hash),
    CONSTRAINT fk_email_verification_tokens_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE INDEX idx_email_verification_tokens_user
    ON email_verification_tokens (user_id);

-- -----------------------------------------------------------------------------
-- 3) applications : 응모 시점 기기 토큰과 위험 판정
--    risk_status 는 NONE / FLAGGED 두 값만 사용한다.
--    기존 행은 NONE 으로 채운 뒤 NOT NULL 로 바꾼다.
-- -----------------------------------------------------------------------------
ALTER TABLE applications
    ADD COLUMN device_hash VARCHAR(64) NULL COMMENT '응모 시점 기기 토큰의 HMAC-SHA-256 해시',
    ADD COLUMN risk_status VARCHAR(20) NULL COMMENT 'NONE | FLAGGED',
    ADD COLUMN risk_reason VARCHAR(255) NULL COMMENT '운영자용 위험 사유. 원문 토큰은 담지 않는다';

UPDATE applications SET risk_status = 'NONE' WHERE risk_status IS NULL;

ALTER TABLE applications
    MODIFY COLUMN risk_status VARCHAR(20) NOT NULL COMMENT 'NONE | FLAGGED';

-- 같은 팬미팅에서 같은 기기 토큰을 쓴 다른 계정을 찾는 조회 전용 인덱스다.
-- (meeting_id, device_hash) 를 UNIQUE 로 두면 공용 PC·가족 기기의 정상 응모가
-- 막히므로 의도적으로 UNIQUE 가 아니다.
CREATE INDEX idx_applications_meeting_device
    ON applications (meeting_id, device_hash);

-- -----------------------------------------------------------------------------
-- 4) applications : 같은 팬미팅 + 같은 계정 중복 응모 차단(최종 방어선)
--    엔티티에는 이미 선언되어 있으나 ddl-auto:update 가 기존 테이블에
--    제약을 추가하지 못한 환경이 있을 수 있어 명시적으로 확인·추가한다.
--
--    아래 SELECT 가 0행이면 제약이 없는 것이므로 이어지는 ALTER 를 실행한다.
--    중복 데이터가 남아 있으면 ALTER 가 실패하므로 먼저 정리해야 한다.
--
--      SELECT meeting_id, fan_id, COUNT(*) FROM applications
--       GROUP BY meeting_id, fan_id HAVING COUNT(*) > 1;
-- -----------------------------------------------------------------------------
-- SELECT index_name FROM information_schema.statistics
--  WHERE table_schema = DATABASE() AND table_name = 'applications'
--    AND index_name = 'uk_applications_meeting_fan';

ALTER TABLE applications
    ADD CONSTRAINT uk_applications_meeting_fan UNIQUE (meeting_id, fan_id);

-- -----------------------------------------------------------------------------
-- 5) (선택) 로컬 개발 편의
--    data-local.sql 의 시드 계정은 email_verified_at 이 null 이라 응모가 막힌다.
--    로컬에서만 아래를 실행해 시드 계정을 인증 완료로 만든다. 운영 금지.
-- -----------------------------------------------------------------------------
-- UPDATE users SET email_verified_at = NOW(6)
--  WHERE login_id IN ('adminmelly', 'testuser1', 'testuser2', 'testmanager1');
