package com.ssafy.backend.ai.domain;

import com.ssafy.backend.call.domain.CallSession;
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
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 통화 중 발화와 번역 자막을 순서대로 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(
        name = "ai_subtitle",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_ai_subtitle_call_sequence",
                columnNames = {"call_session_id", "sequence"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiSubtitle {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "subtitle_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "call_session_id", nullable = false)
    private CallSession callSession;

    @Column(name = "sequence", nullable = false)
    private Long sequence;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "speaker_id", nullable = false)
    private User speaker;

    @Column(name = "speaker_role", nullable = false, length = 30)
    private String speakerRole;

    @Column(name = "spoken_at", nullable = false)
    private LocalDateTime spokenAt;

    @Column(name = "original_text", nullable = false, columnDefinition = "TEXT")
    private String originalText;

    @Column(name = "original_lang", nullable = false, length = 20)
    private String originalLanguage;

    @Column(name = "translated_text", columnDefinition = "TEXT")
    private String translatedText;

    @Column(name = "translated_lang", length = 20)
    private String translatedLanguage;
}
