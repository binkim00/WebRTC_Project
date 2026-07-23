package com.ssafy.backend.common;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {

    @GetMapping("/health")
    /** 서버가 요청을 처리할 수 있는지 확인하는 간단한 상태 메시지를 반환한다. */
    public String health() {
        return "Melly backend is running";
    }
}
