package com.ssafy.backend.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.backend.ai.domain.AiCallSummary;
import com.ssafy.backend.ai.domain.AiCallSummaryStatus;
import com.ssafy.backend.ai.domain.AiSubtitle;
import com.ssafy.backend.ai.domain.FanCard;
import com.ssafy.backend.ai.dto.FanCardCandidatesResponse;
import com.ssafy.backend.ai.dto.FanCardResponse;
import com.ssafy.backend.ai.dto.FanCardSuggestionStatus;
import com.ssafy.backend.ai.dto.InfluencerQuoteResponse;
import com.ssafy.backend.ai.repository.AiCallSummaryRepository;
import com.ssafy.backend.ai.repository.AiSubtitleRepository;
import com.ssafy.backend.ai.repository.FanCardRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.user.domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 팬이 통화 기념 카드 문구를 고르고 저장하는 기능을 담당한다.
 *
 * <p>후보는 두 갈래로 제공한다. 하나는 통화 중 저장된 자막에서 인플루언서 발화만 뽑은 목록이고,
 * 다른 하나는 통화 종료 후 Agent가 요약과 함께 생성한 AI 추천 문구다. AI 추천은 늦거나 실패할
 * 수 있으므로 준비되지 않아도 자막 목록은 그대로 내려준다.
 */
@Service
public class FanCardService {

    private static final Logger log = LoggerFactory.getLogger(FanCardService.class);

    /** 자막을 저장하는 Agent가 인플루언서 발화에 사용하는 화자 역할 값이다. */
    private static final String INFLUENCER_SPEAKER_ROLE = "INFLUENCER";

    /**
     * AI 추천이 이 시간 안에 도착하지 않으면 Agent가 중단된 것으로 보고 추천을 포기한다.
     *
     * <p>추천은 요약과 같은 모델 호출에서 만들어지므로
     * {@code AiCallSummaryService}의 생성 제한 시간과 같은 값을 사용한다. 이 방어가 없으면
     * 클라이언트가 GENERATING 응답만 받으며 무한히 다시 조회한다.
     */
    private static final Duration SUGGESTION_TIMEOUT = Duration.ofMinutes(10);

    /**
     * 추천 문구 JSON을 읽는 데만 쓰는 매퍼다.
     *
     * <p>문자열 목록 하나만 읽으므로 애플리케이션 전역 직렬화 설정과 무관하고, 컨테이너에서
     * {@code ObjectMapper}를 주입받으면 Jackson 자동 구성을 뺀 테스트 컨텍스트에서 이 서비스
     * 때문에 컨텍스트 로딩이 실패한다. 그래서 의존성을 늘리지 않고 여기서 직접 만든다.
     */
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 추천 문구 JSON을 읽을 때 사용할 목록 타입이다. */
    private static final TypeReference<List<String>> SUGGESTION_LIST_TYPE =
            new TypeReference<>() { };

    private final FanCardRepository fanCardRepository;
    private final AiSubtitleRepository aiSubtitleRepository;
    private final AiCallSummaryRepository aiCallSummaryRepository;
    private final CallSessionRepository callSessionRepository;
    private final CurrentUserService currentUserService;
    private final Clock clock;

    /**
     * 카드 문구 후보 조회와 저장에 필요한 저장소와 공통 서비스를 주입받는다.
     *
     * @param fanCardRepository 기념 카드 저장소
     * @param aiSubtitleRepository 자막 저장소
     * @param aiCallSummaryRepository AI 통화 요약 저장소이며 추천 문구도 여기에 담긴다
     * @param callSessionRepository 통화 세션 저장소
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param clock 추천 생성 지연 판단 기준 시계
     */
    public FanCardService(FanCardRepository fanCardRepository,
                          AiSubtitleRepository aiSubtitleRepository,
                          AiCallSummaryRepository aiCallSummaryRepository,
                          CallSessionRepository callSessionRepository,
                          CurrentUserService currentUserService,
                          Clock clock) {
        this.fanCardRepository = fanCardRepository;
        this.aiSubtitleRepository = aiSubtitleRepository;
        this.aiCallSummaryRepository = aiCallSummaryRepository;
        this.callSessionRepository = callSessionRepository;
        this.currentUserService = currentUserService;
        this.clock = clock;
    }

    /**
     * 팬에게 기념 카드 문구 후보와 이미 저장한 카드를 함께 반환한다.
     *
     * @param callSessionId 카드를 만들 통화 세션 식별자
     * @param principal JWT 인증 사용자 정보
     * @return AI 추천 문구, 인플루언서 발화 목록, 저장된 카드를 담은 응답
     * @throws BusinessException 통화 세션이 없거나 통화에 참여한 팬 본인이 아닌 경우
     */
    @Transactional(readOnly = true)
    public FanCardCandidatesResponse getCandidates(Long callSessionId, AuthenticatedUser principal) {
        CallSession callSession = requireParticipatedCallSession(callSessionId, principal);

        List<InfluencerQuoteResponse> quotes = aiSubtitleRepository
                .findByCallSession_IdAndSpeakerRoleOrderBySpokenAtAsc(
                        callSessionId, INFLUENCER_SPEAKER_ROLE)
                .stream()
                .filter(FanCardService::hasUsableText)
                .map(InfluencerQuoteResponse::from)
                .toList();

        Optional<AiCallSummary> callSummary =
                aiCallSummaryRepository.findByCallSession_Id(callSessionId);
        FanCardSuggestionStatus suggestionStatus =
                resolveSuggestionStatus(callSummary, callSession);
        List<String> aiSuggestions = suggestionStatus == FanCardSuggestionStatus.COMPLETED
                ? parseSuggestions(callSummary.map(AiCallSummary::getCardCandidates).orElse(null))
                : List.of();

        FanCardResponse savedCard = fanCardRepository.findByCallSession_Id(callSessionId)
                .map(FanCardResponse::from)
                .orElse(null);

        return FanCardCandidatesResponse.of(
                callSessionId, suggestionStatus, aiSuggestions, quotes, savedCard);
    }

    /**
     * 팬이 고른 문구를 기념 카드로 저장한다.
     *
     * <p>카드는 통화 세션당 한 장만 존재하므로, 이미 저장한 카드가 있으면 새로 만들지 않고
     * 문구만 바꿔 팬이 마음을 바꿔 다시 고를 수 있게 한다.
     *
     * @param callSessionId 카드를 만들 통화 세션 식별자
     * @param text 팬이 고른 문구
     * @param principal JWT 인증 사용자 정보
     * @return 저장된 기념 카드 응답
     * @throws BusinessException 통화 세션이 없거나 팬 본인이 아니거나 문구를 쓸 수 없는 경우
     */
    @Transactional
    public FanCardResponse saveCard(Long callSessionId, String text, AuthenticatedUser principal) {
        CallSession callSession = requireParticipatedCallSession(callSessionId, principal);

        try {
            FanCard fanCard = fanCardRepository.findByCallSession_Id(callSessionId)
                    .map(existing -> {
                        existing.changeText(text);
                        return existing;
                    })
                    .orElseGet(() -> fanCardRepository.save(FanCard.create(callSession, text)));
            return FanCardResponse.from(fanCard);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.FAN_CARD_TEXT_NOT_ALLOWED);
        }
    }

    /**
     * 통화 세션을 조회하고 요청자가 그 통화에 참여한 팬 본인인지 검증한다.
     *
     * <p>카드는 팬 본인의 기념물이므로 운영자와 인플루언서도 접근하지 못한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 참가자와 팬이 함께 조회된 통화 세션
     * @throws BusinessException 통화 세션이 없거나 참여한 팬 본인이 아닌 경우
     */
    private CallSession requireParticipatedCallSession(
            Long callSessionId, AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        CallSession callSession = callSessionRepository.findAccessContextById(callSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));

        if (!isParticipantFan(callSession, user.getId())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return callSession;
    }

    /**
     * 통화에 참여한 팬과 요청자가 같은지 예외 없이 판정한다.
     *
     * @param callSession 대기열·참가자·팬이 함께 조회된 통화 세션
     * @param userId 요청 사용자 식별자
     * @return 참여한 팬 본인이면 true
     */
    private boolean isParticipantFan(CallSession callSession, Long userId) {
        if (userId == null || callSession.getQueueEntry() == null
                || callSession.getQueueEntry().getParticipant() == null) {
            return false;
        }
        User fan = callSession.getQueueEntry().getParticipant().getFan();
        return fan != null && userId.equals(fan.getId());
    }

    /**
     * 저장된 요약 상태를 보고 AI 추천 문구의 준비 상태를 판정한다.
     *
     * @param callSummary 조회된 통화 요약이며 아직 생성 전이면 empty
     * @param callSession 카드를 만들 통화 세션
     * @return AI 추천 문구의 준비 상태
     */
    private FanCardSuggestionStatus resolveSuggestionStatus(
            Optional<AiCallSummary> callSummary, CallSession callSession) {
        if (callSummary.isEmpty()) {
            // 요약 행이 아직 없다. 통화 종료 후 제한 시간이 지났다면 Agent가 시작하지 못한 것으로 본다.
            LocalDateTime endedAt = callSession.getEndedAt();
            return endedAt != null && isTimedOut(endedAt)
                    ? FanCardSuggestionStatus.UNAVAILABLE
                    : FanCardSuggestionStatus.GENERATING;
        }

        AiCallSummary summary = callSummary.get();
        if (summary.getStatus() == AiCallSummaryStatus.COMPLETED) {
            return FanCardSuggestionStatus.COMPLETED;
        }
        if (summary.getStatus() == AiCallSummaryStatus.FAILED) {
            return FanCardSuggestionStatus.UNAVAILABLE;
        }
        return isTimedOut(summary.getCreatedAt())
                ? FanCardSuggestionStatus.UNAVAILABLE
                : FanCardSuggestionStatus.GENERATING;
    }

    /**
     * 기준 시각이 추천 생성 제한 시간을 넘겼는지 확인한다.
     *
     * @param startedAt 판단 기준이 되는 시각
     * @return 제한 시간을 넘겼으면 true
     */
    private boolean isTimedOut(LocalDateTime startedAt) {
        return startedAt != null
                && startedAt.plus(SUGGESTION_TIMEOUT).isBefore(LocalDateTime.now(clock));
    }

    /**
     * Agent가 JSON 배열로 저장한 추천 문구를 목록으로 바꾼다.
     *
     * <p>추천 문구는 Spring이 만들지 않는 값이라 형식이 깨져 있을 수 있다. 카드 후보가 없다고
     * 해서 팬이 자막에서 직접 고르는 흐름까지 막을 필요는 없으므로 파싱 실패는 빈 목록으로 넘긴다.
     *
     * @param raw JSON 배열 형태의 추천 문구 문자열이며 없으면 {@code null}
     * @return 공백을 정리한 추천 문구 목록
     */
    private List<String> parseSuggestions(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        try {
            List<String> parsed = OBJECT_MAPPER.readValue(raw, SUGGESTION_LIST_TYPE);
            return parsed.stream()
                    .filter(text -> text != null && !text.isBlank())
                    .map(String::strip)
                    .toList();
        } catch (Exception exception) {
            log.warn("팬 카드 추천 문구를 해석하지 못했습니다. raw={}", raw, exception);
            return List.of();
        }
    }

    /**
     * 카드 문구로 노출할 만한 자막인지 확인한다.
     *
     * @param subtitle 인플루언서가 말한 자막
     * @return 원문이 비어 있지 않으면 true
     */
    private static boolean hasUsableText(AiSubtitle subtitle) {
        return subtitle.getOriginalText() != null && !subtitle.getOriginalText().isBlank();
    }
}
