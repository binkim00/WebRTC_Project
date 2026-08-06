package com.ssafy.backend.participant.support;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 외부 선별 명단 CSV를 읽어 행 목록으로 바꾼다.
 *
 * <p>업로드 파일은 저장하지 않고 요청 처리 중에만 메모리에서 사용한다. 엑셀에서 저장한 파일이
 * UTF-8 BOM을 포함하는 경우가 많아 BOM을 허용하고 제거한다.
 */
@Component
public class ExternalParticipantCsvParser {

    /**
     * 한 번에 받아들이는 최대 참가자 수다.
     *
     * <p>파일 크기 한도는 녹화 업로드에 맞춘 값이라 CSV에는 사실상 제한이 없는 것과 같다. 상한이
     * 없으면 잘못 만든 파일 하나가 모든 줄을 메모리에 쌓고 그대로 한 트랜잭션에 들어가 서버를
     * 멈춘다. 1:1 통화는 한 명당 몇 분씩 걸려 한 회차에 이만큼도 부르기 어려우므로, 실수를 막는
     * 방어선으로 넉넉히 잡는다.
     */
    private static final int MAX_ROWS = 2_000;

    /** 명단 CSV가 반드시 가져야 하는 헤더다. */
    public static final String HEADER = "email,callOrder";

    /** 엑셀 호환을 위해 양식과 내보내기 파일 앞에 붙이는 UTF-8 BOM이다. */
    public static final String BOM = "﻿";

    /** 운영자가 내려받아 채워 넣을 명단 양식 내용이다. */
    private static final String TEMPLATE_BODY = """
            fan1@example.com,1
            fan2@example.com,2
            """;

    /**
     * 운영자에게 내려줄 명단 양식 CSV 문자열을 만든다.
     *
     * @return BOM과 헤더, 예시 두 행을 포함한 양식 내용
     */
    public String template() {
        return BOM + HEADER + "\n" + TEMPLATE_BODY;
    }

    /**
     * 업로드된 CSV를 검증 가능한 행 목록으로 변환한다.
     *
     * <p>헤더를 제외한 각 행을 순서대로 담으며 값이 비어 있는 행은 건너뛴다.
     * 행 번호는 사용자가 파일에서 바로 찾을 수 있도록 헤더를 1로 세는 실제 행 번호를 쓴다.
     *
     * @param file 업로드된 명단 CSV
     * @return 헤더를 제외한 명단 행 목록
     * @throws BusinessException 파일이 없거나 읽을 수 없거나 헤더가 양식과 다른 경우
     */
    public List<ExternalParticipantCsvRow> parse(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.EXTERNAL_PARTICIPANT_FILE_REQUIRED);
        }
        List<ExternalParticipantCsvRow> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            requireValidHeader(headerLine);

            String line;
            int rowNumber = 1;
            while ((line = reader.readLine()) != null) {
                rowNumber++;
                if (line.isBlank()) {
                    continue;
                }
                if (rows.size() >= MAX_ROWS) {
                    // 남은 줄은 읽지 않고 끊는다. 끝까지 읽어야 개수를 알 수 있는 구조로 두면
                    // 상한을 두는 의미가 없다.
                    throw new BusinessException(ErrorCode.EXTERNAL_PARTICIPANT_CSV_TOO_MANY_ROWS);
                }
                String[] columns = line.split(",", -1);
                rows.add(new ExternalParticipantCsvRow(
                        rowNumber, column(columns, 0), column(columns, 1)));
            }
        } catch (IOException exception) {
            throw new BusinessException(ErrorCode.EXTERNAL_PARTICIPANT_CSV_INVALID);
        }
        return rows;
    }

    /**
     * 첫 줄이 약속한 헤더와 같은지 확인한다.
     *
     * @param headerLine CSV 첫 줄이며 파일이 비어 있으면 null
     * @throws BusinessException 헤더가 없거나 양식과 다른 경우
     */
    private void requireValidHeader(String headerLine) {
        if (headerLine == null) {
            throw new BusinessException(ErrorCode.EXTERNAL_PARTICIPANT_CSV_INVALID);
        }
        String normalized = headerLine.startsWith(BOM) ? headerLine.substring(1) : headerLine;
        if (!HEADER.equals(normalized.trim())) {
            throw new BusinessException(ErrorCode.EXTERNAL_PARTICIPANT_CSV_INVALID);
        }
    }

    /**
     * 지정한 위치의 칸 값을 반환하고 칸이 없으면 빈 문자열을 돌려준다.
     *
     * <p>칸이 모자란 행도 행 단위 검증에서 필수값 오류로 안내하기 위해 예외를 던지지 않는다.
     *
     * @param columns 쉼표로 나눈 칸 배열
     * @param index 읽을 칸 위치
     * @return 칸 값이며 없으면 빈 문자열
     */
    private String column(String[] columns, int index) {
        return index < columns.length ? columns[index] : "";
    }
}
