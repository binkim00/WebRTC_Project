package com.ssafy.backend;

import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.application.service.ApplicationService;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.device.repository.DeviceCheckRepository;
import com.ssafy.backend.influencer.repository.FanMemoRepository;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.organization.repository.OrganizationRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.queue.repository.QueueChangeRequestRepository;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef"
})
class BackendApplicationTests {

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private FanMeetingRepository fanMeetingRepository;

    @MockitoBean
    private MeetingOperationSettingRepository meetingOperationSettingRepository;

    @MockitoBean
    private OrganizationMemberRepository organizationMemberRepository;

    @MockitoBean
    private OrganizationRepository organizationRepository;

    @MockitoBean
    private ParticipantRepository participantRepository;

    @MockitoBean
    private DeviceCheckRepository deviceCheckRepository;

    @MockitoBean
    private QueueEntryRepository queueEntryRepository;

    @MockitoBean
    private QueueChangeRequestRepository queueChangeRequestRepository;

    @MockitoBean
    private CallSessionRepository callSessionRepository;

    @MockitoBean
    private MeetingApplicationSettingRepository applicationSettingRepository;

    @MockitoBean
    private ApplicationRepository applicationRepository;

    @MockitoBean
    private ApplicationFormRepository applicationFormRepository;

    @MockitoBean
    private ApplicationQuestionRepository applicationQuestionRepository;

    @MockitoBean
    private ApplicationAnswerRepository applicationAnswerRepository;

    @MockitoBean
    private ApplicationService applicationService;

    @MockitoBean
    private NotificationRepository notificationRepository;

    @MockitoBean
    private FollowingRepository followingRepository;

    @MockitoBean
    private FanMemoRepository fanMemoRepository;

    @MockitoBean
    private InfluencerProfileRepository influencerProfileRepository;

    @MockitoBean
    private PostRepository postRepository;

    /**
     * DB 자동 구성 없이도 Spring 애플리케이션 컨텍스트가 정상적으로 시작되는지 확인한다.
     */
    @Test
    void contextLoads() {
    }

}
