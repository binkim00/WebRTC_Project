package com.ssafy.backend.common.converter;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 문자열 맵을 JSON 한 줄로 저장하고 되돌리는 JPA 변환기다.
 *
 * <p>알림 문구를 화면에서 번역하려면 문장 대신 자리표시자에 넣을 값을 그대로 보관해야 하는데,
 * 값의 개수와 이름이 문구마다 달라 컬럼으로 펼치기 어렵다. 컬럼 하나에 JSON으로 담아
 * 엔티티에서는 맵으로 다루고 응답에서는 JSON 객체로 그대로 내보낸다.
 *
 * <p>순서가 보이는 그대로 유지되도록 {@link LinkedHashMap}으로 읽는다.
 */
@Converter
public class StringMapJsonConverter implements AttributeConverter<Map<String, String>, String> {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final TypeReference<LinkedHashMap<String, String>> MAP_TYPE =
            new TypeReference<>() {
            };

    /**
     * 문자열 맵을 저장용 JSON 문자열로 바꾼다.
     *
     * @param attribute 저장할 문자열 맵이며 {@code null}이거나 비어 있을 수 있다
     * @return JSON 문자열이며 담을 값이 없으면 {@code null}
     * @throws IllegalArgumentException JSON으로 직렬화할 수 없는 맵인 경우
     */
    @Override
    public String convertToDatabaseColumn(Map<String, String> attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return null;
        }
        try {
            return OBJECT_MAPPER.writeValueAsString(attribute);
        } catch (Exception exception) {
            throw new IllegalArgumentException("문자열 맵을 JSON으로 저장할 수 없습니다.", exception);
        }
    }

    /**
     * 저장된 JSON 문자열을 문자열 맵으로 되돌린다.
     *
     * <p>깨진 값이 남아 있어도 조회 전체가 실패하지 않도록 {@code null}로 처리한다. 이미 저장된
     * 문장(message, lastChangeReason)이 함께 있어 화면은 그대로 뜬다.
     *
     * @param dbData 저장된 JSON 문자열이며 {@code null}이거나 비어 있을 수 있다
     * @return 문자열 맵이며 값이 없거나 읽을 수 없으면 {@code null}
     */
    @Override
    public Map<String, String> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return null;
        }
        try {
            return OBJECT_MAPPER.readValue(dbData, MAP_TYPE);
        } catch (Exception exception) {
            return null;
        }
    }
}
