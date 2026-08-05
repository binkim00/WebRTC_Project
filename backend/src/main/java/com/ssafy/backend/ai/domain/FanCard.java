package com.ssafy.backend.ai.domain;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.common.entity.BaseCreatedTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;

/**
 * 팬이 영상통화 후 선택한 기념 문구를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "fan_card")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FanCard extends BaseCreatedTimeEntity {

    /**
     * 카드 한 장에 넣을 수 있는 문구의 최대 길이다.
     *
     * <p>AI 추천 문구는 더 짧게 제한되지만, 팬이 자막에서 직접 고른 문장은 그보다 길 수 있어
     * 카드 도안에 담기는 현실적인 상한으로 잡는다.
     */
    public static final int MAX_TEXT_LENGTH = 200;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "fan_card_id", nullable = false)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "call_session_id", nullable = false, unique = true)
    private CallSession callSession;

    @Column(name = "text", nullable = false, columnDefinition = "TEXT")
    private String text;

    /**
     * 팬이 고른 문구로 기념 카드를 만든다.
     *
     * @param callSession 카드를 만든 통화 세션
     * @param text 팬이 고른 문구
     */
    private FanCard(CallSession callSession, String text) {
        this.callSession = Objects.requireNonNull(callSession);
        this.text = requireUsableText(text);
    }

    /**
     * 통화 세션에 팬이 고른 문구로 기념 카드를 생성한다.
     *
     * @param callSession 카드를 만든 통화 세션
     * @param text 팬이 고른 문구
     * @return 생성된 기념 카드
     * @throws IllegalArgumentException 문구가 비었거나 허용 길이를 넘은 경우
     */
    public static FanCard create(CallSession callSession, String text) {
        return new FanCard(callSession, text);
    }

    /**
     * 팬이 카드 문구를 다시 골랐을 때 저장된 문구를 바꾼다.
     *
     * <p>카드는 통화 세션당 한 장만 존재하므로 재선택은 새 행을 만들지 않고 문구만 교체한다.
     *
     * @param text 새로 고른 문구
     * @throws IllegalArgumentException 문구가 비었거나 허용 길이를 넘은 경우
     */
    public void changeText(String text) {
        this.text = requireUsableText(text);
    }

    /**
     * 카드에 넣을 수 있는 문구인지 확인하고 앞뒤 공백을 정리한다.
     *
     * @param text 검사할 문구
     * @return 공백을 정리한 문구
     * @throws IllegalArgumentException 문구가 비었거나 허용 길이를 넘은 경우
     */
    private static String requireUsableText(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("카드 문구는 비어 있을 수 없습니다.");
        }
        String trimmed = text.strip();
        if (trimmed.length() > MAX_TEXT_LENGTH) {
            throw new IllegalArgumentException("카드 문구는 " + MAX_TEXT_LENGTH + "자를 넘을 수 없습니다.");
        }
        return trimmed;
    }
}
