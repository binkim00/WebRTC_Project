package com.ssafy.backend.livekit.controller;

import com.ssafy.backend.livekit.service.LiveKitWebhookReceiver;
import com.ssafy.backend.livekit.service.LiveKitWebhookService;
import livekit.LivekitWebhook;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * LiveKit 서버가 전달하는 통화 생명주기 webhook을 수신한다.
 */
@RestController
@RequestMapping("/api/v1/livekit")
public class LiveKitWebhookController {

    private final LiveKitWebhookReceiver webhookReceiver;
    private final LiveKitWebhookService webhookService;

    /**
     * webhook 서명 검증기와 상태 반영 서비스를 주입받는다.
     *
     * @param webhookReceiver LiveKit webhook 서명 검증기
     * @param webhookService 검증된 이벤트 상태 반영 서비스
     */
    public LiveKitWebhookController(
            LiveKitWebhookReceiver webhookReceiver,
            LiveKitWebhookService webhookService
    ) {
        this.webhookReceiver = webhookReceiver;
        this.webhookService = webhookService;
    }

    /**
     * 원본 본문과 Authorization 서명을 검증한 뒤 webhook 이벤트를 처리한다.
     *
     * @param body LiveKit이 전달한 원본 JSON 본문
     * @param authorization LiveKit webhook 서명 토큰
     * @return 처리가 완료되었음을 나타내는 HTTP 204 응답
     */
    @PostMapping(value = "/webhook", consumes = {"application/webhook+json", "application/json"})
    public ResponseEntity<Void> receive(
            @RequestBody String body,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false)
            String authorization
    ) {
        LivekitWebhook.WebhookEvent event = webhookReceiver.receive(body, authorization);
        webhookService.handle(event);
        return ResponseEntity.noContent().build();
    }
}
