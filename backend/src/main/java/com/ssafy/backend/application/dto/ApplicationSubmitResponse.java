package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;

import java.time.LocalDateTime;

/**
 * 응모 접수 또는 재응모 결과를 전달한다.
 *
 * @param applicationId 응모 식별자
 * @param applicationStatus 응모 상태
 * @param submittedAt 제출 시각
 */
public record ApplicationSubmitResponse(
        Long applicationId, ApplicationStatus applicationStatus, LocalDateTime submittedAt
) {

    /**
     * 접수된 응모 엔티티를 응답으로 변환한다.
     *
     * @param application 접수된 응모
     * @return 응모 접수 응답
     */
    public static ApplicationSubmitResponse from(Application application) {
        return new ApplicationSubmitResponse(
                application.getId(), application.getStatus(), application.getSubmittedAt()
        );
    }
}
