package com.ssafy.backend.recording.controller;

import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.recording.domain.RecordingStatus;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.recording.service.RecordingExpirationService;
import com.ssafy.backend.recording.storage.RecordingFileStorage;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 DB(H2)와 실제 디스크, 실제 발급 JWT로 녹화 API 전 구간을 통합 검증한다.
 *
 * <p>저장 경로는 테스트 전용 임시 디렉터리를 사용해 운영 경로와 다른 사람의 파일을 건드리지 않는다.
 * Redis에 의존하는 토큰 폐기·세션 저장소만 대체하고 Security 필터부터 파일 저장까지 실제 빈을 쓴다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:recording-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef",
        "app.recording.storage-root=${java.io.tmpdir}/melly-recording-it",
        "app.recording.retention-days=7",
        "app.recording.download-token-ttl-seconds=600",
        // 스케줄러가 테스트 중 임의로 돌지 않도록 주기를 길게 둔다.
        "app.recording.expiration-check-delay-ms=3600000",
        "app.recording.max-file-size-bytes=2048"
})
@AutoConfigureMockMvc
class RecordingApiIntegrationTest {

    private static final String WEBM_MIME = "video/webm";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ParticipantRepository participantRepository;

    @Autowired
    private QueueEntryRepository queueEntryRepository;

    @Autowired
    private CallSessionRepository callSessionRepository;

    @Autowired
    private RecordingRepository recordingRepository;

    @Autowired
    private RecordingFileStorage fileStorage;

    @Autowired
    private RecordingExpirationService expirationService;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /**
     * 인증 필터를 통과하도록 Redis 기반 저장소 응답을 고정하고 앞선 테스트의 녹화를 정리한다.
     *
     * <p>이 테스트는 파일 저장과 만료 처리가 각자 트랜잭션을 커밋해야 하므로 클래스 단위
     * 롤백을 쓰지 않는다. 그래서 녹화 건수를 단정하는 테스트가 서로 간섭하지 않도록
     * 이 테스트 전용 H2 스키마의 녹화 행만 지우고 시작한다.
     */
    @BeforeEach
    void prepareEachTest() {
        when(revokedAccessTokenStore.isRevoked(anyString())).thenReturn(false);
        when(tokenSessionStore.isCurrentAccessToken(anyLong(), anyString())).thenReturn(true);
        recordingRepository.findAll()
                .forEach(recording -> fileStorage.delete(recording.getStorageKey()));
        recordingRepository.deleteAll();
    }

    /** 업로드한 녹화가 디스크와 DB에 저장되고 상세·목록에 나타나는지 검증한다. */
    @Test
    void uploadsRecordingAndStoresFileOnDiskWithMetadata() throws Exception {
        Fixture fixture = fixture("upload-a");
        byte[] payload = "녹화 데이터입니다".getBytes(StandardCharsets.UTF_8);

        MvcResult uploaded = mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(webmFile(payload))
                        .param("durationSec", "42")
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.callSessionId").value(fixture.callSessionId()))
                .andExpect(jsonPath("$.data.contentType").value(WEBM_MIME))
                .andExpect(jsonPath("$.data.fileSizeBytes").value(payload.length))
                .andExpect(jsonPath("$.data.status").value("AVAILABLE"))
                .andExpect(jsonPath("$.data.completedAt").exists())
                .andExpect(jsonPath("$.data.availableUntil").exists())
                .andReturn();
        long recordingId = recordingIdOf(uploaded);

        Recording saved = recordingRepository.findById(recordingId).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(RecordingStatus.AVAILABLE);
        assertThat(saved.getFileSizeBytes()).isEqualTo(payload.length);
        assertThat(saved.getDurationSec()).isEqualTo(42);
        assertThat(saved.getAvailableUntil())
                .isEqualTo(saved.getCompletedAt().plusDays(7));
        // 저장 키에 원본 파일명이 들어가지 않고 UUID 기반 경로를 쓴다.
        assertThat(saved.getStorageKey()).doesNotContain("call").endsWith(".webm");

        Path stored = fileStorage.resolve(saved.getStorageKey());
        assertThat(Files.isRegularFile(stored)).isTrue();
        assertThat(Files.readAllBytes(stored)).isEqualTo(payload);

        mockMvc.perform(get(detailPath(recordingId))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.recordingId").value(recordingId))
                .andExpect(jsonPath("$.data.meetingId").value(fixture.meetingId()))
                .andExpect(jsonPath("$.data.playable").value(true));

        mockMvc.perform(get("/api/v1/users/me/recordings")
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].recordingId").value(recordingId))
                .andExpect(jsonPath("$.data.content[0].meetingId").value(fixture.meetingId()))
                .andExpect(jsonPath("$.data.content[0].playable").value(true));
    }

    /** 통화 참여 팬이 시작 전에 녹화에 동의하면 최초 동의 시각이 저장되는지 검증한다. */
    @Test
    void recordsParticipantConsentBeforeCallStarts() throws Exception {
        Fixture fixture = fixture("consent");

        mockMvc.perform(post(consentPath(fixture.callSessionId()))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.callSessionId").value(fixture.callSessionId()))
                .andExpect(jsonPath("$.data.consentedAt").exists());

        CallSession callSession = callSessionRepository
                .findAccessContextById(fixture.callSessionId()).orElseThrow();
        assertThat(callSession.getQueueEntry().getParticipant().getRecordingConsentAt())
                .isNotNull();
    }

    /** MP4 업로드가 허용되는지 검증한다. */
    @Test
    void uploadsMp4Recording() throws Exception {
        Fixture fixture = fixture("upload-mp4");

        mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(new MockMultipartFile("file", "call.mp4", "video/mp4",
                                "mp4 데이터".getBytes(StandardCharsets.UTF_8)))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.contentType").value("video/mp4"));
    }

    /** 허용하지 않는 확장자와 MIME 타입이 차단되고 파일이 남지 않는지 검증한다. */
    @Test
    void rejectsDisallowedFormats() throws Exception {
        Fixture fixture = fixture("format");

        mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(new MockMultipartFile("file", "call.mov", "video/quicktime",
                                "데이터".getBytes(StandardCharsets.UTF_8)))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RECORDING_FORMAT_NOT_ALLOWED"));

        // 확장자만 허용 형식으로 바꾼 파일도 막는다.
        mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(new MockMultipartFile("file", "call.webm", "video/quicktime",
                                "데이터".getBytes(StandardCharsets.UTF_8)))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RECORDING_FORMAT_NOT_ALLOWED"));

        assertThat(recordingRepository.count()).isZero();
    }

    /** 최대 크기를 넘는 업로드가 차단되고 파일이 남지 않는지 검증한다. */
    @Test
    void rejectsOversizedUpload() throws Exception {
        Fixture fixture = fixture("size");
        // 테스트 설정의 최대 크기는 2048바이트다.
        byte[] tooLarge = new byte[2049];

        mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(webmFile(tooLarge))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().is(413))
                .andExpect(jsonPath("$.code").value("RECORDING_FILE_TOO_LARGE"));

        assertThat(recordingRepository.count()).isZero();
    }

    /** 빈 파일 업로드가 차단되는지 검증한다. */
    @Test
    void rejectsEmptyUpload() throws Exception {
        Fixture fixture = fixture("empty");

        mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(webmFile(new byte[0]))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RECORDING_FILE_REQUIRED"));
    }

    /** 통화당 녹화가 한 건만 허용되는지 검증한다. */
    @Test
    void rejectsSecondUploadForSameCall() throws Exception {
        Fixture fixture = fixture("duplicate");

        mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(webmFile("첫 번째".getBytes(StandardCharsets.UTF_8)))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isCreated());

        mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(webmFile("두 번째".getBytes(StandardCharsets.UTF_8)))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RECORDING_ALREADY_EXISTS"));

        assertThat(recordingRepository.count()).isEqualTo(1);
    }

    /** 통화에 참여하지 않은 팬의 업로드가 거부되는지 검증한다. */
    @Test
    void rejectsUploadByOtherFan() throws Exception {
        Fixture fixture = fixture("other-upload");
        User otherFan = saveUser("outsider-for-upload", UserRole.FAN);

        mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(webmFile("남의 통화".getBytes(StandardCharsets.UTF_8)))
                        .header("Authorization", bearer(otherFan)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        assertThat(recordingRepository.count()).isZero();
    }

    /** 다른 팬이 남의 녹화를 조회·다운로드하지 못하는지 검증한다. */
    @Test
    void rejectsAccessByOtherFan() throws Exception {
        Fixture fixture = fixture("other-access");
        long recordingId = upload(fixture, "내 녹화");
        User otherFan = saveUser("outsider-for-access", UserRole.FAN);

        mockMvc.perform(get(detailPath(recordingId))
                        .header("Authorization", bearer(otherFan)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECORDING_NOT_FOUND"));

        mockMvc.perform(post(downloadUrlPath(recordingId))
                        .header("Authorization", bearer(otherFan)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECORDING_NOT_FOUND"));

        mockMvc.perform(get("/api/v1/users/me/recordings")
                        .header("Authorization", bearer(otherFan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    /** 인증 없이 호출하면 401을 반환하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedRequests() throws Exception {
        Fixture fixture = fixture("unauth");
        long recordingId = upload(fixture, "녹화");

        mockMvc.perform(multipart(uploadPath(fixture.callSessionId())).file(webmFile(new byte[]{1})))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get(detailPath(recordingId)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post(downloadUrlPath(recordingId)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/users/me/recordings"))
                .andExpect(status().isUnauthorized());
    }

    /** 존재하지 않는 통화와 녹화 요청이 404를 반환하는지 검증한다. */
    @Test
    void returnsNotFoundForMissingCallSessionAndRecording() throws Exception {
        Fixture fixture = fixture("missing");
        long missingId = fixture.callSessionId() + 9_999L;

        mockMvc.perform(multipart(uploadPath(missingId))
                        .file(webmFile("데이터".getBytes(StandardCharsets.UTF_8)))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CALL_SESSION_NOT_FOUND"));

        mockMvc.perform(get(detailPath(missingId))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECORDING_NOT_FOUND"));

        mockMvc.perform(post(downloadUrlPath(missingId))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECORDING_NOT_FOUND"));
    }

    /** 발급한 URL로 전체 파일을 받고 Range 요청에 206과 Content-Range로 응답하는지 검증한다. */
    @Test
    void servesFullContentAndRangeRequests() throws Exception {
        Fixture fixture = fixture("range");
        byte[] payload = "0123456789ABCDEFGHIJ".getBytes(StandardCharsets.UTF_8);
        long recordingId = upload(fixture, payload);

        MvcResult issued = mockMvc.perform(post(downloadUrlPath(recordingId))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.recordingId").value(recordingId))
                .andExpect(jsonPath("$.data.expiresInSeconds").value(600))
                .andExpect(jsonPath("$.data.expiresAt").exists())
                .andReturn();
        String url = jsonValue(issued, "downloadUrl");

        mockMvc.perform(get(url))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
                .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, payload.length))
                .andExpect(content().contentTypeCompatibleWith(WEBM_MIME))
                .andExpect(content().bytes(payload));

        mockMvc.perform(get(url).header(HttpHeaders.RANGE, "bytes=0-4"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE,
                        "bytes 0-4/" + payload.length))
                .andExpect(content().bytes("01234".getBytes(StandardCharsets.UTF_8)));

        mockMvc.perform(get(url).header(HttpHeaders.RANGE, "bytes=10-"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE,
                        "bytes 10-19/" + payload.length))
                .andExpect(content().bytes("ABCDEFGHIJ".getBytes(StandardCharsets.UTF_8)));

        mockMvc.perform(get(url).header(HttpHeaders.RANGE, "bytes=-5"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE,
                        "bytes 15-19/" + payload.length))
                .andExpect(content().bytes("FGHIJ".getBytes(StandardCharsets.UTF_8)));
    }

    /** 파일 크기를 벗어난 Range 요청에 416으로 응답하는지 검증한다. */
    @Test
    void returnsRangeNotSatisfiableForOutOfBoundsRange() throws Exception {
        Fixture fixture = fixture("range-oob");
        byte[] payload = "0123456789".getBytes(StandardCharsets.UTF_8);
        long recordingId = upload(fixture, payload);
        String url = downloadUrl(fixture, recordingId);

        mockMvc.perform(get(url).header(HttpHeaders.RANGE, "bytes=100-200"))
                .andExpect(status().isRequestedRangeNotSatisfiable())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes */" + payload.length));
    }

    /** 다운로드 지정 시 첨부파일 헤더로 내려주는지 검증한다. */
    @Test
    void servesAttachmentWhenDownloadRequested() throws Exception {
        Fixture fixture = fixture("attachment");
        long recordingId = upload(fixture, "데이터");
        String url = downloadUrl(fixture, recordingId);

        mockMvc.perform(get(url))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        org.hamcrest.Matchers.startsWith("inline")));

        mockMvc.perform(get(url + "&download=true"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        org.hamcrest.Matchers.startsWith("attachment")));
    }

    /** 위·변조된 토큰과 다른 녹화의 토큰이 차단되는지 검증한다. */
    @Test
    void rejectsTamperedAndForeignTokens() throws Exception {
        Fixture fixture = fixture("token");
        long recordingId = upload(fixture, "데이터");
        String url = downloadUrl(fixture, recordingId);
        String token = url.substring(url.indexOf("token=") + "token=".length());

        mockMvc.perform(get(contentPath(recordingId) + "?token=" + token + "x"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("RECORDING_DOWNLOAD_TOKEN_INVALID"));

        mockMvc.perform(get(contentPath(recordingId) + "?token=not-a-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("RECORDING_DOWNLOAD_TOKEN_INVALID"));

        // 다른 녹화 경로에 같은 토큰을 붙여도 통하지 않는다.
        mockMvc.perform(get(contentPath(recordingId + 1) + "?token=" + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("RECORDING_DOWNLOAD_TOKEN_INVALID"));
    }

    /** 만료 처리가 파일을 지우고 상태를 EXPIRED로 바꾸며 재실행해도 안전한지 검증한다. */
    @Test
    void expiresOutdatedRecordingAndStaysSafeOnRerun() throws Exception {
        Fixture fixture = fixture("expire");
        long recordingId = upload(fixture, "만료 대상");
        Recording recording = recordingRepository.findById(recordingId).orElseThrow();
        String storageKey = recording.getStorageKey();
        // 보관 기간이 지난 상태로 만든다.
        ReflectionTestUtils.setField(recording, "availableUntil",
                LocalDateTime.now().minusMinutes(1));
        recordingRepository.saveAndFlush(recording);

        assertThat(expirationService.findExpiredRecordingIds(10)).contains(recordingId);
        assertThat(fileStorage.exists(storageKey)).isTrue();

        assertThat(expirationService.expire(recordingId)).isTrue();

        assertThat(fileStorage.exists(storageKey)).isFalse();
        Recording expired = recordingRepository.findById(recordingId).orElseThrow();
        assertThat(expired.getStatus()).isEqualTo(RecordingStatus.EXPIRED);

        // 파일이 이미 없고 상태도 만료지만 다시 실행해도 예외 없이 지나간다.
        assertThat(expirationService.expire(recordingId)).isFalse();
        assertThat(expirationService.findExpiredRecordingIds(10)).doesNotContain(recordingId);
        assertThat(recordingRepository.findById(recordingId).orElseThrow().getStatus())
                .isEqualTo(RecordingStatus.EXPIRED);
    }

    /** 만료된 녹화는 재생·다운로드가 막히고 상세에서 재생 불가로 보이는지 검증한다. */
    @Test
    void blocksPlaybackForExpiredRecording() throws Exception {
        Fixture fixture = fixture("expired-access");
        long recordingId = upload(fixture, "데이터");
        String url = downloadUrl(fixture, recordingId);

        Recording recording = recordingRepository.findById(recordingId).orElseThrow();
        ReflectionTestUtils.setField(recording, "availableUntil",
                LocalDateTime.now().minusMinutes(1));
        recordingRepository.saveAndFlush(recording);
        expirationService.expire(recordingId);

        mockMvc.perform(get(detailPath(recordingId))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("EXPIRED"))
                .andExpect(jsonPath("$.data.playable").value(false));

        mockMvc.perform(post(downloadUrlPath(recordingId))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RECORDING_NOT_AVAILABLE"));

        // 이미 발급된 토큰도 만료된 녹화에는 쓸 수 없다.
        mockMvc.perform(get(url))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RECORDING_NOT_AVAILABLE"));
    }

    /** 파일만 사라진 녹화의 재생 요청이 안전하게 실패하는지 검증한다. */
    @Test
    void reportsNotAvailableWhenFileDisappeared() throws Exception {
        Fixture fixture = fixture("missing-file");
        long recordingId = upload(fixture, "데이터");
        String url = downloadUrl(fixture, recordingId);
        Recording recording = recordingRepository.findById(recordingId).orElseThrow();
        fileStorage.delete(recording.getStorageKey());

        mockMvc.perform(get(url))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RECORDING_NOT_AVAILABLE"));
    }

    /** 목록 페이지 값 경계가 검증되는지 확인한다. */
    @Test
    void validatesMyRecordingPageBoundaries() throws Exception {
        Fixture fixture = fixture("page");

        mockMvc.perform(get("/api/v1/users/me/recordings").param("size", "101")
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get("/api/v1/users/me/recordings").param("page", "-1")
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get("/api/v1/users/me/recordings").param("size", "1")
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(1));
    }

    /** 녹화가 없는 팬이 빈 목록을 받는지 검증한다. */
    @Test
    void returnsEmptyListWhenFanHasNoRecording() throws Exception {
        User fan = saveUser("no-recording-fan", UserRole.FAN);

        mockMvc.perform(get("/api/v1/users/me/recordings")
                        .header("Authorization", bearer(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    /** 통화와 참가자, 팬이 준비된 통합 테스트 픽스처다. */
    private record Fixture(User fan, long meetingId, long callSessionId) {
    }

    /** 업로드 API 경로를 만든다. */
    private String uploadPath(long callSessionId) {
        return "/api/v1/call-sessions/" + callSessionId + "/recordings/upload";
    }

    /** 녹화 동의 API 경로를 만든다. */
    private String consentPath(long callSessionId) {
        return "/api/v1/call-sessions/" + callSessionId + "/recordings/consent";
    }

    /** 녹화 상세 API 경로를 만든다. */
    private String detailPath(long recordingId) {
        return "/api/v1/recordings/" + recordingId;
    }

    /** 다운로드 URL 발급 API 경로를 만든다. */
    private String downloadUrlPath(long recordingId) {
        return "/api/v1/recordings/" + recordingId + "/download-url";
    }

    /** 녹화 스트리밍 API 경로를 만든다. */
    private String contentPath(long recordingId) {
        return "/api/v1/recordings/" + recordingId + "/content";
    }

    /** 실제 발급한 Access Token으로 Authorization 헤더 값을 만든다. */
    private String bearer(User user) {
        return "Bearer " + jwtTokenProvider.issue(user).accessToken();
    }

    /** 업로드에 사용할 WEBM 파트를 만든다. */
    private MockMultipartFile webmFile(byte[] payload) {
        return new MockMultipartFile("file", "call.webm", WEBM_MIME, payload);
    }

    /** 녹화를 업로드하고 식별자를 돌려준다. */
    private long upload(Fixture fixture, String payload) throws Exception {
        return upload(fixture, payload.getBytes(StandardCharsets.UTF_8));
    }

    /** 녹화를 업로드하고 식별자를 돌려준다. */
    private long upload(Fixture fixture, byte[] payload) throws Exception {
        MvcResult result = mockMvc.perform(multipart(uploadPath(fixture.callSessionId()))
                        .file(webmFile(payload))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isCreated())
                .andReturn();
        return recordingIdOf(result);
    }

    /** 다운로드 URL을 발급받아 돌려준다. */
    private String downloadUrl(Fixture fixture, long recordingId) throws Exception {
        MvcResult result = mockMvc.perform(post(downloadUrlPath(recordingId))
                        .header("Authorization", bearer(fixture.fan())))
                .andExpect(status().isOk())
                .andReturn();
        return jsonValue(result, "downloadUrl");
    }

    /** 응답에서 생성된 녹화 식별자를 꺼낸다. */
    private long recordingIdOf(MvcResult result) throws Exception {
        return Long.parseLong(jsonValue(result, "recordingId"));
    }

    /** 응답 본문에서 지정한 문자열·숫자 값을 꺼낸다. */
    private String jsonValue(MvcResult result, String field) throws Exception {
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String marker = "\"" + field + "\":";
        int start = body.indexOf(marker) + marker.length();
        if (body.charAt(start) == '"') {
            int end = body.indexOf('"', start + 1);
            return body.substring(start + 1, end);
        }
        int end = start;
        while (end < body.length() && body.charAt(end) != ',' && body.charAt(end) != '}') {
            end++;
        }
        return body.substring(start, end).trim();
    }

    /** 팬·팬미팅·참가자·대기열·통화 세션을 만들어 업로드 가능한 상태로 준비한다. */
    private Fixture fixture(String prefix) {
        User influencer = saveUser(prefix + "-influencer", UserRole.SOLO_INFLUENCER);
        User fan = saveUser(prefix + "-fan", UserRole.FAN);
        FanMeeting meeting = fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, null, influencer, prefix + " 팬미팅", "설명", null,
                LocalDateTime.of(2026, 8, 1, 19, 0)
        ));
        Application application = Application.submit(
                meeting, fan, LocalDateTime.of(2026, 7, 20, 10, 0));
        application.select(LocalDateTime.of(2026, 7, 21, 10, 0));
        applicationRepository.saveAndFlush(application);
        Participant participant = participantRepository.saveAndFlush(
                Participant.create(meeting, fan, application, 1));
        QueueEntry queueEntry = queueEntryRepository.saveAndFlush(
                QueueEntry.create(meeting, participant));
        CallSession callSession = callSessionRepository.saveAndFlush(
                CallSession.createConnecting(queueEntry, "room-" + prefix, "KOREAN"));
        return new Fixture(fan, meeting.getId(), callSession.getId());
    }

    /** 통합 테스트에 사용할 활성 사용자를 저장한다. */
    private User saveUser(String loginId, UserRole role) {
        return userRepository.saveAndFlush(User.createActive(
                loginId, loginId + "@example.com", "encoded-password",
                loginId + "-닉네임", role, PreferredLanguage.KOREAN
        ));
    }
}
