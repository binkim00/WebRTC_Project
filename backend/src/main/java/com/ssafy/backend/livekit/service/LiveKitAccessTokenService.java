package com.ssafy.backend.livekit.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.config.livekit.LiveKitProperties;
import com.ssafy.backend.livekit.dto.LiveKitAccessTokenResponse;
import com.ssafy.backend.livekit.support.LiveKitRoomNames;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import io.livekit.server.AccessToken;
import io.livekit.server.CanPublish;
import io.livekit.server.CanSubscribe;
import io.livekit.server.RoomJoin;
import io.livekit.server.RoomName;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Date;

/**
 * 실제 팬미팅 통화 세션의 권한을 검증하고 LiveKit 입장 토큰을 발급한다.
 */
@Service
public class LiveKitAccessTokenService {

    private static final Duration ACCESS_TOKEN_TTL = Duration.ofMinutes(15);
    private static final String IDENTITY_ALGORITHM = "HmacSHA256";
    private static final int IDENTITY_HASH_LENGTH = 22;
    private static final String DEFAULT_LANGUAGE_CODE = "ko";

    private final LiveKitProperties properties;
    private final CallSessionRepository callSessionRepository;
    private final CurrentUserService currentUserService;
    private final Clock clock;

    /**
     * LiveKit 설정과 통화·사용자·팬미팅 권한 조회 구성 요소를 주입받는다.
     *
     * @param properties            LiveKit 서버 연결 및 서명 설정
     * @param callSessionRepository 통화 세션 저장소
     * @param currentUserService    현재 로그인 사용자 조회 서비스
     * @param clock                 토큰 만료 시각 계산 기준 시계
     */
    public LiveKitAccessTokenService(
            LiveKitProperties properties,
            CallSessionRepository callSessionRepository,
            CurrentUserService currentUserService,
            Clock clock
    ) {
        this.properties = properties;
        this.callSessionRepository = callSessionRepository;
        this.currentUserService = currentUserService;
        this.clock = clock;
    }

    /**
     * 통화 관계와 현재 상태를 검증한 뒤 역할별 LiveKit 입장 토큰을 발급한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @param principal     JWT 인증 사용자 정보
     * @return 외부에 공개 가능한 LiveKit 연결 정보
     * @throws BusinessException 세션이 없거나 사용자·상태·재접속 검증에 실패한 경우
     */
    @Transactional(readOnly = true)
    public LiveKitAccessTokenResponse issue(Long callSessionId, AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        CallSession callSession = callSessionRepository.findAccessContextById(callSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        QueueEntry queueEntry = callSession.getQueueEntry();
        FanMeeting meeting = queueEntry.getMeeting();
        ParticipantAccessRole accessRole = resolveAccessRole(meeting, queueEntry, user);
        validateSessionState(callSession, queueEntry, accessRole);

        LocalDateTime now = LocalDateTime.now(clock);
        validateReconnectWindow(callSession, accessRole, now);
        LocalDateTime expiresAt = now.plus(ACCESS_TOKEN_TTL);
        String roomName = requireCanonicalRoomName(callSession, meeting.getId());
        String identity = createIdentity(accessRole, meeting.getId(), user.getId());
        AccessToken token = createToken(
                callSession, user, accessRole, roomName, identity, expiresAt);
        return new LiveKitAccessTokenResponse(
                properties.getUrl(),
                token.toJwt(),
                expiresAt,
                callSession.getReconnectAllowedUntil()
        );
    }

    /**
     * 로그인 사용자가 통화에서 수행할 LiveKit 역할을 결정한다.
     *
     * @param meeting    통화가 속한 팬미팅
     * @param queueEntry 통화 대상 대기열 항목
     * @param user       로그인 사용자
     * @return 팬 또는 인플루언서 역할
     * @throws BusinessException 통화 관계 사용자가 아닌 경우
     */
    private ParticipantAccessRole resolveAccessRole(
            FanMeeting meeting, QueueEntry queueEntry, User user
    ) {
        if (user.getRole() == UserRole.FAN
                && sameUser(queueEntry.getParticipant().getFan(), user)) {
            return ParticipantAccessRole.FAN;
        }
        if ((user.getRole() == UserRole.INFLUENCER
                || user.getRole() == UserRole.SOLO_INFLUENCER)
                && sameUser(meeting.getInfluencer(), user)) {
            return ParticipantAccessRole.HOST;
        }
        throw new BusinessException(ErrorCode.LIVEKIT_JOIN_NOT_ALLOWED);
    }

    /**
     * 통화 세션과 팬 대기열 상태가 입장을 허용하는지 검증한다.
     *
     * @param callSession 입장 대상 통화 세션
     * @param queueEntry  통화 대상 대기열 항목
     * @param accessRole  입장 사용자 역할
     * @throws BusinessException 입장할 수 없는 통화 또는 대기열 상태인 경우
     */
    private void validateSessionState(
            CallSession callSession, QueueEntry queueEntry, ParticipantAccessRole accessRole
    ) {
        if (callSession.getStatus() != CallSessionStatus.CONNECTING
                && callSession.getStatus() != CallSessionStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.CALL_SESSION_STATE_CONFLICT);
        }
        if (accessRole == ParticipantAccessRole.FAN
                && queueEntry.getStatus() != QueueEntryStatus.CALLED
                && queueEntry.getStatus() != QueueEntryStatus.IN_CALL) {
            throw new BusinessException(ErrorCode.LIVEKIT_JOIN_NOT_ALLOWED);
        }
    }

    /**
     * 재접속 제한이 시작된 팬의 허용 시간이 지나지 않았는지 검증한다.
     *
     * @param callSession 입장 대상 통화 세션
     * @param accessRole  입장 사용자 역할
     * @param now         현재 시각
     * @throws BusinessException 팬 재접속 허용 시간이 지난 경우
     */
    private void validateReconnectWindow(
            CallSession callSession, ParticipantAccessRole accessRole, LocalDateTime now
    ) {
        if (accessRole == ParticipantAccessRole.FAN
                && callSession.getReconnectAllowedUntil() != null
                && now.isAfter(callSession.getReconnectAllowedUntil())) {
            throw new BusinessException(ErrorCode.LIVEKIT_RECONNECT_EXPIRED);
        }
    }

    /**
     * ERD의 팬미팅당 단일 Room 규칙과 통화 세션의 Room 값이 일치하는지 검증한다.
     *
     * @param callSession 입장 대상 통화 세션
     * @param meetingId   팬미팅 식별자
     * @return 검증된 팬미팅 LiveKit Room 이름
     * @throws BusinessException 통화 세션에 잘못된 Room 값이 저장된 경우
     */
    private String requireCanonicalRoomName(CallSession callSession, Long meetingId) {
        String roomName = LiveKitRoomNames.forMeeting(meetingId);
        if (!roomName.equals(callSession.getRoomId())) {
            throw new BusinessException(ErrorCode.CALL_SESSION_STATE_CONFLICT);
        }
        return roomName;
    }

    /**
     * 사용자 원본 식별자를 노출하지 않는 팬미팅 단위의 안정적인 LiveKit identity를 생성한다.
     *
     * @param accessRole LiveKit 참가 역할
     * @param meetingId  팬미팅 식별자
     * @param userId     사용자 식별자
     * @return 역할 접두어와 HMAC 해시로 구성된 LiveKit identity
     * @throws BusinessException 표준 HMAC 알고리즘을 사용할 수 없는 경우
     */
    private String createIdentity(ParticipantAccessRole accessRole, Long meetingId, Long userId) {
        try {
            Mac mac = Mac.getInstance(IDENTITY_ALGORITHM);
            mac.init(new SecretKeySpec(
                    properties.getApiSecret().getBytes(StandardCharsets.UTF_8),
                    IDENTITY_ALGORITHM
            ));
            byte[] digest = mac.doFinal(
                    (meetingId + ":" + userId).getBytes(StandardCharsets.UTF_8));
            String hash = Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
                    .substring(0, IDENTITY_HASH_LENGTH);
            return accessRole.identityPrefix + "-" + hash;
        } catch (GeneralSecurityException exception) {
            throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
        }
    }

    /**
     * 검증된 역할에 맞는 권한과 attributes를 포함한 LiveKit 토큰 객체를 생성한다.
     *
     * @param callSession 입장 대상 통화 세션
     * @param user        입장 사용자
     * @param accessRole  LiveKit 참가 역할
     * @param roomName    팬미팅 LiveKit Room 이름
     * @param identity    익명화된 LiveKit 참가자 identity
     * @param expiresAt   토큰 만료 시각
     * @return 서명 직전의 LiveKit 입장 토큰
     */
    private AccessToken createToken(
            CallSession callSession,
            User user,
            ParticipantAccessRole accessRole,
            String roomName,
            String identity,
            LocalDateTime expiresAt
    ) {
        AccessToken token = new AccessToken(properties.getApiKey(), properties.getApiSecret());
        token.setIdentity(identity);
        token.setName(user.getNickname());
        token.setExpiration(Date.from(expiresAt.atZone(clock.getZone()).toInstant()));
        token.getAttributes().put("user_id", user.getId().toString());
        token.getAttributes().put("role", accessRole.attributeValue);
        if (accessRole == ParticipantAccessRole.FAN) {
            token.getAttributes().put("call_session_id", callSession.getId().toString());
            token.getAttributes().put("fan_lang", callSession.getFanLanguage());
        } else if (accessRole == ParticipantAccessRole.HOST) {
            token.getAttributes().put(
                    "influencer_lang", toLanguageCode(user.getPreferredLanguage()));
        }
        token.addGrants(
                new RoomJoin(true),
                new RoomName(roomName),
                new CanPublish(true),
                new CanSubscribe(true)
        );
        return token;
    }

    /**
     * 회원 선호 언어를 자막 AI Agent와 약속한 짧은 언어 코드로 변환한다.
     *
     * <p>Agent는 이 attribute만 보고 STT 언어와 번역 방향을 정하므로 실제 선호 언어를 담아야 한다.
     * 선호 언어는 필수 값이지만 비어 있으면 통화 자체가 막히지 않도록 기존 기본값을 사용한다.
     *
     * @param preferredLanguage 회원의 선호 언어이며 값이 없으면 null
     * @return KOREAN은 ko, ENGLISH는 en, 값이 없으면 기본 언어 코드
     */
    private String toLanguageCode(PreferredLanguage preferredLanguage) {
        if (preferredLanguage == null) {
            return DEFAULT_LANGUAGE_CODE;
        }
        return switch (preferredLanguage) {
            case KOREAN -> "ko";
            case ENGLISH -> "en";
        };
    }

    /**
     * 두 사용자 Entity가 같은 저장 식별자를 가리키는지 확인한다.
     *
     * @param left  비교할 첫 번째 사용자
     * @param right 비교할 두 번째 사용자
     * @return 두 사용자의 식별자가 같으면 true
     */
    private boolean sameUser(User left, User right) {
        return left != null && left.getId().equals(right.getId());
    }

    /**
     * LiveKit 토큰에 반영할 통화 참가 역할을 구분한다.
     */
    private enum ParticipantAccessRole {
        FAN("FAN", "fan"),
        HOST("INFLUENCER", "host");

        private final String attributeValue;
        private final String identityPrefix;

        /**
         * 토큰 attribute 값과 identity 접두어를 설정한다.
         *
         * @param attributeValue role attribute 값
         * @param identityPrefix LiveKit identity 접두어
         */
        ParticipantAccessRole(String attributeValue, String identityPrefix) {
            this.attributeValue = attributeValue;
            this.identityPrefix = identityPrefix;
        }
    }
}
