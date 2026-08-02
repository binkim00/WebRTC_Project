package com.ssafy.backend.organization.dto;

import com.ssafy.backend.organization.domain.Organization;

import java.time.LocalDateTime;

/**
 * 생성되거나 조회된 조직의 기본 정보를 전달한다.
 *
 * @param organizationId 조직 식별자
 * @param name 조직명
 * @param businessNumber 사업자등록번호
 * @param representativeName 대표자명
 * @param contactEmail 연락 이메일
 * @param contactPhone 연락 전화번호
 * @param logoUrl 로고 이미지 URL
 * @param description 조직 설명
 * @param status 조직 상태
 * @param createdAt 조직 생성 시각
 */
public record OrganizationResponse(
        Long organizationId,
        String name,
        String businessNumber,
        String representativeName,
        String contactEmail,
        String contactPhone,
        String logoUrl,
        String description,
        String status,
        LocalDateTime createdAt
) {
    /**
     * 조직 엔티티를 API 응답으로 변환한다.
     *
     * @param organization 변환할 조직
     * @return 조직 응답
     */
    public static OrganizationResponse from(Organization organization) {
        return new OrganizationResponse(
                organization.getId(),
                organization.getName(),
                organization.getBusinessNumber(),
                organization.getRepresentativeName(),
                organization.getContactEmail(),
                organization.getContactPhone(),
                organization.getLogoUrl(),
                organization.getDescription(),
                organization.getStatus(),
                organization.getCreatedAt()
        );
    }
}
