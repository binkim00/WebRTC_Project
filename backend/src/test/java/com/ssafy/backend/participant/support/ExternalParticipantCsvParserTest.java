package com.ssafy.backend.participant.support;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 외부 선별 참가자 CSV 파서의 방어 규칙을 검증한다. */
class ExternalParticipantCsvParserTest {

    private static final String HEADER = ExternalParticipantCsvParser.HEADER;

    private final ExternalParticipantCsvParser parser = new ExternalParticipantCsvParser();

    /**
     * 지정한 개수만큼 행을 담은 CSV 파일을 만든다.
     *
     * @param rowCount 헤더를 제외한 데이터 행 수
     * @return 업로드 파일 형태의 CSV
     */
    private MultipartFile csv(int rowCount) {
        StringBuilder body = new StringBuilder(HEADER);
        for (int index = 0; index < rowCount; index++) {
            body.append('\n').append("fan").append(index).append("@melly.test,").append(index + 1);
        }
        return new MockMultipartFile(
                "file", "participants.csv", "text/csv",
                body.toString().getBytes(StandardCharsets.UTF_8));
    }

    /** 상한 안쪽의 명단은 모든 행을 그대로 읽는지 검증한다. */
    @Test
    void parsesRowsWithinLimit() {
        List<ExternalParticipantCsvRow> rows = parser.parse(csv(3));

        assertThat(rows).hasSize(3);
        assertThat(rows.get(0).email()).isEqualTo("fan0@melly.test");
    }

    /**
     * 상한을 넘는 명단은 읽다가 끊고 알려 주는지 검증한다.
     *
     * <p>상한이 없으면 잘못 만든 파일 하나가 모든 줄을 메모리에 쌓고 그대로 한 트랜잭션에 들어가
     * 서버를 멈춘다. 파일 크기 한도는 녹화 업로드에 맞춰 둔 값이라 CSV를 막아 주지 못한다.
     */
    @Test
    void rejectsFileWithTooManyRows() {
        MultipartFile tooManyRows = csv(2_001);

        assertThatThrownBy(() -> parser.parse(tooManyRows))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue(
                        "errorCode", ErrorCode.EXTERNAL_PARTICIPANT_CSV_TOO_MANY_ROWS);
    }

    /** 양식과 다른 헤더는 거절하는지 검증한다. */
    @Test
    void rejectsInvalidHeader() {
        MultipartFile wrongHeader = new MockMultipartFile(
                "file", "participants.csv", "text/csv",
                "name,email\n팬,fan@melly.test".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> parser.parse(wrongHeader))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue(
                        "errorCode", ErrorCode.EXTERNAL_PARTICIPANT_CSV_INVALID);
    }
}
