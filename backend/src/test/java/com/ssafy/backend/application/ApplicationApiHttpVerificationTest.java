package com.ssafy.backend.application;

import com.jayway.jsonpath.JsonPath;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * 실제 TCP 소켓과 JWT 인증을 거치는 HTTP 요청으로 응모 API 전체 흐름을 검증한다.
 *
 * <p>응모 제출은 팬미팅이 APPLICATION_OPEN 상태여야 하지만 현재 코드베이스에는
 * PUBLISHED → APPLICATION_OPEN 전이를 수행하는 API나 스케줄러가 없다. 그래서 상태 전이만
 * 저장소로 직접 만들고, 그 이후의 저장·조회는 모두 실제 HTTP 요청으로 확인한다.
 * Redis에 의존하는 토큰 세션 저장소는 대역으로 대체한다.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.docker.compose.enabled=false",
                "spring.datasource.url=jdbc:h2:mem:application-http;MODE=MySQL;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver",
                "spring.datasource.username=sa",
                "spring.datasource.password=",
                "spring.jpa.hibernate.ddl-auto=create-drop",
                "spring.sql.init.mode=never",
                "livekit.url=wss://test.livekit.invalid",
                "livekit.api-key=test-api-key",
                "livekit.api-secret=test-api-secret",
                "jwt.secret=0123456789abcdef0123456789abcdef"
        }
)
class ApplicationApiHttpVerificationTest {

    private static final AtomicInteger SEQUENCE = new AtomicInteger();
    private static final String TWO_QUESTIONS = """
            {"formDescription":"응모 안내문",
             "questions":[
               {"questionText":"이름","questionType":"SHORT_TEXT",
                "required":true,"displayOrder":1},
               {"questionText":"응원 메시지","questionType":"LONG_TEXT",
                "required":false,"displayOrder":2}]}
            """;

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @Autowired
    private MeetingApplicationSettingRepository applicationSettingRepository;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    private HttpClient httpClient;
    private User owner;
    private User fan;
    private String ownerToken;
    private String fanToken;
    private Long meetingId;

    /** 각 테스트가 쓸 HTTP 클라이언트, 사용자, 접근 토큰과 응모 시작 전 팬미팅을 준비한다. */
    @BeforeEach
    void setUp() {
        when(revokedAccessTokenStore.isRevoked(anyString())).thenReturn(false);
        when(tokenSessionStore.isCurrentAccessToken(anyLong(), anyString())).thenReturn(true);
        httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

        int sequence = SEQUENCE.incrementAndGet();
        owner = saveUser("http-owner-" + sequence, "HTTP진행자" + sequence,
                UserRole.SOLO_INFLUENCER);
        fan = saveUser("http-fan-" + sequence, "HTTP팬" + sequence, UserRole.FAN);
        ownerToken = jwtTokenProvider.issue(owner).accessToken();
        fanToken = jwtTokenProvider.issue(fan).accessToken();

        FanMeeting meeting = fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, null, owner, "HTTP 검증 팬미팅 " + sequence, "설명",
                "https://cdn.melly.test/cover.png", LocalDateTime.now().plusDays(10)
        ));
        meetingId = meeting.getId();
        applicationSettingRepository.saveAndFlush(MeetingApplicationSetting.create(
                meeting, true, LocalDateTime.now().plusHours(1),
                LocalDateTime.now().plusDays(2), LocalDateTime.now().plusDays(3), 10
        ));
    }

    /** 폼 저장 후 재조회, 응모 제출 후 조회·통계, 취소 후 재조회를 실제 HTTP로 검증한다. */
    @Test
    void verifiesFormAndApplicationFlowOverHttp() throws Exception {
        HttpResponse<String> savedForm = send("PUT", formPath(), ownerToken, TWO_QUESTIONS);
        assertThat(savedForm.statusCode()).isEqualTo(200);
        long firstQuestionId = readLong(savedForm, "$.data.questions[0].questionId");
        long secondQuestionId = readLong(savedForm, "$.data.questions[1].questionId");

        HttpResponse<String> form = send("GET", formPath(), null, null);
        assertThat(form.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<List<String>>read(form.body(), "$.data.questions[*].questionText"))
                .containsExactly("이름", "응원 메시지");

        openApplications();

        HttpResponse<String> submitted = send("POST", applicationsPath(), fanToken, """
                {"personalInformationConsent":true,
                 "recordingConsent":true,"participationConsent":true,
                 "answers":[{"questionId":%d,"value":"멜리"},
                            {"questionId":%d,"value":"응원합니다"}]}
                """.formatted(firstQuestionId, secondQuestionId));
        assertThat(submitted.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<String>read(submitted.body(), "$.data.applicationStatus"))
                .isEqualTo("SUBMITTED");

        HttpResponse<String> myApplication = send("GET", applicationsPath() + "/me", fanToken, null);
        assertThat(myApplication.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<String>read(myApplication.body(), "$.data.applicationStatus"))
                .isEqualTo("SUBMITTED");
        assertThat(readLong(myApplication, "$.data.meetingId")).isEqualTo(meetingId);
        assertThat(JsonPath.<String>read(myApplication.body(), "$.data.influencerName"))
                .isEqualTo(owner.getNickname());
        assertThat(JsonPath.<Object>read(myApplication.body(), "$.data.callOrder")).isNull();

        HttpResponse<String> applicants = send("GET", applicationsPath(), ownerToken, null);
        assertThat(applicants.statusCode()).isEqualTo(200);
        assertThat(readLong(applicants, "$.data.totalApplications")).isEqualTo(1L);
        assertThat(JsonPath.<String>read(applicants.body(), "$.data.content[0].nickname"))
                .isEqualTo(fan.getNickname());
        assertThat(JsonPath.<List<String>>read(
                applicants.body(), "$.data.content[0].answers[*].answerText"))
                .containsExactly("멜리", "응원합니다");

        HttpResponse<String> history = send("GET", "/api/v1/users/me/applications", fanToken, null);
        assertThat(history.statusCode()).isEqualTo(200);
        assertThat(readLong(history, "$.data.totalElements")).isEqualTo(1L);
        assertThat(readLong(history, "$.data.content[0].meetingId")).isEqualTo(meetingId);

        HttpResponse<String> statistics =
                send("GET", applicationsPath() + "/statistics", ownerToken, null);
        assertThat(statistics.statusCode()).isEqualTo(200);
        assertThat(readLong(statistics, "$.data.totalApplications")).isEqualTo(1L);
        assertThat(readLong(statistics, "$.data.submittedCount")).isEqualTo(1L);
        assertThat(readLong(statistics, "$.data.questionStats[0].responseCount")).isEqualTo(1L);

        HttpResponse<String> withdrawn = send("DELETE", applicationsPath() + "/me", fanToken, null);
        assertThat(withdrawn.statusCode()).isEqualTo(200);

        HttpResponse<String> afterWithdraw =
                send("GET", applicationsPath() + "/me", fanToken, null);
        assertThat(JsonPath.<String>read(afterWithdraw.body(), "$.data.applicationStatus"))
                .isEqualTo("WITHDRAWN");

        HttpResponse<String> applicantsAfterWithdraw =
                send("GET", applicationsPath(), ownerToken, null);
        assertThat(readLong(applicantsAfterWithdraw, "$.data.totalApplications")).isZero();
        assertThat(JsonPath.<List<Object>>read(applicantsAfterWithdraw.body(), "$.data.content"))
                .isEmpty();
    }

    /** 권한 없는 요청과 존재하지 않는 리소스 요청의 상태 코드를 실제 HTTP로 검증한다. */
    @Test
    void rejectsUnauthorizedAndMissingResourcesOverHttp() throws Exception {
        assertThat(send("PUT", formPath(), null, TWO_QUESTIONS).statusCode()).isEqualTo(401);
        assertThat(send("PUT", formPath(), fanToken, TWO_QUESTIONS).statusCode()).isEqualTo(403);
        assertThat(send("GET", applicationsPath(), fanToken, null).statusCode()).isEqualTo(403);
        assertThat(send("GET", applicationsPath() + "/me", ownerToken, null).statusCode())
                .isEqualTo(403);

        HttpResponse<String> missingForm = send("GET", formPath(), null, null);
        assertThat(missingForm.statusCode()).isEqualTo(404);
        assertThat(JsonPath.<String>read(missingForm.body(), "$.code"))
                .isEqualTo("APPLICATION_FORM_NOT_FOUND");

        HttpResponse<String> missingApplication =
                send("GET", applicationsPath() + "/me", fanToken, null);
        assertThat(missingApplication.statusCode()).isEqualTo(404);
        assertThat(JsonPath.<String>read(missingApplication.body(), "$.code"))
                .isEqualTo("APPLICATION_NOT_FOUND");

        HttpResponse<String> tooLargePage =
                send("GET", applicationsPath() + "?size=101", ownerToken, null);
        assertThat(tooLargePage.statusCode()).isEqualTo(400);
        assertThat(JsonPath.<String>read(tooLargePage.body(), "$.code"))
                .isEqualTo("INVALID_REQUEST");
    }

    /**
     * 지정한 경로로 실제 HTTP 요청을 보낸다.
     *
     * @param method HTTP 메서드
     * @param path 요청 경로
     * @param token Bearer 접근 토큰이며 인증 없이 보낼 때는 null
     * @param body JSON 요청 본문이며 본문이 없으면 null
     * @return HTTP 응답
     * @throws IOException 요청 전송에 실패한 경우
     * @throws InterruptedException 응답 대기가 중단된 경우
     */
    private HttpResponse<String> send(String method, String path, String token, String body)
            throws IOException, InterruptedException {
        HttpRequest.BodyPublisher publisher = body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8);
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json;charset=UTF-8")
                .method(method, publisher);
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        return httpClient.send(builder.build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    /**
     * 응답 본문에서 정수 값을 읽는다.
     *
     * @param response HTTP 응답
     * @param jsonPath 읽을 JSON 경로
     * @return 경로에 담긴 정수 값
     */
    private long readLong(HttpResponse<String> response, String jsonPath) {
        Number value = JsonPath.read(response.body(), jsonPath);
        return value == null ? 0L : value.longValue();
    }

    /**
     * 응모 제출이 가능하도록 팬미팅을 응모 접수 상태로 전환한다.
     *
     * <p>PUBLISHED → APPLICATION_OPEN 전이 API가 아직 없어 저장소로 직접 전환한다.
     */
    private void openApplications() {
        MeetingApplicationSetting setting =
                applicationSettingRepository.findById(meetingId).orElseThrow();
        setting.update(true, LocalDateTime.now().minusHours(1),
                LocalDateTime.now().plusDays(2), LocalDateTime.now().plusDays(3), 10);
        applicationSettingRepository.saveAndFlush(setting);

        FanMeeting meeting = fanMeetingRepository.findById(meetingId).orElseThrow();
        meeting.publish(LocalDateTime.now().minusDays(1));
        meeting.openApplications();
        fanMeetingRepository.saveAndFlush(meeting);
    }

    /**
     * HTTP 검증에 사용할 활성 사용자를 저장한다.
     *
     * <p>응모는 이메일 인증을 마친 계정만 할 수 있으므로 저장 시점에 인증 완료로 만든다.
     */
    private User saveUser(String loginId, String nickname, UserRole role) {
        User user = User.createActive(
                loginId, loginId + "@example.com", "encoded-password",
                nickname, role, PreferredLanguage.KOREAN
        );
        user.verifyEmail(LocalDateTime.now());
        return userRepository.saveAndFlush(user);
    }

    /** 현재 팬미팅의 응모 폼 경로를 반환한다. */
    private String formPath() {
        return "/api/v1/fan-meetings/" + meetingId + "/application-form";
    }

    /** 현재 팬미팅의 응모 경로를 반환한다. */
    private String applicationsPath() {
        return "/api/v1/fan-meetings/" + meetingId + "/applications";
    }
}
