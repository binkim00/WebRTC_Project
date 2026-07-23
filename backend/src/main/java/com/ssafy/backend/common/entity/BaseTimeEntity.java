package com.ssafy.backend.common.entity;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

import java.time.LocalDateTime;

@MappedSuperclass
public abstract class BaseTimeEntity {

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    /** 엔티티가 처음 저장되기 직전에 생성·수정 시각을 같은 값으로 설정한다. */
    protected void onCreate() {
        // 두 컬럼 사이에 미세한 시간 차이가 생기지 않도록 현재 시각을 한 번만 조회한다.
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    /** 기존 엔티티가 수정되기 직전에 수정 시각을 갱신한다. */
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    /** 엔티티가 최초로 저장된 시각을 반환한다. */
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    /** 엔티티가 마지막으로 수정된 시각을 반환한다. */
    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
