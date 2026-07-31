package com.ssafy.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 통화 제한 시간과 재접속 유예 만료 작업의 스케줄링을 활성화한다. */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
