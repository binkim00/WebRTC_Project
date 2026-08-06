package com.ssafy.backend.auth.support;

import com.ssafy.backend.notification.support.NotificationLanguage;
import org.springframework.web.util.HtmlUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * 이메일 인증 안내 메일의 제목과 본문을 서비스 디자인에 맞춰 만든다.
 *
 * <p>같은 내용을 HTML과 순수 텍스트 두 벌로 낸다. HTML을 못 읽는 클라이언트와 미리보기 줄에는
 * 텍스트가 쓰이므로, 링크와 만료 시각은 양쪽에 모두 들어가야 한다.
 *
 * <p>메일 클라이언트는 브라우저만큼 CSS를 지원하지 않는다. 그래서 화면 코드와 달리
 * <ul>
 *   <li>레이아웃을 {@code table}로 짜고 flex·grid를 쓰지 않는다,</li>
 *   <li>모든 스타일을 인라인 {@code style}로 적는다(외부·헤드 스타일시트는 지워지는 곳이 있다),</li>
 *   <li>웹폰트를 불러오지 않고 기기에 있는 글꼴로 대체되게 둔다,</li>
 *   <li>{@code color-mix()} 같은 최신 CSS 함수 대신 계산된 고정 색을 적는다.</li>
 * </ul>
 * 색과 글꼴은 프론트 디자인 토큰(frontend/src/styles/tokens.css, index.css)의 값을 그대로 옮겼다.
 *
 * <p>언어 판단은 알림과 같은 규칙을 쓰려고 {@link NotificationLanguage}를 재사용한다. 같은 회원이
 * 알림은 영어로, 메일은 한국어로 받는 일이 없어야 하므로 폴백 규칙을 두 벌 두지 않는다.
 */
public final class EmailVerificationMailContent {

    /** 브랜드 코랄이다. (--color-primary-coral) */
    private static final String COLOR_BRAND = "#c93634";

    /** 버튼 아래 그림자로 쓰는 진한 코랄이다. (--color-primary-coral-hover) */
    private static final String COLOR_BRAND_DARK = "#b32f2d";

    /** 제목 글자색이다. (--color-text-primary) */
    private static final String COLOR_TEXT = "#17181d";

    /** 본문 글자색이다. (--color-text-body) */
    private static final String COLOR_BODY = "#42444c";

    /** 부가 설명 글자색이다. (--color-text-muted) */
    private static final String COLOR_MUTED = "#666973";

    /** 메일 바깥 배경이다. (--color-surface-subtle) */
    private static final String COLOR_PAGE = "#f7f8fa";

    /** 카드 배경이다. (--color-surface-panel) */
    private static final String COLOR_CARD = "#ffffff";

    /** 구분선 색이다. (--color-surface-muted) */
    private static final String COLOR_DIVIDER = "#e9eaee";

    /** 본문 글꼴이다. 웹폰트를 불러오지 않고 기기에 있는 글꼴로 대체되게 둔다. */
    private static final String FONT_FAMILY =
            "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', "
                    + "Helvetica, Arial, sans-serif";

    private final NotificationLanguage language;
    private final String nickname;
    private final String verificationLink;
    private final LocalDateTime expiresAt;

    /**
     * 메일 한 통에 들어갈 값을 묶는다.
     *
     * @param language 본문을 만들 언어
     * @param nickname 인사말에 넣을 닉네임
     * @param verificationLink 인증 완료 화면으로 이어지는 링크
     * @param expiresAt 링크 만료 시각
     */
    private EmailVerificationMailContent(
            NotificationLanguage language,
            String nickname,
            String verificationLink,
            LocalDateTime expiresAt
    ) {
        this.language = language;
        this.nickname = nickname;
        this.verificationLink = verificationLink;
        this.expiresAt = expiresAt;
    }

    /**
     * 수신자 정보로 메일 본문 생성기를 만든다.
     *
     * @param language 본문을 만들 언어
     * @param nickname 인사말에 넣을 닉네임
     * @param verificationLink 인증 완료 화면으로 이어지는 링크
     * @param expiresAt 링크 만료 시각
     * @return 제목·HTML·텍스트를 낼 수 있는 본문 생성기
     */
    public static EmailVerificationMailContent of(
            NotificationLanguage language,
            String nickname,
            String verificationLink,
            LocalDateTime expiresAt
    ) {
        return new EmailVerificationMailContent(language, nickname, verificationLink, expiresAt);
    }

    /**
     * 메일 제목을 만든다.
     *
     * @return 언어에 맞는 메일 제목
     */
    public String subject() {
        return korean()
                ? "[Melly] 이메일 인증을 완료해 주세요"
                : "[Melly] Please verify your email";
    }

    /**
     * HTML 본문을 만든다.
     *
     * <p>닉네임은 회원이 정한 값이므로 그대로 넣으면 태그로 해석될 수 있다. 이스케이프해서
     * 넣는다. 링크는 우리가 만든 값이지만 속성 안에 들어가므로 같은 처리를 한다.
     *
     * @return 인라인 스타일로 조판한 HTML 본문
     */
    public String html() {
        String safeNickname = HtmlUtils.htmlEscape(nickname);
        String safeLink = HtmlUtils.htmlEscape(verificationLink);

        return """
                <!DOCTYPE html>
                <html lang="{lang}">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>{subject}</title>
                </head>
                <body style="margin:0; padding:0; background-color:{colorPage};">
                  <!-- 미리보기 줄에만 보이고 본문에는 보이지 않는 요약이다. -->
                  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
                    {preheader}
                  </div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                         width="100%" style="background-color:{colorPage}; padding:32px 12px;">
                    <tr>
                      <td align="center">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                               width="100%" style="max-width:520px; background-color:{colorCard};
                               border-radius:16px; overflow:hidden;">
                          <tr>
                            <td style="padding:36px 36px 0 36px; font-family:{font};">
                              <span style="display:inline-block; font-size:26px; font-weight:800;
                                    letter-spacing:-0.04em; color:{colorBrand};">Melly</span>
                              <div style="width:34px; height:3px; margin-top:8px;
                                   background-color:{colorBrand}; border-radius:2px;"></div>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:26px 36px 0 36px; font-family:{font};">
                              <h1 style="margin:0; font-size:21px; line-height:1.4; font-weight:800;
                                  letter-spacing:-0.03em; color:{colorText};">{greeting}</h1>
                              <p style="margin:12px 0 0 0; font-size:15px; line-height:1.7;
                                 color:{colorBody};">{lead}</p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:26px 36px 0 36px;" align="center">
                              <!-- 버튼은 a 태그에 배경을 직접 준다. 일부 클라이언트가 button을 지운다. -->
                              <a href="{link}" style="display:inline-block; width:100%;
                                 max-width:320px; padding:15px 24px; box-sizing:border-box;
                                 background-color:{colorBrand}; border-bottom:2px solid {colorBrandDark};
                                 border-radius:10px; font-family:{font}; font-size:16px;
                                 font-weight:700; letter-spacing:-0.02em; color:#ffffff;
                                 text-decoration:none; text-align:center;">{buttonLabel}</a>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:22px 36px 0 36px; font-family:{font};">
                              <p style="margin:0; font-size:13px; line-height:1.7; color:{colorMuted};">
                                {expiryNotice}
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:20px 36px 0 36px; font-family:{font};">
                              <div style="padding:14px 16px; background-color:{colorPage};
                                   border-radius:10px;">
                                <p style="margin:0; font-size:12px; font-weight:700;
                                   color:{colorMuted};">{fallbackLabel}</p>
                                <p style="margin:6px 0 0 0; font-size:12px; line-height:1.6;
                                   word-break:break-all;">
                                  <a href="{link}" style="color:{colorBrand};
                                     text-decoration:underline;">{linkText}</a>
                                </p>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:24px 36px 32px 36px; font-family:{font};">
                              <div style="border-top:1px solid {colorDivider}; padding-top:16px;">
                                <p style="margin:0; font-size:12px; line-height:1.7;
                                   color:{colorMuted};">{ignoreNotice}</p>
                                <p style="margin:10px 0 0 0; font-size:12px; color:{colorMuted};">
                                  {signature}
                                </p>
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """
                .replace("{lang}", korean() ? "ko" : "en")
                .replace("{subject}", subject())
                .replace("{preheader}", preheader())
                .replace("{greeting}", greeting(safeNickname))
                .replace("{lead}", lead())
                .replace("{buttonLabel}", buttonLabel())
                .replace("{expiryNotice}", expiryNotice())
                .replace("{fallbackLabel}", fallbackLabel())
                .replace("{ignoreNotice}", ignoreNotice())
                .replace("{signature}", signature())
                .replace("{linkText}", safeLink)
                .replace("{link}", safeLink)
                .replace("{font}", FONT_FAMILY)
                .replace("{colorBrandDark}", COLOR_BRAND_DARK)
                .replace("{colorBrand}", COLOR_BRAND)
                .replace("{colorText}", COLOR_TEXT)
                .replace("{colorBody}", COLOR_BODY)
                .replace("{colorMuted}", COLOR_MUTED)
                .replace("{colorPage}", COLOR_PAGE)
                .replace("{colorCard}", COLOR_CARD)
                .replace("{colorDivider}", COLOR_DIVIDER);
    }

    /**
     * 순수 텍스트 본문을 만든다.
     *
     * <p>HTML을 못 읽는 클라이언트가 쓰는 대체 본문이다. 이스케이프하지 않은 원문을 넣는다.
     *
     * @return 링크와 만료 시각을 담은 텍스트 본문
     */
    public String text() {
        return """
                {greeting}

                {lead}

                {link}

                {expiryNotice}
                {ignoreNotice}

                {signature}
                """
                .replace("{greeting}", greeting(nickname))
                .replace("{lead}", lead())
                .replace("{link}", verificationLink)
                .replace("{expiryNotice}", expiryNotice())
                .replace("{ignoreNotice}", ignoreNotice())
                .replace("{signature}", signature());
    }

    /** 받은 편지함 미리보기 줄에 보일 한 문장을 만든다. */
    private String preheader() {
        return korean()
                ? "인증을 마치면 팬미팅 응모를 진행할 수 있습니다."
                : "Finish verifying to apply for fan meetings.";
    }

    /**
     * 인사말을 만든다.
     *
     * @param displayNickname 이미 필요한 처리를 마친 닉네임
     * @return 언어에 맞는 인사말
     */
    private String greeting(String displayNickname) {
        return korean()
                ? displayNickname + "님, 반가워요!"
                : "Welcome, " + displayNickname + "!";
    }

    /** 무엇을 하면 되는지 알려 주는 문장을 만든다. */
    private String lead() {
        return korean()
                ? "아래 버튼을 누르면 이메일 인증이 완료되고 팬미팅 응모를 진행할 수 있습니다."
                : "Tap the button below to verify your email and start applying for fan meetings.";
    }

    /** 버튼에 넣을 문구를 만든다. */
    private String buttonLabel() {
        return korean() ? "이메일 인증하기" : "Verify my email";
    }

    /** 만료 시각 안내 문장을 만든다. */
    private String expiryNotice() {
        return korean()
                ? "이 링크는 " + formattedExpiresAt() + "까지만 사용할 수 있습니다."
                : "This link works until " + formattedExpiresAt() + ".";
    }

    /** 버튼이 눌리지 않을 때 쓰라고 안내하는 문구를 만든다. */
    private String fallbackLabel() {
        return korean()
                ? "버튼이 눌리지 않으면 아래 주소를 붙여 넣어 주세요."
                : "If the button does not work, paste this address instead.";
    }

    /** 본인이 요청하지 않은 경우를 안내하는 문장을 만든다. */
    private String ignoreNotice() {
        return korean()
                ? "본인이 요청하지 않았다면 이 메일을 무시해 주세요."
                : "If you did not request this, you can ignore this email.";
    }

    /** 발신자를 밝히는 마지막 줄을 만든다. */
    private String signature() {
        return korean()
                ? "Melly — 팬과 인플루언서의 1:1 영상통화 팬미팅"
                : "Melly — one-on-one video call fan meetings";
    }

    /**
     * 만료 시각을 언어에 맞는 읽기 쉬운 형식으로 바꾼다.
     *
     * <p>{@link LocalDateTime#toString()}은 {@code 2026-08-04T12:00}처럼 나와 안내문에 어울리지 않는다.
     *
     * @return 한국어면 {@code 2026년 8월 4일 오후 12:00}, 영어면 {@code Aug 4, 2026, 12:00 PM} 형식
     */
    private String formattedExpiresAt() {
        DateTimeFormatter formatter = korean()
                ? DateTimeFormatter.ofPattern("yyyy년 M월 d일 a h:mm", Locale.KOREAN)
                : DateTimeFormatter.ofPattern("MMM d, yyyy, h:mm a", Locale.ENGLISH);
        return formatter.format(expiresAt);
    }

    /** 한국어 본문을 만들 차례인지 알려 준다. */
    private boolean korean() {
        return language != NotificationLanguage.ENGLISH;
    }
}
