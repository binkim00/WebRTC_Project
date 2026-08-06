package com.ssafy.backend.organization.dto;

import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.user.domain.UserRole;

import java.time.LocalDateTime;

/**
 * 조직 구성원의 공개 가능한 소속 정보를 전달한다.
 *
 * @param organizationMemberId 조직 소속 식별자
 * @param userId 사용자 식별자
 * @param nickname 사용자 닉네임
 * @param profileImageUrl 사용자 프로필 이미지 URL
 * @param userRole 서비스 사용자 역할
 * @param memberType 조직 내 역할
 * @param status 소속 상태
 * @param joinedAt 소속 시작 시각
 * @param leftAt 소속 종료 시각
 */
public record OrganizationMemberResponse(
        Long organizationMemberId,
        Long userId,
        String nickname,
        String profileImageUrl,
        UserRole userRole,
        OrganizationMemberType memberType,
        OrganizationMemberStatus status,
        LocalDateTime joinedAt,
        LocalDateTime leftAt
) {
    /**
     * 조직 소속 엔티티를 구성원 응답으로 변환한다.
     *
     * @param member 변환할 조직 소속
     * @return 조직 구성원 응답
     */
    public static OrganizationMemberResponse from(OrganizationMember member) {
        return new OrganizationMemberResponse(
                member.getId(),
                member.getUser().getId(),
                member.getUser().getNickname(),
                member.getUser().getProfileImageUrl(),
                member.getUser().getRole(),
                member.getMemberType(),
                member.getStatus(),
                member.getJoinedAt(),
                member.getLeftAt()
        );
    }
}
