package com.ssafy.backend.common.converter;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

/** 번역 자리표시자 값을 JSON 한 칸에 담고 되돌리는 변환기를 검증한다. */
class StringMapJsonConverterTest {

    private final StringMapJsonConverter converter = new StringMapJsonConverter();

    /** 저장한 값을 넣은 순서 그대로 되돌리는지 검증한다. */
    @Test
    void restoresStoredArgumentsInInsertionOrder() {
        Map<String, String> arguments = new LinkedHashMap<>();
        arguments.put("previousPosition", "3");
        arguments.put("newPosition", "1");

        String stored = converter.convertToDatabaseColumn(arguments);

        assertThat(stored).isEqualTo("{\"previousPosition\":\"3\",\"newPosition\":\"1\"}");
        assertThat(converter.convertToEntityAttribute(stored)).containsExactly(
                entry("previousPosition", "3"), entry("newPosition", "1"));
    }

    /** 큰따옴표가 섞인 팬미팅 제목도 깨지지 않고 되돌아오는지 검증한다. */
    @Test
    void keepsQuotedValuesIntact() {
        Map<String, String> arguments = Map.of("meetingTitle", "\"여름\" 팬미팅");

        String stored = converter.convertToDatabaseColumn(arguments);

        assertThat(converter.convertToEntityAttribute(stored))
                .containsExactly(entry("meetingTitle", "\"여름\" 팬미팅"));
    }

    /** 담을 값이 없으면 컬럼을 비워 두는지 검증한다. */
    @Test
    void storesNullWhenThereIsNothingToKeep() {
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToDatabaseColumn(Map.of())).isNull();
    }

    /** 비어 있거나 깨진 값이 남아 있어도 조회를 막지 않는지 검증한다. */
    @Test
    void returnsNullInsteadOfFailingOnUnreadableValue() {
        assertThat(converter.convertToEntityAttribute(null)).isNull();
        assertThat(converter.convertToEntityAttribute("  ")).isNull();
        assertThat(converter.convertToEntityAttribute("{깨진 값")).isNull();
    }
}
