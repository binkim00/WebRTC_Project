package com.ssafy.backend.organization.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 매니저가 조직을 생성할 때 전달하는 기본 정보다.
 *
 * @param name 조직명
 * @param businessNumber 사업자등록번호
 * @param representativeName 대표자명
 * @param contactEmail 연락 이메일
 * @param contactPhone 연락 전화번호
 * @param logoUrl 로고 이미지 URL
 * @param description 조직 설명
 */
public record OrganizationCreateRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 30) String businessNumber,
        @Size(max = 100) String representativeName,
        @Email @Size(max = 255) String contactEmail,
        @Size(max = 30) String contactPhone,
        @Size(max = 2048) String logoUrl,
        String description
) {
}
