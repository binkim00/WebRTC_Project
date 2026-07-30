package com.ssafy.backend.application.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.meeting.domain.FanMeeting;
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
 * 팬미팅별 응모 폼 식별자와 안내문을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "application_forms")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationForm extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "application_form_id", nullable = false)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "meeting_id", nullable = false, unique = true)
    private FanMeeting meeting;

    @Column(name = "form_description", columnDefinition = "TEXT")
    private String formDescription;

    /**
     * 팬미팅에 응모 폼을 새로 생성한다.
     *
     * @param meeting 폼을 등록할 팬미팅
     * @param formDescription 응모 안내문이며 없으면 null
     * @return 생성된 응모 폼
     */
    public static ApplicationForm create(FanMeeting meeting, String formDescription) {
        ApplicationForm form = new ApplicationForm();
        form.meeting = Objects.requireNonNull(meeting);
        form.formDescription = formDescription;
        return form;
    }

    /**
     * 응모 안내문을 교체한다.
     *
     * @param formDescription 변경할 응모 안내문이며 없으면 null
     */
    public void updateDescription(String formDescription) {
        this.formDescription = formDescription;
    }
}
