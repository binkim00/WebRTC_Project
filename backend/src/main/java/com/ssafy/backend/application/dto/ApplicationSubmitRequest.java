package com.ssafy.backend.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 팬의 응모 동의 항목과 응모 질문 답변을 전달한다.
 *
 * <p>동의 세 가지는 화면에서 모두 필수로 받는 항목이며 각각 동의 시각으로 저장된다.
 * 녹화 동의는 녹화를 사용하는 팬미팅에서만 필요하다.
 *
 * <p>동의 값을 {@code boolean}이 아니라 {@code Boolean}으로 받는다. 기본형으로 두면 필드를
 * 빠뜨린 요청이 JSON 파싱 단계에서 본문 없는 400으로 끊겨, 응모가 왜 막혔는지 알려 주는
 * 오류 코드가 나가지 못한다. 값이 없으면 미동의로 본다.
 *
 * @param personalInformationConsent 개인정보 수집 및 이용 동의 여부이며 없으면 미동의
 * @param recordingConsent 녹화 및 보관 동의 여부이며 녹화를 쓰지 않는 팬미팅에서는 검사하지 않는다
 * @param participationConsent 팬미팅 참여 규칙 동의 여부이며 없으면 미동의
 * @param answers 응모 질문 답변 목록
 */
public record ApplicationSubmitRequest(
        Boolean personalInformationConsent,
        Boolean recordingConsent,
        Boolean participationConsent,
        @NotNull @Size(max = 10) List<@Valid AnswerRequest> answers
) {

    /**
     * 응모 질문 하나의 답변을 전달한다.
     *
     * <p>주관식 질문은 {@code value}만, 객관식 질문은 {@code optionIds}만 채운다.
     * 어느 쪽을 채워야 하는지는 질문 유형에 달려 있어 서비스에서 검증한다.
     *
     * @param questionId 질문 식별자
     * @param value 주관식 답변 본문이며 객관식 질문이면 null
     * @param optionIds 객관식 질문에서 고른 선택지 식별자 목록이며 주관식 질문이면 null 또는 빈 목록
     */
    public record AnswerRequest(
            @NotNull Long questionId,
            String value,
            @Size(max = 20) List<Long> optionIds
    ) {

        /**
         * 선택지 식별자 목록을 null 대신 빈 목록으로 돌려준다.
         *
         * @return 선택지 식별자 목록이며 전달되지 않았으면 빈 목록
         */
        public List<Long> optionIdsOrEmpty() {
            return optionIds == null ? List.of() : optionIds;
        }
    }
}
