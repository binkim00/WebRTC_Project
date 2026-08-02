package com.ssafy.backend.organization.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 인플루언서와 매니저가 소속되는 조직의 기본 정보 엔티티다.
 */
@Getter
@Entity
@Table(name = "organizations")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Organization extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "organization_id", nullable = false)
    private Long id;

    @Column(name = "organization_name", nullable = false, length = 150)
    private String name;

    @Column(name = "business_number", unique = true, length = 30)
    private String businessNumber;

    @Column(name = "representative_name", length = 100)
    private String representativeName;

    @Column(name = "contact_email", length = 255)
    private String contactEmail;

    @Column(name = "contact_phone", length = 30)
    private String contactPhone;

    @Column(name = "logo_url", length = 2048)
    private String logoUrl;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    /** 조직 생성에 필요한 기본 정보를 초기화한다. */
    private Organization(String name, String businessNumber, String representativeName,
                         String contactEmail, String contactPhone, String logoUrl,
                         String description) {
        this.name = name;
        this.businessNumber = businessNumber;
        this.representativeName = representativeName;
        this.contactEmail = contactEmail;
        this.contactPhone = contactPhone;
        this.logoUrl = logoUrl;
        this.description = description;
        this.status = "ACTIVE";
    }

    /**
     * 활성 상태의 조직을 생성한다.
     *
     * @param name 조직명
     * @param businessNumber 사업자등록번호
     * @param representativeName 대표자명
     * @param contactEmail 연락 이메일
     * @param contactPhone 연락 전화번호
     * @param logoUrl 로고 이미지 URL
     * @param description 조직 설명
     * @return 생성된 활성 조직
     */
    public static Organization createActive(String name, String businessNumber,
                                            String representativeName, String contactEmail,
                                            String contactPhone, String logoUrl,
                                            String description) {
        return new Organization(name, businessNumber, representativeName, contactEmail,
                contactPhone, logoUrl, description);
    }
}
