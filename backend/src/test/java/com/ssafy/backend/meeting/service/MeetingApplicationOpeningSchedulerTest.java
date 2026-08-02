package com.ssafy.backend.meeting.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MeetingApplicationOpeningSchedulerTest {

    private MeetingApplicationOpeningService openingService;
    private MeetingApplicationOpeningScheduler scheduler;

    /** 각 테스트에서 사용할 스케줄러와 응모 시작 서비스 대역을 구성한다. */
    @BeforeEach
    void setUp() {
        openingService = mock(MeetingApplicationOpeningService.class);
        scheduler = new MeetingApplicationOpeningScheduler(openingService);
    }

    /** 조회된 모든 후보 팬미팅에 대해 응모 시작을 시도하는지 검증한다. */
    @Test
    void opensEveryDueMeeting() {
        when(openingService.findOpenTargetIds()).thenReturn(List.of(1L, 2L));
        when(openingService.openIfDue(1L)).thenReturn(true);
        when(openingService.openIfDue(2L)).thenReturn(true);

        scheduler.openDueApplications();

        verify(openingService).openIfDue(1L);
        verify(openingService).openIfDue(2L);
    }

    /** 한 건이 실패해도 남은 후보를 계속 처리하는지 검증한다. */
    @Test
    void continuesAfterFailure() {
        when(openingService.findOpenTargetIds()).thenReturn(List.of(1L, 2L));
        when(openingService.openIfDue(1L)).thenThrow(new IllegalStateException("전환 실패"));
        when(openingService.openIfDue(2L)).thenReturn(true);

        scheduler.openDueApplications();

        verify(openingService).openIfDue(2L);
    }
}
