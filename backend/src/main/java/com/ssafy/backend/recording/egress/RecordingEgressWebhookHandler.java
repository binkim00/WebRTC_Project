package com.ssafy.backend.recording.egress;

import livekit.LivekitWebhook;
import org.springframework.stereotype.Component;

/** 검증된 LiveKit Egress webhook을 녹화 상태 전이에 전달한다. */
@Component
public class RecordingEgressWebhookHandler {

    private final RecordingEgressStateService stateService;

    public RecordingEgressWebhookHandler(RecordingEgressStateService stateService) {
        this.stateService = stateService;
    }

    public void handle(LivekitWebhook.WebhookEvent event) {
        if (!event.hasEgressInfo()) {
            return;
        }
        stateService.applyWebhook(event.getEgressInfo());
    }
}
