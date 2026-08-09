-- =============================================================================
-- 첨부파일 유형 컬럼 + 조직 알림 유형 추가
--
-- 적용 대상 : MySQL 8.4
-- 작성일     : 2026-08-07
--
-- 이 프로젝트에는 Flyway/Liquibase 같은 마이그레이션 도구가 없고 운영은
-- `ddl-auto: validate` 다. 이 파일은 자동 실행되지 않으며, 운영/스테이징에
-- 애플리케이션을 배포하기 "전에" 반드시 수동으로 적용해야 한다.
--
-- 같은 날짜의 V20260807_01(응모 객관식·동의 2종)과 **둘 다** 적용해야 한다.
-- 01만 적용하고 배포하면 attachments.attachment_type 이 없어 부팅이 막힌다.
--
-- 적용 전 현재 상태 확인:
--   SHOW CREATE TABLE attachments\G
--   SHOW CREATE TABLE notifications\G
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) attachments.attachment_type : 첨부 용도 구분 (신규 컬럼)
--
--    지금까지 첨부는 공지 전용이라 용도를 구분할 필요가 없었다. 커뮤니티 게시글과
--    팬미팅 커버 이미지가 첨부를 쓰게 되면서 용도를 저장한다. 용도에 따라 공개 범위가
--    다르다 — 커버 이미지는 비로그인도 볼 수 있어야 하고, 공지·커뮤니티 첨부는 아니다.
--
--    **이 컬럼이 없으면 운영 백엔드가 부팅하지 못한다.**
--    (SchemaManagementException: missing column [attachment_type] in table [attachments])
--
--    기존 행은 전부 공지 첨부이므로 DEFAULT 'NOTICE' 로 채운다.
--    @Enumerated(EnumType.STRING) 필드는 이 프로젝트의 MySQL에서 varchar가 아니라
--    native ENUM 으로 만들어지므로(2026-08-06 notifications.notification_type 실측)
--    같은 형태로 맞춘다. 값 목록은 Hibernate가 알파벳 순으로 적는다.
-- -----------------------------------------------------------------------------
ALTER TABLE attachments
    ADD COLUMN attachment_type ENUM ('COMMUNITY', 'MEETING_COVER', 'NOTICE')
        NOT NULL DEFAULT 'NOTICE'
        COMMENT '첨부 용도. NOTICE=공지, COMMUNITY=커뮤니티 게시글, MEETING_COVER=팬미팅 커버';

-- -----------------------------------------------------------------------------
-- 2) attachments.post_id : NULL 허용으로 완화
--
--    첨부는 게시글을 쓰기 "전에" 먼저 업로드하므로 업로드 시점에는 항상 post_id가 NULL이고,
--    팬미팅 커버 이미지(MEETING_COVER)는 끝까지 게시글에 붙지 않는다.
--    엔티티는 이미 nullable 이지만(@JoinColumn 에 nullable=false 없음) 컬럼은 옛 엔티티
--    정의로 만들어져 NOT NULL 로 남아 있다. `ddl-auto: update` 는 기존 컬럼의 NULL 허용을
--    되돌리지 않으므로 로컬도 자동으로 고쳐지지 않는다.
--
--    Hibernate 의 validate 는 컬럼 존재·타입만 보고 nullability 는 보지 않는다.
--    따라서 이 문장을 빠뜨려도 **부팅은 정상이고 첨부 업로드만 1048 로 실패한다.**
--    배포 후 "첨부가 안 된다"로 뒤늦게 드러나므로 반드시 함께 적용한다.
--
--    운영 DB가 이미 NULL 허용이면 이 문장은 아무것도 바꾸지 않는다(실행해도 안전).
-- -----------------------------------------------------------------------------
ALTER TABLE attachments
    MODIFY COLUMN post_id BIGINT NULL COMMENT '연결된 게시글. 업로드 직후와 팬미팅 커버는 NULL';

-- -----------------------------------------------------------------------------
-- 3) notifications.notification_type : 조직 알림 3종 추가
--
--    ORGANIZATION_INVITED / ORGANIZATION_INVITATION_ACCEPTED / ORGANIZATION_MEMBER_REMOVED
--
--    native ENUM 컬럼이라 Java enum 에 값을 늘려도 DDL 은 그대로다. 이 문장을 빠뜨리면
--    **부팅은 되고**, 해당 유형의 알림을 처음 만드는 순간 그 API 만
--    `ERROR 1265 Data truncated for column 'notification_type'` 로 500 이 된다.
--
--    아래 목록은 Java enum 전체를 알파벳 순으로 적은 것이다. 기존 7종을 빠뜨리면
--    그 알림들이 반대로 죽으므로 목록을 통째로 교체한다.
-- -----------------------------------------------------------------------------
ALTER TABLE notifications
    MODIFY COLUMN notification_type ENUM (
        'APPLICATION_RESULT',
        'ENTER_NOW',
        'MEETING_CANCELED',
        'MEETING_CHANGED',
        'MEETING_PUBLISHED',
        'ORGANIZATION_INVITATION_ACCEPTED',
        'ORGANIZATION_INVITED',
        'ORGANIZATION_MEMBER_REMOVED',
        'QUEUE_CHANGE_RESULT',
        'QUEUE_ORDER_ASSIGNED'
        ) NOT NULL;

-- =============================================================================
-- 적용 후 확인
--
--   SELECT column_name, column_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = DATABASE()
--      AND ((table_name = 'attachments'   AND column_name IN ('attachment_type', 'post_id'))
--        OR (table_name = 'notifications' AND column_name = 'notification_type'));
--
-- 기대값
--   attachments.attachment_type    enum('COMMUNITY','MEETING_COVER','NOTICE')   NO
--   attachments.post_id            bigint                                       YES
--   notifications.notification_type enum(... 10개 ...)                           NO
-- =============================================================================
