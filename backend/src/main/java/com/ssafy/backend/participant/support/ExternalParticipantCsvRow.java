package com.ssafy.backend.participant.support;

/**
 * 외부 선별 명단 CSV에서 읽어낸 한 행의 원본 값이다.
 *
 * <p>형식 검증 전 단계이므로 값은 모두 문자열로 두고, 사용자에게 오류 위치를 알려줄 수 있도록
 * 헤더를 제외한 실제 파일 행 번호를 함께 보관한다.
 *
 * @param rowNumber 헤더를 포함한 CSV 파일 기준 행 번호
 * @param email 이메일 칸의 원본 값
 * @param callOrder 호출 순번 칸의 원본 값
 */
public record ExternalParticipantCsvRow(int rowNumber, String email, String callOrder) {
}
