package com.ssafy.backend.meeting.controller;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/** 운영 환경에서 팬미팅 테스트 제어 컨트롤러가 등록되지 않는지 검증한다. */
class FanMeetingTestControlControllerConditionTest {

    /** 운영 프로필에서는 활성화 설정이 있어도 테스트 제어 컨트롤러를 등록하지 않는지 확인한다. */
    @Test
    void doesNotRegisterControllerInProductionProfile() {
        new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
                .withUserConfiguration(FanMeetingTestControlController.class)
                .withPropertyValues("app.test-control.enabled=true")
                .run(context ->
                        assertThat(context).doesNotHaveBean(FanMeetingTestControlController.class)
                );
    }
}
