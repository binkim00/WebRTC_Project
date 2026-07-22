package com.ssafy.backend.livekit.controller;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class LiveKitTokenControllerConditionTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(LiveKitTokenController.class);

    @Test
    void doesNotRegisterControllerWhenPropertyIsMissing() {
        contextRunner.run(context ->
                assertThat(context).doesNotHaveBean(LiveKitTokenController.class)
        );
    }

    @Test
    void doesNotRegisterControllerWhenTestTokenApiIsDisabled() {
        contextRunner
                .withPropertyValues("livekit.test-token-enabled=false")
                .run(context ->
                        assertThat(context).doesNotHaveBean(LiveKitTokenController.class)
                );
    }
}
