package com.ssafy.backend.livekit.controller;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class LiveKitTokenControllerConditionTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(LiveKitTokenController.class);

    /** 활성화 설정이 없으면 테스트 토큰 컨트롤러가 Bean으로 등록되지 않는지 확인한다. */
    @Test
    void doesNotRegisterControllerWhenPropertyIsMissing() {
        contextRunner.run(context ->
                assertThat(context).doesNotHaveBean(LiveKitTokenController.class)
        );
    }

    /** 테스트 토큰 기능을 명시적으로 끄면 컨트롤러가 등록되지 않는지 확인한다. */
    @Test
    void doesNotRegisterControllerWhenTestTokenApiIsDisabled() {
        contextRunner
                .withPropertyValues("livekit.test-token-enabled=false")
                .run(context ->
                        assertThat(context).doesNotHaveBean(LiveKitTokenController.class)
                );
    }
}
