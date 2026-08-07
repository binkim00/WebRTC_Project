package com.ssafy.backend.livekit.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.config.livekit.LiveKitProperties;
import io.livekit.server.WebhookReceiver;
import livekit.LivekitWebhook;
import org.springframework.stereotype.Component;

/**
 * LiveKit webhook 서명과 본문 해시를 검증하고 SDK 이벤트로 변환한다.
 */
@Component
public class LiveKitWebhookReceiver {

    private final WebhookReceiver receiver;

    /**
     * LiveKit API 키와 비밀값으로 webhook 검증기를 구성한다.
     *
     * @param properties LiveKit 서버 인증 설정
     */
    public LiveKitWebhookReceiver(LiveKitProperties properties) {
        this.receiver = new WebhookReceiver(
                properties.getApiKey(), properties.getApiSecret());
    }

    /**
     * Authorization 서명과 본문 SHA-256을 검증한 webhook 이벤트를 반환한다.
     *
     * @param body 원본 webhook JSON 본문
     * @param authorization LiveKit이 전달한 Authorization 헤더
     * @return 검증 및 역직렬화된 LiveKit webhook 이벤트
     * @throws BusinessException 서명, 본문 해시 또는 JSON이 유효하지 않은 경우
     */
    public LivekitWebhook.WebhookEvent receive(String body, String authorization) {
        try {
            return receiver.receive(body, authorization);
        } catch (RuntimeException exception) {
            throw new BusinessException(ErrorCode.INVALID_LIVEKIT_WEBHOOK);
        }
    }
}
