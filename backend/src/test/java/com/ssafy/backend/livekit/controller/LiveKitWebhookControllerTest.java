package com.ssafy.backend.livekit.controller;

import com.ssafy.backend.livekit.service.LiveKitWebhookReceiver;
import com.ssafy.backend.livekit.service.LiveKitWebhookService;
import livekit.LivekitWebhook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LiveKitWebhookControllerTest {

    private LiveKitWebhookReceiver webhookReceiver;
    private LiveKitWebhookService webhookService;
    private MockMvc mockMvc;

    /** webhook 검증기와 처리 서비스 mock을 사용하는 MockMvc를 구성한다. */
    @BeforeEach
    void setUp() {
        webhookReceiver = mock(LiveKitWebhookReceiver.class);
        webhookService = mock(LiveKitWebhookService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(
                new LiveKitWebhookController(webhookReceiver, webhookService)).build();
    }

    /** application/webhook+json 요청의 원본 본문과 서명을 검증·처리하고 204를 반환하는지 검증한다. */
    @Test
    void receivesSignedWebhookAndReturnsNoContent() throws Exception {
        String body = """
                {"event":"participant_joined","id":"event-1"}
                """;
        LivekitWebhook.WebhookEvent event = LivekitWebhook.WebhookEvent.newBuilder()
                .setEvent("participant_joined")
                .setId("event-1")
                .build();
        when(webhookReceiver.receive(body, "signed-token")).thenReturn(event);

        mockMvc.perform(post("/api/v1/livekit/webhook")
                        .contentType("application/webhook+json")
                        .header("Authorization", "signed-token")
                        .content(body))
                .andExpect(status().isNoContent());

        verify(webhookReceiver).receive(body, "signed-token");
        verify(webhookService).handle(event);
    }
}
