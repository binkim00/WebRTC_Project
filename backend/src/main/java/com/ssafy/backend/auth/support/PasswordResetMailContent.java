package com.ssafy.backend.auth.support;

import com.ssafy.backend.notification.support.NotificationLanguage;
import org.springframework.web.util.HtmlUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * 비밀번호 재설정 안내 메일의 제목과 본문을 만든다.
 *
 * <p>조판 규칙과 색·글꼴은 {@link EmailVerificationMailContent}와 같다. 두 메일이 서로 다른
 * 디자인으로 보이지 않도록 같은 값을 쓰되, 문구만 재설정 흐름에 맞게 바꾼다.
 *
 * <p>이 메일은 본인이 요청하지 않았을 수도 있는 메일이다. 그래서 "무시하면 비밀번호는 그대로"라는
 * 사실을 반드시 함께 알린다.
 */
public final class PasswordResetMailContent {

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
    private final String resetLink;
    private final LocalDateTime expiresAt;

    /**
     * 메일 한 통에 들어갈 값을 묶는다.
     *
     * @param language 본문을 만들 언어
     * @param nickname 인사말에 넣을 닉네임
     * @param resetLink 새 비밀번호 입력 화면으로 이어지는 링크
     * @param expiresAt 링크 만료 시각
     */
    private PasswordResetMailContent(
            NotificationLanguage language,
            String nickname,
            String resetLink,
            LocalDateTime expiresAt
    ) {
        this.language = language;
        this.nickname = nickname;
        this.resetLink = resetLink;
        this.expiresAt = expiresAt;
    }

    /**
     * 수신자 정보로 메일 본문 생성기를 만든다.
     *
     * @param language 본문을 만들 언어
     * @param nickname 인사말에 넣을 닉네임
     * @param resetLink 새 비밀번호 입력 화면으로 이어지는 링크
     * @param expiresAt 링크 만료 시각
     * @return 제목·HTML·텍스트를 낼 수 있는 본문 생성기
     */
    public static PasswordResetMailContent of(
            NotificationLanguage language,
            String nickname,
            String resetLink,
            LocalDateTime expiresAt
    ) {
        return new PasswordResetMailContent(language, nickname, resetLink, expiresAt);
    }

    /**
     * 메일 제목을 만든다.
     *
     * @return 언어에 맞는 메일 제목
     */
    public String subject() {
        return korean()
                ? "[Melly] 비밀번호를 다시 설정해 주세요"
                : "[Melly] Reset your password";
    }

    /**
     * HTML 본문을 만든다.
     *
     * <p>닉네임은 회원이 정한 값이라 그대로 넣으면 태그로 해석될 수 있어 이스케이프한다.
     * 링크도 속성 안에 들어가므로 같은 처리를 한다.
     *
     * @return 인라인 스타일로 조판한 HTML 본문
     */
    public String html() {
        String safeNickname = HtmlUtils.htmlEscape(nickname);
        String safeLink = HtmlUtils.htmlEscape(resetLink);

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
                .replace("{link}", resetLink)
                .replace("{expiryNotice}", expiryNotice())
                .replace("{ignoreNotice}", ignoreNotice())
                .replace("{signature}", signature());
    }

    /** 받은 편지함 미리보기 줄에 보일 한 문장을 만든다. */
    private String preheader() {
        return korean()
                ? "새 비밀번호를 설정하면 바로 로그인할 수 있습니다."
                : "Set a new password and sign in right away.";
    }

    /**
     * 인사말을 만든다.
     *
     * @param displayNickname 이미 필요한 처리를 마친 닉네임
     * @return 언어에 맞는 인사말
     */
    private String greeting(String displayNickname) {
        return korean()
                ? displayNickname + "님, 비밀번호를 새로 설정해 주세요"
                : "Hi " + displayNickname + ", let's reset your password";
    }

    /** 무엇을 하면 되는지 알려 주는 문장을 만든다. */
    private String lead() {
        return korean()
                ? "아래 버튼을 누르면 새 비밀번호를 입력하는 화면으로 이동합니다."
                : "Tap the button below to open the page where you can set a new password.";
    }

    /** 버튼에 넣을 문구를 만든다. */
    private String buttonLabel() {
        return korean() ? "새 비밀번호 설정하기" : "Set a new password";
    }

    /** 만료 시각 안내 문장을 만든다. */
    private String expiryNotice() {
        return korean()
                ? "이 링크는 " + formattedExpiresAt() + "까지만 사용할 수 있고, 한 번 쓰면 사라집니다."
                : "This link works until " + formattedExpiresAt() + " and can be used only once.";
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
                ? "본인이 요청하지 않았다면 이 메일을 무시해 주세요. 비밀번호는 그대로 유지됩니다."
                : "If you did not request this, ignore this email. Your password stays the same.";
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
     * @return 한국어면 {@code 2026년 8월 7일 오후 12:00}, 영어면 {@code Aug 7, 2026, 12:00 PM} 형식
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
