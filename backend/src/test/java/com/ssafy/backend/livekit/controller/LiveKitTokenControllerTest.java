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

    @BeforeEach
    void setUp() {
        tokenService = mock(LiveKitTokenService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new LiveKitTokenController(tokenService))
                .build();
    }

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
