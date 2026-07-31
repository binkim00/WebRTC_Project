package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 응모 관리 화면에 표시할 응모자 한 명의 정보와 제출 답변이다.
 *
 * @param applicationId 응모 식별자
 * @param fanId 응모한 팬의 사용자 식별자
 * @param nickname 응모한 팬의 닉네임
 * @param profileImageUrl 응모한 팬의 프로필 이미지 URL이며 없으면 null
 * @param applicationStatus 응모 상태
 * @param submittedAt 응모 제출 시각
 * @param answers 질문 표시 순서대로 정렬된 제출 답변 목록
 */
public record ApplicantResponse(
        Long applicationId,
        Long fanId,
        String nickname,
        String profileImageUrl,
        ApplicationStatus applicationStatus,
        LocalDateTime submittedAt,
        List<ApplicantAnswerResponse> answers
) {
    /**
     * 응모와 제출 답변을 응모자 목록 항목으로 변환한다.
     *
     * @param application 조회한 응모
     * @param answers 해당 응모의 제출 답변 목록
     * @return 응모자 목록 항목
     */
    public static ApplicantResponse of(
            Application application, List<ApplicantAnswerResponse> answers
    ) {
        User fan = application.getFan();
        return new ApplicantResponse(
                application.getId(),
                fan.getId(),
                fan.getNickname(),
                fan.getProfileImageUrl(),
                application.getStatus(),
                application.getSubmittedAt(),
                answers
        );
    }
}
