package com.ssafy.backend.auth.support;

import com.ssafy.backend.notification.support.NotificationLanguage;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class EmailVerificationMailContentTest {

    private static final String LINK = "https://melly.example/email-verification?token=raw-token";
    private static final LocalDateTime EXPIRES_AT = LocalDateTime.of(2026, 8, 4, 12, 0);

    /** 한국어 수신자에게 한국어 제목과 본문을 만드는지 검증한다. */
    @Test
    void rendersKoreanContent() {
        EmailVerificationMailContent content = content(NotificationLanguage.KOREAN, "팬");

        assertThat(content.subject()).isEqualTo("[Melly] 이메일 인증을 완료해 주세요");
        assertThat(content.html())
                .contains("팬님, 반가워요!")
                .contains("이메일 인증하기")
                .contains("2026년 8월 4일 오후 12:00");
    }

    /** 영어 수신자에게 영어 제목과 본문을 만드는지 검증한다. */
    @Test
    void rendersEnglishContent() {
        EmailVerificationMailContent content = content(NotificationLanguage.ENGLISH, "Fan");

        assertThat(content.subject()).isEqualTo("[Melly] Please verify your email");
        assertThat(content.html())
                .contains("Welcome, Fan!")
                .contains("Verify my email")
                .contains("Aug 4, 2026, 12:00 PM");
    }

    /** 서비스 브랜드 색과 카드 배경이 인라인 스타일로 들어가는지 검증한다. */
    @Test
    void appliesServiceDesignTokens() {
        String html = content(NotificationLanguage.KOREAN, "팬").html();

        assertThat(html)
                .contains("#c93634")
                .contains("#17181d")
                .contains("#f7f8fa");
    }

    /**
     * 메일 클라이언트가 지우거나 이해하지 못하는 조판을 쓰지 않는지 검증한다.
     *
     * <p>화면 코드에서 자연스럽게 손이 가는 방식들이라, 나중에 본문을 고칠 때 다시 섞여 들어가기 쉽다.
     */
    @Test
    void avoidsUnsupportedEmailStyling() {
        String html = content(NotificationLanguage.KOREAN, "팬").html();

        assertThat(html).doesNotContain("display:flex");
        assertThat(html).doesNotContain("display:grid");
        assertThat(html).doesNotContain("color-mix(");
        // 외부 스타일시트·웹폰트는 차단되거나 무시된다.
        assertThat(html).doesNotContain("<link");
        assertThat(html).doesNotContain("@import");
    }

    /** 닉네임에 든 태그가 HTML로 해석되지 않도록 이스케이프하는지 검증한다. */
    @Test
    void escapesNicknameInHtml() {
        String html = content(NotificationLanguage.KOREAN, "<script>bad</script>").html();

        assertThat(html).doesNotContain("<script>bad</script>");
        assertThat(html).contains("&lt;script&gt;bad&lt;/script&gt;");
    }

    /** 버튼을 누르지 못하는 사용자를 위해 링크 원문도 함께 넣는지 검증한다. */
    @Test
    void includesLinkAsVisibleTextForFallback() {
        String html = content(NotificationLanguage.KOREAN, "팬").html();

        assertThat(html).contains("href=\"" + LINK + "\"");
        assertThat(html).contains("버튼이 눌리지 않으면");
        // 주소를 직접 붙여 넣을 수 있도록 링크가 글자로도 보여야 한다.
        assertThat(html).contains(">" + LINK + "</a>");
    }

    /**
     * 순수 텍스트 본문에도 링크와 만료 안내가 들어가는지 검증한다.
     *
     * <p>HTML을 못 읽는 클라이언트는 이 본문만 보므로 여기에 링크가 빠지면 인증할 방법이 없다.
     */
    @Test
    void rendersPlainTextWithLinkAndExpiry() {
        String text = content(NotificationLanguage.KOREAN, "팬").text();

        assertThat(text)
                .contains(LINK)
                .contains("2026년 8월 4일 오후 12:00")
                .contains("본인이 요청하지 않았다면");
        // 텍스트 본문에 태그가 섞이면 그대로 글자로 보인다.
        assertThat(text).doesNotContain("<");
    }

    /**
     * 지정 언어와 닉네임으로 본문 생성기를 만든다.
     *
     * @param language 본문을 만들 언어
     * @param nickname 인사말에 넣을 닉네임
     * @return 본문 생성기
     */
    private EmailVerificationMailContent content(NotificationLanguage language, String nickname) {
        return EmailVerificationMailContent.of(language, nickname, LINK, EXPIRES_AT);
    }
}
