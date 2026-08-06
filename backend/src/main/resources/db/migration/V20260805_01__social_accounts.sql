-- =============================================================================
-- 소셜 로그인(구글·카카오·네이버) 계정 연결 스키마
--
-- 적용 대상 : MySQL 8.4
-- 작성일     : 2026-08-05
--
-- 이 프로젝트에는 Flyway/Liquibase 같은 마이그레이션 도구가 없고 로컬 스키마는
-- Hibernate `ddl-auto: update` 로 생성된다. 이 파일은 자동 실행되지 않는다.
--
-- 운영 프로파일은 `ddl-auto: validate` 이므로(application-prod.yml) 이 DDL을
-- 적용하지 않은 상태로 배포하면 테이블이 없다는 검증 실패로 애플리케이션이
-- 기동하지 못한다. 반드시 배포 "전에" 먼저 적용해야 한다.
--
-- 적용 전 현재 상태 확인:
--
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = DATABASE() AND table_name = 'social_accounts';
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- social_accounts : 외부 소셜 공급자 계정과 Melly 사용자의 연결
--
-- users 에 공급자 컬럼을 붙이지 않고 별도 테이블로 분리한 이유는 한 사용자가
-- 여러 공급자를 동시에 연결할 수 있어야 하고, 기존 아이디·비밀번호 계정 구조를
-- 그대로 두어야 하기 때문이다.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_accounts
(
    social_account_id BIGINT       NOT NULL AUTO_INCREMENT,
    user_id           BIGINT       NOT NULL,
    provider          VARCHAR(20)  NOT NULL COMMENT 'GOOGLE | KAKAO | NAVER',
    -- 숫자형을 쓰면 안 된다. 구글 sub 는 21자리로 BIGINT 범위를 넘고
    -- 네이버는 43자 영숫자 문자열을 준다. 카카오만 보고 설계하면 나머지가 깨진다.
    provider_user_id  VARCHAR(255) NOT NULL COMMENT '공급자가 발급한 변하지 않는 사용자 식별자',
    created_at        DATETIME(6)  NOT NULL,
    PRIMARY KEY (social_account_id),
    -- 같은 소셜 계정이 두 사용자에게 연결되면 로그인 시 누구인지 결정할 수 없다.
    CONSTRAINT uk_social_accounts_provider_user UNIQUE (provider, provider_user_id),
    -- 한 사용자가 같은 공급자를 두 개 연결하면 연결 해제 대상을 특정할 수 없다.
    -- 앞선 컬럼이 user_id 라서 사용자별 연결 목록 조회 색인으로도 함께 쓰인다.
    CONSTRAINT uk_social_accounts_user_provider UNIQUE (user_id, provider),
    CONSTRAINT fk_social_accounts_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
