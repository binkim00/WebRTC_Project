package com.ssafy.backend.post.controller;

import com.jayway.jsonpath.JsonPath;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 H2 데이터베이스와 서버 디스크를 사용해 공지 첨부파일 업로드·연결·조회를 검증한다(ATTACH-001).
 *
 * <p>업로드한 파일이 공지에 연결되어 상세 응답과 콘텐츠 조회까지 이어지는지 확인하고,
 * 아직 연결되지 않은 파일의 접근 제한도 함께 검증한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:attachment-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef",
        "app.attachment.storage-root=${java.io.tmpdir}/melly-attachment-it",
        "app.attachment.max-file-size-bytes=1024"
})
@AutoConfigureMockMvc
@Transactional
class AttachmentApiIntegrationTest {

    private static final byte[] PNG_BYTES = {1, 2, 3, 4};

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @Autowired
    private AttachmentRepository attachmentRepository;

    private User manager;
    private User influencer;
    private User fan;
    private FanMeeting meeting;

    /** 각 테스트에서 사용할 운영자·팬과 공지를 작성할 팬미팅을 저장한다. */
    @BeforeEach
    void setUp() {
        manager = saveUser("attach-manager", "첨부매니저", UserRole.MANAGER);
        influencer = saveUser("attach-influencer", "첨부인플루언서", UserRole.INFLUENCER);
        fan = saveUser("attach-fan", "첨부팬", UserRole.FAN);
        meeting = fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, manager, influencer, "첨부 통합 테스트 팬미팅", "설명", null,
                LocalDateTime.now().plusDays(10)
        ));
    }

    /** 업로드한 첨부가 공지에 연결되어 상세 응답과 콘텐츠 조회까지 이어지는지 검증한다. */
    @Test
    void uploadsAttachmentAndLinksItToNotice() throws Exception {
        long attachmentId = uploadAttachment("cover.png", "image/png");

        String created = mockMvc.perform(post("/api/v1/fan-meetings/{id}/notices", meeting.getId())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"첨부 공지","content":"본문",
                                 "attachmentIds":[%d]}
                                """.formatted(attachmentId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long noticeId = ((Number) JsonPath.read(created, "$.data.noticeId")).longValue();

        mockMvc.perform(get("/api/v1/fan-meetings/{id}/notices/{noticeId}",
                        meeting.getId(), noticeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attachments.length()").value(1))
                .andExpect(jsonPath("$.data.attachments[0].attachmentId").value(attachmentId))
                .andExpect(jsonPath("$.data.attachments[0].originalFileName").value("cover.png"))
                .andExpect(jsonPath("$.data.attachments[0].contentType").value("image/png"))
                .andExpect(jsonPath("$.data.attachments[0].fileUrl")
                        .value("/api/v1/attachments/" + attachmentId + "/content"));

        Attachment linked = attachmentRepository.findById(attachmentId).orElseThrow();
        assertThat(linked.getPost().getId()).isEqualTo(noticeId);
        assertThat(linked.getDisplayOrder()).isEqualTo(1);
    }

    /** 공개 공지에 연결된 첨부는 비로그인 조회자도 내려받을 수 있는지 검증한다. */
    @Test
    void servesLinkedAttachmentToAnonymousViewer() throws Exception {
        long attachmentId = uploadAttachment("cover.png", "image/png");
        createNoticeWith(attachmentId);

        mockMvc.perform(get("/api/v1/attachments/{id}/content", attachmentId))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.containsString("cover.png")));
    }

    /** 아직 공지에 연결되지 않은 첨부는 업로더만 볼 수 있는지 검증한다. */
    @Test
    void restrictsUnlinkedAttachmentToUploader() throws Exception {
        long attachmentId = uploadAttachment("cover.png", "image/png");

        mockMvc.perform(get("/api/v1/attachments/{id}/content", attachmentId))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/attachments/{id}/content", attachmentId).with(as(fan)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/attachments/{id}/content", attachmentId).with(as(manager)))
                .andExpect(status().isOk());
    }

    /** 공지 수정에서 목록에 빠진 첨부가 해제되고 새 첨부가 연결되는지 검증한다. */
    @Test
    void replacesAttachmentsOnNoticeUpdate() throws Exception {
        long first = uploadAttachment("first.png", "image/png");
        long second = uploadAttachment("second.png", "image/png");
        long noticeId = createNoticeWith(first);

        mockMvc.perform(patch("/api/v1/fan-meetings/{id}/notices/{noticeId}",
                        meeting.getId(), noticeId)
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"attachmentIds\":[%d]}".formatted(second)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/fan-meetings/{id}/notices/{noticeId}",
                        meeting.getId(), noticeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attachments.length()").value(1))
                .andExpect(jsonPath("$.data.attachments[0].attachmentId").value(second));

        assertThat(attachmentRepository.findById(first).orElseThrow().isDeleted()).isTrue();
    }

    /** 다른 사람이 올린 첨부는 공지에 연결할 수 없는지 검증한다. */
    @Test
    void rejectsAttachmentUploadedByOtherUser() throws Exception {
        long attachmentId = uploadAttachmentAs(fan, "fan.png", "image/png");

        mockMvc.perform(post("/api/v1/fan-meetings/{id}/notices", meeting.getId())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"첨부 공지","content":"본문",
                                 "attachmentIds":[%d]}
                                """.formatted(attachmentId)))
                .andExpect(status().isForbidden());
    }

    /** 허용하지 않는 확장자는 업로드를 거부하는지 검증한다. */
    @Test
    void rejectsUnsupportedExtension() throws Exception {
        mockMvc.perform(multipart("/api/v1/attachments")
                        .file(new MockMultipartFile("file", "malware.exe",
                                "application/octet-stream", PNG_BYTES))
                        .param("attachmentType", "NOTICE")
                        .with(as(manager)))
                .andExpect(status().isBadRequest());
    }

    /** 허용 크기를 넘는 파일은 업로드를 거부하는지 검증한다. */
    @Test
    void rejectsFileLargerThanLimit() throws Exception {
        mockMvc.perform(multipart("/api/v1/attachments")
                        .file(new MockMultipartFile("file", "big.png", "image/png",
                                new byte[2048]))
                        .param("attachmentType", "NOTICE")
                        .with(as(manager)))
                .andExpect(status().isPayloadTooLarge());
    }

    /** 비로그인 사용자는 첨부를 업로드할 수 없는지 검증한다. */
    @Test
    void rejectsAnonymousUpload() throws Exception {
        mockMvc.perform(multipart("/api/v1/attachments")
                        .file(new MockMultipartFile("file", "cover.png", "image/png", PNG_BYTES))
                        .param("attachmentType", "NOTICE"))
                .andExpect(status().isUnauthorized());
    }

    /** 매니저로 첨부를 업로드하고 생성된 식별자를 돌려준다. */
    private long uploadAttachment(String fileName, String contentType) throws Exception {
        return uploadAttachmentAs(manager, fileName, contentType);
    }

    /** 지정한 사용자로 첨부를 업로드하고 생성된 식별자를 돌려준다. */
    private long uploadAttachmentAs(User uploader, String fileName, String contentType)
            throws Exception {
        String uploaded = mockMvc.perform(multipart("/api/v1/attachments")
                        .file(new MockMultipartFile("file", fileName, contentType, PNG_BYTES))
                        .param("attachmentType", "NOTICE")
                        .with(as(uploader)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.fileSize").value(PNG_BYTES.length))
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(uploaded, "$.data.attachmentId")).longValue();
    }

    /** 지정한 첨부를 연결한 팬미팅 공지를 만들고 식별자를 돌려준다. */
    private long createNoticeWith(long attachmentId) throws Exception {
        String created = mockMvc.perform(post("/api/v1/fan-meetings/{id}/notices",
                        meeting.getId())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"첨부 공지","content":"본문",
                                 "attachmentIds":[%d]}
                                """.formatted(attachmentId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(created, "$.data.noticeId")).longValue();
    }

    /** 통합 테스트에 사용할 활성 사용자를 저장한다. */
    private User saveUser(String loginId, String nickname, UserRole role) {
        return userRepository.saveAndFlush(User.createActive(
                loginId, loginId + "@example.com", "encoded-password",
                nickname, role, PreferredLanguage.KOREAN
        ));
    }

    /** 지정한 사용자를 인증 주체로 사용하는 요청 후처리기를 생성한다. */
    private RequestPostProcessor as(User user) {
        AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getRole());
        return authentication(new UsernamePasswordAuthenticationToken(
                principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
        ));
    }
}
