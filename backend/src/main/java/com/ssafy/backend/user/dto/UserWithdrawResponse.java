package com.ssafy.backend.user.dto;

import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;

/**
 * 회원탈퇴 처리 결과를 전달한다.
 *
 * @param withdrawnAt 탈퇴 처리 시각
 * @param success 탈퇴 성공 여부
 */
public record UserWithdrawResponse(
        LocalDateTime withdrawnAt,
        boolean success
) {
    /**
     * 탈퇴 처리가 끝난 사용자 엔티티를 회원탈퇴 응답으로 변환한다.
     *
     * @param user 탈퇴 상태로 전환된 사용자
     * @return 탈퇴 시각과 성공 여부를 담은 응답
     */
    public static UserWithdrawResponse from(User user) {
        return new UserWithdrawResponse(user.getWithdrawnAt(), true);
    }
}
