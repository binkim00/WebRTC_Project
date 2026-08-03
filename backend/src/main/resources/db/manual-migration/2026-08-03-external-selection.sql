-- 외부 선별 참가자 CSV 등록 기능을 위한 수동 스키마 변경
--
-- 이 저장소는 마이그레이션 도구(Flyway 등) 없이 ddl-auto=update 로 스키마를 만든다.
-- ddl-auto=update 는 컬럼 추가만 수행하고 기존 컬럼의 NOT NULL 제약을 완화하지 않으므로,
-- 이미 데이터가 있는 개발·운영 DB에는 아래 문장을 담당자가 직접 적용해야 한다.
-- 새로 만드는 로컬 DB는 엔티티에서 스키마가 생성되므로 적용할 필요가 없다.
--
-- 적용 대상: MySQL 8.4
-- 기존 데이터는 모두 응모 추첨으로 만들어졌으므로 기본값 APPLICATION 으로 안전하게 채워진다.

-- 1) 응모 없이 확정되는 외부 선별 참가자를 허용한다.
ALTER TABLE participants
    MODIFY COLUMN application_id BIGINT NULL;

-- 2) 참가자가 확정된 경로를 구분한다.
ALTER TABLE participants
    ADD COLUMN participant_source VARCHAR(30) NOT NULL DEFAULT 'APPLICATION';

-- 3) 팬미팅의 참가자 선별 방식을 저장한다.
ALTER TABLE fan_meetings
    ADD COLUMN participant_selection_type VARCHAR(30) NOT NULL DEFAULT 'APPLICATION';

-- 적용 결과 확인용 조회
-- SELECT participant_source, COUNT(*) FROM participants GROUP BY participant_source;
-- SELECT participant_selection_type, COUNT(*) FROM fan_meetings GROUP BY participant_selection_type;
