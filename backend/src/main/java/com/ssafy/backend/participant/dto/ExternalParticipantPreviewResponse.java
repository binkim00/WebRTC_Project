package com.ssafy.backend.participant.dto;

import java.util.List;

/**
 * 외부 선별 명단 CSV 미리보기 결과다.
 *
 * <p>확정 전에 운영자가 어떤 행이 왜 등록되지 않는지 확인할 수 있도록 행마다 검증 결과를 담는다.
 * 특정 행에 귀속되지 않는 명단 전체 오류는 {@code fileErrors}로 따로 전달한다.
 *
 * @param totalRowCount 헤더를 제외한 전체 행 수
 * @param validRowCount 검증을 통과한 행 수
 * @param invalidRowCount 검증에 실패한 행 수
 * @param confirmable 이 내용 그대로 확정할 수 있는지 여부
 * @param fileErrors 명단 전체 단위 오류 목록이며 없으면 비어 있다
 * @param rows 행별 검증 결과
 */
public record ExternalParticipantPreviewResponse(
        int totalRowCount,
        int validRowCount,
        int invalidRowCount,
        boolean confirmable,
        List<FileError> fileErrors,
        List<Row> rows
) {

    /**
     * 명단 전체 단위 오류 한 건이다.
     *
     * @param errorCode 오류 코드
     * @param errorMessage 사용자 안내 메시지
     */
    public record FileError(String errorCode, String errorMessage) {
    }

    /**
     * 명단 한 행의 검증 결과다.
     *
     * @param rowNumber 헤더를 포함한 CSV 파일 기준 행 번호
     * @param email 정규화한 이메일이며 값이 없으면 원본 그대로다
     * @param callOrder 호출 순번이며 숫자로 읽을 수 없으면 null
     * @param matchedUserId 이메일로 찾은 회원 식별자이며 못 찾으면 null
     * @param matchedNickname 이메일로 찾은 회원 닉네임이며 못 찾으면 null
     * @param valid 이 행이 검증을 통과했는지 여부
     * @param errorCode 실패 사유 코드이며 통과했으면 null
     * @param errorMessage 실패 사유 메시지이며 통과했으면 null
     */
    public record Row(
            int rowNumber,
            String email,
            Integer callOrder,
            Long matchedUserId,
            String matchedNickname,
            boolean valid,
            String errorCode,
            String errorMessage
    ) {
    }
}
