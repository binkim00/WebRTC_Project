package com.ssafy.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 통화 만료, 녹화 만료, 팬미팅 응모 시작 등 주기 작업의 스케줄링을 활성화한다. */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
