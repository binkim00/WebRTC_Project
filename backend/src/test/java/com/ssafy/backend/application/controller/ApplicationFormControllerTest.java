package com.ssafy.backend.application.controller;

import com.ssafy.backend.application.dto.ApplicationFormResponse;
import com.ssafy.backend.application.dto.ApplicationFormSaveRequest;
import com.ssafy.backend.application.dto.ApplicationFormSaveResponse;
import com.ssafy.backend.application.service.ApplicationFormService;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ApplicationFormControllerTest {

    private static final AuthenticatedUser MANAGER = new AuthenticatedUser(3L, UserRole.MANAGER);

    /** 응모 폼 조회 요청의 팬미팅 식별자를 서비스에 전달하고 공통 성공 응답을 반환하는지 검증한다. */
    @Test
    void delegatesGetForm() {
        ApplicationFormService service = mock(ApplicationFormService.class);
        ApplicationFormController controller = new ApplicationFormController(service);
        ApplicationFormResponse expected =
                new ApplicationFormResponse(300L, "안내문", List.of());
        when(service.getForm(10L)).thenReturn(expected);

        ApiResponse<ApplicationFormResponse> response = controller.getForm(10L);

        verify(service).getForm(10L);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 응모 폼 저장 요청의 팬미팅 식별자, 본문과 인증 정보를 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesSaveForm() {
        ApplicationFormService service = mock(ApplicationFormService.class);
        ApplicationFormController controller = new ApplicationFormController(service);
        ApplicationFormSaveRequest request =
                new ApplicationFormSaveRequest("안내문", List.of());
        ApplicationFormSaveResponse expected = new ApplicationFormSaveResponse(
                300L, 10L, "안내문", List.of(), LocalDateTime.of(2026, 7, 30, 12, 0)
        );
        when(service.saveForm(10L, request, MANAGER)).thenReturn(expected);

        ApiResponse<ApplicationFormSaveResponse> response =
                controller.saveForm(10L, request, MANAGER);

        verify(service).saveForm(10L, request, MANAGER);
        assertThat(response.data()).isSameAs(expected);
    }
}
