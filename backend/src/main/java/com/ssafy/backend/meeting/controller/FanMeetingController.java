package com.ssafy.backend.meeting.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.meeting.dto.FanMeetingCreateRequest;
import com.ssafy.backend.meeting.dto.FanMeetingCreateResponse;
import com.ssafy.backend.meeting.service.FanMeetingService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/fan-meetings")
public class FanMeetingController {
    private final FanMeetingService fanMeetingService;

    public FanMeetingController(FanMeetingService fanMeetingService) {
        this.fanMeetingService = fanMeetingService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FanMeetingCreateResponse create(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @Valid @RequestBody FanMeetingCreateRequest request
    ) {
        return fanMeetingService.create(authenticatedUser, request);
    }
}
