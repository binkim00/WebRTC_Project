package com.ssafy.backend.common.entity;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;

import java.time.LocalDateTime;

/**
 * 생성 시각만 필요한 엔티티가 공통으로 사용하는 기반 클래스다.
 */
@MappedSuperclass
public abstract class BaseCreatedTimeEntity {

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * 엔티티가 처음 저장되기 직전에 생성 시각을 설정한다.
     */
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    /**
     * 엔티티가 생성된 시각을 반환한다.
     *
     * @return 생성 시각
     */
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
