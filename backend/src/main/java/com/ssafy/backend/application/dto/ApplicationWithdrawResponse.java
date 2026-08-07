package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;

import java.time.LocalDateTime;

/**
 * 응모 취소 결과를 전달한다.
 *
 * @param applicationId 응모 식별자
 * @param applicationStatus 취소된 응모 상태
 * @param withdrawnAt 취소 시각
 */
public record ApplicationWithdrawResponse(
        Long applicationId, ApplicationStatus applicationStatus, LocalDateTime withdrawnAt
) {

    /**
     * 취소된 응모 엔티티를 응답으로 변환한다.
     *
     * @param application 취소된 응모
     * @return 응모 취소 응답
     */
    public static ApplicationWithdrawResponse from(Application application) {
        return new ApplicationWithdrawResponse(
                application.getId(), application.getStatus(), application.getWithdrawnAt()
        );
    }
}
