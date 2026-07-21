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

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getApiSecret() {
        return apiSecret;
    }

    public void setApiSecret(String apiSecret) {
        this.apiSecret = apiSecret;
    }

    public boolean isTestTokenEnabled() {
        return testTokenEnabled;
    }

    public void setTestTokenEnabled(boolean testTokenEnabled) {
        this.testTokenEnabled = testTokenEnabled;
    }
}
