package com.ssafy.backend.meeting;

import com.jayway.jsonpath.JsonPath;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
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
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * 실제 TCP 소켓과 JWT 인증을 거치는 HTTP 요청으로 팬미팅 상태 전이와 통계 API를 검증한다.
 *
 * <p>생성 → 공개 → 목록 노출 → 통계 조회 → 취소, 그리고 초안 삭제 후 재조회까지 한 흐름으로
 * 확인하고 저장 값은 저장소로 다시 읽어 검증한다. Redis에 의존하는 토큰 세션 저장소는
 * 대역으로 대체한다.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.docker.compose.enabled=false",
                "spring.datasource.url=jdbc:h2:mem:meeting-http;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class FanMeetingApiHttpVerificationTest {

    private static final AtomicInteger SEQUENCE = new AtomicInteger();

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    private HttpClient httpClient;
    private User owner;
    private User otherOwner;
    private User fan;
    private String ownerToken;
    private String otherOwnerToken;
    private String fanToken;
    private String title;

    /** 각 테스트가 쓸 HTTP 클라이언트와 1인 인플루언서·팬 계정, 접근 토큰을 준비한다. */
    @BeforeEach
    void setUp() {
        when(revokedAccessTokenStore.isRevoked(anyString())).thenReturn(false);
        when(tokenSessionStore.isCurrentAccessToken(anyLong(), anyString())).thenReturn(true);
        httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

        int sequence = SEQUENCE.incrementAndGet();
        title = "HTTP 상태 전이 팬미팅 " + sequence;
        owner = saveUser("meet-owner-" + sequence, "HTTP진행자" + sequence,
                UserRole.SOLO_INFLUENCER);
        otherOwner = saveUser("meet-other-" + sequence, "HTTP타인" + sequence,
                UserRole.SOLO_INFLUENCER);
        fan = saveUser("meet-fan-" + sequence, "HTTP팬" + sequence, UserRole.FAN);
        ownerToken = jwtTokenProvider.issue(owner).accessToken();
        otherOwnerToken = jwtTokenProvider.issue(otherOwner).accessToken();
        fanToken = jwtTokenProvider.issue(fan).accessToken();
    }

    /** 생성·공개 후 공개 목록과 내 팬미팅 목록 노출, 통계 조회, 취소 저장을 실제 HTTP로 검증한다. */
    @Test
    void verifiesPublishStatisticsAndCancelOverHttp() throws Exception {
        long meetingId = createDraftMeeting();
        assertThat(storedMeeting(meetingId).getStatus()).isEqualTo(FanMeetingStatus.DRAFT);

        HttpResponse<String> beforePublish = send("GET", "/api/v1/fan-meetings?keyword="
                + encode(title), null, null);
        assertThat(beforePublish.statusCode()).isEqualTo(200);
        assertThat(readLong(beforePublish, "$.data.totalElements")).isZero();

        HttpResponse<String> published =
                send("POST", "/api/v1/fan-meetings/" + meetingId + "/publish", ownerToken, null);
        assertThat(published.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<String>read(published.body(), "$.data.status")).isEqualTo("PUBLISHED");
        assertThat(JsonPath.<String>read(published.body(), "$.data.publishedAt")).isNotBlank();
        assertThat(storedMeeting(meetingId).getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
        assertThat(storedMeeting(meetingId).getPublishedAt()).isNotNull();

        HttpResponse<String> publicList = send("GET", "/api/v1/fan-meetings?keyword="
                + encode(title), null, null);
        assertThat(readLong(publicList, "$.data.totalElements")).isEqualTo(1L);
        assertThat(readLong(publicList, "$.data.content[0].meetingId")).isEqualTo(meetingId);
        assertThat(JsonPath.<String>read(publicList.body(), "$.data.content[0].status"))
                .isEqualTo("PUBLISHED");

        HttpResponse<String> myMeetings =
                send("GET", "/api/v1/users/me/fan-meetings", ownerToken, null);
        assertThat(myMeetings.statusCode()).isEqualTo(200);
        assertThat(readLong(myMeetings, "$.data.totalElements")).isEqualTo(1L);
        assertThat(readLong(myMeetings, "$.data.content[0].meetingId")).isEqualTo(meetingId);

        HttpResponse<String> statistics =
                send("GET", "/api/v1/fan-meetings/" + meetingId + "/statistics", ownerToken, null);
        assertThat(statistics.statusCode()).isEqualTo(200);
        assertThat(readLong(statistics, "$.data.applicationCount")).isZero();
        assertThat(readLong(statistics, "$.data.selectedCount")).isZero();
        assertThat(readLong(statistics, "$.data.participantCount")).isZero();
        assertThat(readLong(statistics, "$.data.completedCallCount")).isZero();
        assertThat(readLong(statistics, "$.data.noShowCount")).isZero();
        assertThat(readLong(statistics, "$.data.failedCallCount")).isZero();
        assertThat(readLong(statistics, "$.data.averageCallDurationSec")).isZero();
        assertThat(readLong(statistics, "$.data.totalMeetingDurationSec")).isZero();

        HttpResponse<String> canceled =
                send("POST", "/api/v1/fan-meetings/" + meetingId + "/cancel", ownerToken, null);
        assertThat(canceled.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<String>read(canceled.body(), "$.data.status")).isEqualTo("CANCELED");
        FanMeeting stored = storedMeeting(meetingId);
        assertThat(stored.getStatus()).isEqualTo(FanMeetingStatus.CANCELED);
        assertThat(stored.getCanceledAt()).isNotNull();

        HttpResponse<String> afterCancel = send("GET", "/api/v1/fan-meetings?keyword="
                + encode(title), null, null);
        assertThat(readLong(afterCancel, "$.data.totalElements")).isZero();
    }

    /** 초안 삭제 후 삭제 시각 저장과 상세·목록에서 숨겨지는지 실제 HTTP로 검증한다. */
    @Test
    void verifiesDraftDeletionOverHttp() throws Exception {
        long meetingId = createDraftMeeting();

        HttpResponse<String> detail = send("GET", "/api/v1/fan-meetings/" + meetingId,
                ownerToken, null);
        assertThat(detail.statusCode()).isEqualTo(200);

        HttpResponse<String> deleted =
                send("DELETE", "/api/v1/fan-meetings/" + meetingId, ownerToken, null);
        assertThat(deleted.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<String>read(deleted.body(), "$.data.deletedAt")).isNotBlank();
        assertThat(storedMeeting(meetingId).getDeletedAt()).isNotNull();

        HttpResponse<String> afterDelete = send("GET", "/api/v1/fan-meetings/" + meetingId,
                ownerToken, null);
        assertThat(afterDelete.statusCode()).isEqualTo(404);
        assertThat(JsonPath.<String>read(afterDelete.body(), "$.code"))
                .isEqualTo("FAN_MEETING_NOT_FOUND");

        HttpResponse<String> myMeetings =
                send("GET", "/api/v1/users/me/fan-meetings", ownerToken, null);
        assertThat(readLong(myMeetings, "$.data.totalElements")).isZero();

        HttpResponse<String> statistics =
                send("GET", "/api/v1/fan-meetings/" + meetingId + "/statistics", ownerToken, null);
        assertThat(statistics.statusCode()).isEqualTo(404);
        assertThat(JsonPath.<String>read(statistics.body(), "$.code"))
                .isEqualTo("FAN_MEETING_NOT_FOUND");
    }

    /** 인증·권한·상태·존재 여부가 잘못된 요청의 상태 코드를 실제 HTTP로 검증한다. */
    @Test
    void rejectsUnauthorizedAndConflictingRequestsOverHttp() throws Exception {
        long meetingId = createDraftMeeting();
        String publishPath = "/api/v1/fan-meetings/" + meetingId + "/publish";
        String cancelPath = "/api/v1/fan-meetings/" + meetingId + "/cancel";
        String statisticsPath = "/api/v1/fan-meetings/" + meetingId + "/statistics";

        assertThat(send("POST", publishPath, null, null).statusCode()).isEqualTo(401);
        assertThat(send("GET", statisticsPath, null, null).statusCode()).isEqualTo(401);
        assertThat(send("GET", "/api/v1/users/me/fan-meetings", null, null).statusCode())
                .isEqualTo(401);

        assertThat(send("GET", statisticsPath, fanToken, null).statusCode()).isEqualTo(403);
        assertThat(send("GET", "/api/v1/users/me/fan-meetings", fanToken, null).statusCode())
                .isEqualTo(403);

        HttpResponse<String> otherOwnerPublish = send("POST", publishPath, otherOwnerToken, null);
        assertThat(otherOwnerPublish.statusCode()).isEqualTo(403);
        assertThat(JsonPath.<String>read(otherOwnerPublish.body(), "$.code"))
                .isEqualTo("ACCESS_DENIED");

        HttpResponse<String> cancelBeforePublish = send("POST", cancelPath, ownerToken, null);
        assertThat(cancelBeforePublish.statusCode()).isEqualTo(409);
        assertThat(JsonPath.<String>read(cancelBeforePublish.body(), "$.code"))
                .isEqualTo("FAN_MEETING_STATE_CONFLICT");

        assertThat(send("POST", publishPath, ownerToken, null).statusCode()).isEqualTo(200);
        HttpResponse<String> republish = send("POST", publishPath, ownerToken, null);
        assertThat(republish.statusCode()).isEqualTo(409);
        assertThat(JsonPath.<String>read(republish.body(), "$.code"))
                .isEqualTo("FAN_MEETING_STATE_CONFLICT");

        HttpResponse<String> deletePublished =
                send("DELETE", "/api/v1/fan-meetings/" + meetingId, ownerToken, null);
        assertThat(deletePublished.statusCode()).isEqualTo(409);
        assertThat(JsonPath.<String>read(deletePublished.body(), "$.code"))
                .isEqualTo("FAN_MEETING_STATE_CONFLICT");

        HttpResponse<String> missingStatistics =
                send("GET", "/api/v1/fan-meetings/999999/statistics", ownerToken, null);
        assertThat(missingStatistics.statusCode()).isEqualTo(404);
        assertThat(JsonPath.<String>read(missingStatistics.body(), "$.code"))
                .isEqualTo("FAN_MEETING_NOT_FOUND");

        HttpResponse<String> missingPublish =
                send("POST", "/api/v1/fan-meetings/999999/publish", ownerToken, null);
        assertThat(missingPublish.statusCode()).isEqualTo(404);
        assertThat(JsonPath.<String>read(missingPublish.body(), "$.code"))
                .isEqualTo("FAN_MEETING_NOT_FOUND");

        HttpResponse<String> tooLargePage =
                send("GET", "/api/v1/users/me/fan-meetings?size=101", ownerToken, null);
        assertThat(tooLargePage.statusCode()).isEqualTo(400);
        assertThat(JsonPath.<String>read(tooLargePage.body(), "$.code"))
                .isEqualTo("INVALID_REQUEST");
    }

    /**
     * 팬미팅 생성 API로 초안 팬미팅을 만든다.
     *
     * @return 생성된 팬미팅 식별자
     * @throws IOException 요청 전송에 실패한 경우
     * @throws InterruptedException 응답 대기가 중단된 경우
     */
    private long createDraftMeeting() throws IOException, InterruptedException {
        LocalDateTime base = LocalDateTime.now().plusDays(10);
        String body = """
                {"influencerId":%d,
                 "title":"%s",
                 "description":"실제 HTTP 검증용 팬미팅",
                 "coverImageUrl":"https://cdn.melly.test/cover.png",
                 "scheduledStartAt":"%s",
                 "application":{"enabled":true,"startAt":"%s","endAt":"%s",
                                "resultAnnouncementAt":"%s","capacity":10},
                 "operation":{"queueOpenAt":"%s","callDurationSec":120,
                              "recordingEnabled":false,"translationEnabled":true}}
                """.formatted(owner.getId(), title, base,
                base.minusDays(5), base.minusDays(3), base.minusDays(2), base.minusHours(1));

        HttpResponse<String> created = send("POST", "/api/v1/fan-meetings", ownerToken, body);
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(JsonPath.<String>read(created.body(), "$.status")).isEqualTo("DRAFT");
        Number meetingId = JsonPath.read(created.body(), "$.meetingId");
        return meetingId.longValue();
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

    /** 저장된 팬미팅을 식별자로 다시 읽는다. */
    private FanMeeting storedMeeting(long meetingId) {
        return fanMeetingRepository.findById(meetingId).orElseThrow();
    }

    /** 검색어를 쿼리 문자열에 넣을 수 있도록 인코딩한다. */
    private String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    /** HTTP 검증에 사용할 활성 사용자를 저장한다. */
    private User saveUser(String loginId, String nickname, UserRole role) {
        return userRepository.saveAndFlush(User.createActive(
                loginId, loginId + "@example.com", "encoded-password",
                nickname, role, PreferredLanguage.KOREAN
        ));
    }
}
