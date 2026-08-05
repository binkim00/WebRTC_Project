package com.ssafy.backend.auth.dto;

import com.ssafy.backend.auth.domain.SocialAccount;
import com.ssafy.backend.auth.domain.SocialProvider;

import java.time.LocalDateTime;

/**
 * 마이페이지에 표시할 소셜 계정 연결 정보다.
 *
 * <p>{@code providerUserId}는 담지 않는다. 화면에 쓰지 않는 외부 식별자를 응답에 노출할 이유가 없다.
 *
 * @param provider 연결된 소셜 공급자
 * @param providerName 화면에 표시할 공급자 이름
 * @param connectedAt 연결한 시각
 */
public record SocialAccountResponse(
        SocialProvider provider,
        String providerName,
        LocalDateTime connectedAt
) {

    /**
     * 연결 엔티티를 마이페이지 응답 형식으로 변환한다.
     *
     * @param account 변환할 연결 엔티티
     * @return 화면 표시용 연결 정보
     */
    public static SocialAccountResponse from(SocialAccount account) {
        return new SocialAccountResponse(
                account.getProvider(),
                account.getProvider().displayName(),
                account.getCreatedAt()
        );
    }
}
