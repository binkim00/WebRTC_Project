-- =============================================================================
-- 응모 폼 객관식 질문 + 응모 동의 3종 저장 스키마
--
-- 적용 대상 : MySQL 8.4
-- 작성일     : 2026-08-07
--
-- 이 프로젝트에는 Flyway/Liquibase 같은 마이그레이션 도구가 없고 운영은
-- `ddl-auto: validate` 다. 이 파일은 자동 실행되지 않으며, 운영/스테이징에
-- 애플리케이션을 배포하기 "전에" 반드시 수동으로 적용해야 한다.
-- 적용하지 않고 배포하면 Schema validation 실패로 부팅이 막힌다.
--
-- MySQL 8.4에는 ADD COLUMN IF NOT EXISTS 가 없으므로, 이미 적용된 환경에서는
-- "Duplicate column name" 오류가 나면 그 문만 건너뛴다.
-- 적용 전에 아래 확인 쿼리로 현재 스키마 상태를 먼저 점검한다.
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = DATABASE() AND table_name = 'applications';
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = DATABASE() AND table_name = 'application_options';
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) applications : 화면에서 필수로 받는 나머지 동의 2종의 동의 시각
--    개인정보 동의(personal_information_consent_at)는 이미 있고, 녹화 동의와
--    참여 동의는 UI에서만 확인하고 서버에 남기지 않던 것을 이번에 저장한다.
--
--    기존 응모 행은 동의 항목을 받기 전에 접수된 건이라 null 로 남는다.
--    따라서 두 컬럼 모두 NOT NULL 로 만들지 않는다. 녹화 동의는 녹화를 쓰지
--    않는 팬미팅에서 애초에 받지 않으므로 신규 응모에서도 null 일 수 있다.
-- -----------------------------------------------------------------------------
ALTER TABLE applications
    ADD COLUMN recording_consent_at     DATETIME(6) NULL
        COMMENT '녹화·보관 동의 시각. 녹화를 쓰지 않는 팬미팅은 null',
    ADD COLUMN participation_consent_at DATETIME(6) NULL
        COMMENT '팬미팅 참여 규칙 동의 시각';

-- -----------------------------------------------------------------------------
-- 2) application_options : 선택지 논리 삭제 시각
--    질문(application_questions.deleted_at)과 같은 방식이다. 이미 제출된 답변이
--    application_answers.selected_option_id 로 선택지를 가리키므로, 폼을 다시
--    저장할 때 선택지를 실제 삭제하지 않고 삭제 시각만 남긴다.
--
--    application_options 테이블 자체는 ERD 선반영으로 이미 존재한다. 없다면
--    아래 CREATE TABLE 을 먼저 실행한다(엔티티와 동일한 정의).
-- -----------------------------------------------------------------------------
ALTER TABLE application_options
    ADD COLUMN deleted_at DATETIME(6) NULL COMMENT '선택지 논리 삭제 시각';

-- 참고: application_options 가 없는 환경에서만 실행한다.
-- CREATE TABLE IF NOT EXISTS application_options
-- (
--     application_option_id   BIGINT       NOT NULL AUTO_INCREMENT,
--     application_question_id BIGINT       NOT NULL,
--     option_text             VARCHAR(500) NOT NULL,
--     display_order           INT          NOT NULL,
--     deleted_at              DATETIME(6)  NULL,
--     created_at              DATETIME(6)  NOT NULL,
--     updated_at              DATETIME(6)  NOT NULL,
--     PRIMARY KEY (application_option_id),
--     CONSTRAINT fk_application_options_question
--         FOREIGN KEY (application_question_id)
--             REFERENCES application_questions (application_question_id)
-- ) ENGINE = InnoDB
--   DEFAULT CHARSET = utf8mb4
--   COLLATE = utf8mb4_unicode_ci;
