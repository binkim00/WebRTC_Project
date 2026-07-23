package com.ssafy.backend.livekit.controller;

import com.ssafy.backend.livekit.service.LiveKitTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LiveKitTokenControllerTest {

    private LiveKitTokenService tokenService;
    private MockMvc mockMvc;

    /** 토큰 서비스 mock을 사용하는 standalone MockMvc를 각 테스트 전에 구성한다. */
    @BeforeEach
    void setUp() {
        tokenService = mock(LiveKitTokenService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new LiveKitTokenController(tokenService))
                .build();
    }

    /** 사용자 식별자가 공백이면 토큰 서비스를 호출하지 않고 HTTP 400을 반환하는지 확인한다. */
    @Test
    void returnsBadRequestWhenIdentityIsBlank() throws Exception {
        mockMvc.perform(post("/api/v1/livekit/test-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "identity": "   ",
                                  "displayName": "테스트 사용자"
                                }
                                """))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(tokenService);
    }
}
