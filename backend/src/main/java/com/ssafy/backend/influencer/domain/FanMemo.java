package com.ssafy.backend.influencer.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 인플루언서가 팬과의 만남을 기록한 메모 엔티티다.
 */
@Getter
@Entity
@Table(name = "fan_memos")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FanMemo extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "fan_memo_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "influencer_id", nullable = false)
    private User influencer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fan_id", nullable = false)
    private User fan;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id")
    private FanMeeting meeting;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private FanMemo(User influencer, User fan, FanMeeting meeting, String content) {
        this.influencer = Objects.requireNonNull(influencer);
        this.fan = Objects.requireNonNull(fan);
        this.meeting = Objects.requireNonNull(meeting);
        this.content = Objects.requireNonNull(content);
    }

    /**
     * 팬 메모를 생성한다.
     *
     * @param influencer 메모를 작성하는 인플루언서
     * @param fan 메모 대상 팬
     * @param meeting 메모가 속한 팬미팅 회차
     * @param content 메모 내용
     * @return 생성된 팬 메모
     */
    public static FanMemo create(User influencer, User fan, FanMeeting meeting, String content) {
        return new FanMemo(influencer, fan, meeting, content);
    }

    /**
     * 메모 내용을 수정한다.
     *
     * @param content 새로운 메모 내용
     */
    public void updateContent(String content) {
        this.content = Objects.requireNonNull(content);
    }

    /**
     * 메모를 소프트 삭제 처리한다.
     *
     * @param deletedAt 삭제 처리 시각
     */
    public void delete(LocalDateTime deletedAt) {
        // 실제 row는 남기고 deletedAt만 채워서, 목록 조회 시 필터링만으로 감추는 방식이다
        this.deletedAt = deletedAt;
    }
}
