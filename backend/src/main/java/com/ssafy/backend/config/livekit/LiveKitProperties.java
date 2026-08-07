package com.ssafy.backend.config.livekit;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Validated
@Component
@ConfigurationProperties(prefix = "livekit")
public class LiveKitProperties {

    @NotBlank
    private String url;

    @NotBlank
    private String apiKey;

    @NotBlank
    private String apiSecret;

    private boolean testTokenEnabled;

    /** LiveKit 서버 WebSocket URL을 반환한다. */
    public String getUrl() {
        return url;
    }

    /** 설정에서 읽은 LiveKit 서버 URL을 저장한다. */
    public void setUrl(String url) {
        this.url = url;
    }

    /** LiveKit API 키를 반환한다. */
    public String getApiKey() {
        return apiKey;
    }

    /** 설정에서 읽은 LiveKit API 키를 저장한다. */
    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    /** LiveKit 토큰 서명에 사용할 API 비밀값을 반환한다. */
    public String getApiSecret() {
        return apiSecret;
    }

    /** 설정에서 읽은 LiveKit API 비밀값을 저장한다. */
    public void setApiSecret(String apiSecret) {
        this.apiSecret = apiSecret;
    }

    /** 테스트 토큰 API 활성화 여부를 반환한다. */
    public boolean isTestTokenEnabled() {
        return testTokenEnabled;
    }

    /** 테스트 토큰 API 활성화 여부를 저장한다. */
    public void setTestTokenEnabled(boolean testTokenEnabled) {
        this.testTokenEnabled = testTokenEnabled;
    }
}
