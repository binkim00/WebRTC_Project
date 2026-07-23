package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.SignupRequest;
import com.ssafy.backend.auth.dto.SignupResponse;
import com.ssafy.backend.auth.service.SignupService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final SignupService signupService;

    /** 회원가입 비즈니스 로직을 처리할 서비스를 주입받는다. */
    public AuthController(SignupService signupService) {
        this.signupService = signupService;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    /** 회원가입 요청값을 검증한 뒤 사용자를 생성하고 HTTP 201 응답을 반환한다. */
    public SignupResponse signup(@Valid @RequestBody SignupRequest request) {
        return signupService.signup(request);
    }
}
