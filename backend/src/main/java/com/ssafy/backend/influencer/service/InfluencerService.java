package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.influencer.dto.InfluencerDetailResponse;
import com.ssafy.backend.influencer.dto.InfluencerSummaryResponse;
import com.ssafy.backend.influencer.dto.MeetingSummaryResponse;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** 비로그인 사용자도 접근하는 인플루언서 탐색 목록·상세 조회를 처리한다. */
@Service
public class InfluencerService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<UserRole> DISCOVERABLE_ROLES =
            Set.of(UserRole.INFLUENCER, UserRole.SOLO_INFLUENCER);
    // 초안(DRAFT)·취소(CANCELED)·삭제 팬미팅은 어느 구간에도 공개하지 않는다.
    private static final Set<FanMeetingStatus> UPCOMING_MEETING_STATUSES = Set.of(
            FanMeetingStatus.PUBLISHED,
            FanMeetingStatus.APPLICATION_OPEN,
            FanMeetingStatus.APPLICATION_CLOSED,
            FanMeetingStatus.READY,
            FanMeetingStatus.LIVE
    );
    // 정상 종료를 뜻하는 상태는 ENDED 하나뿐이며 CANCELED는 취소라 이력에서 제외한다.
    private static final Set<FanMeetingStatus> PAST_MEETING_STATUSES = Set.of(FanMeetingStatus.ENDED);
    // 오래 활동한 인플루언서일수록 이력이 무한정 늘어나므로 최근 건수만 노출한다.
    private static final int PAST_MEETING_LIMIT = 10;

    private final InfluencerProfileRepository influencerProfileRepository;
    private final FollowingRepository followingRepository;

    /**
     * 인플루언서 탐색에 필요한 프로필·팔로우 저장소를 주입받는다.
     *
     * @param influencerProfileRepository 인플루언서 프로필 저장소
     * @param followingRepository 팔로우 관계 저장소
     */
    public InfluencerService(InfluencerProfileRepository influencerProfileRepository,
                                  FollowingRepository followingRepository) {
        this.influencerProfileRepository = influencerProfileRepository;
        this.followingRepository = followingRepository;
    }

    /**
     * 공개 대상 인플루언서 한 명의 상세 정보와 공개 팬미팅을 조회한다.
     *
     * @param influencerId 인플루언서 사용자 식별자
     * @param principal JWT 인증 사용자 정보이며 비로그인 요청은 null
     * @return 인플루언서 상세 응답
     * @throws BusinessException 존재하지 않거나 공개 대상이 아닌 인플루언서인 경우
     */
    @Transactional(readOnly = true)
    public InfluencerDetailResponse getInfluencer(Long influencerId, AuthenticatedUser principal) {
        InfluencerProfileRepository.InfluencerDetailView view = influencerProfileRepository
                .findDiscoverableByUserId(influencerId, UserStatus.ACTIVE, DISCOVERABLE_ROLES)
                .orElseThrow(() -> new BusinessException(ErrorCode.INFLUENCER_NOT_FOUND));
        return InfluencerDetailResponse.of(
                view,
                followingRepository.countByFollowedInfluencer_Id(influencerId),
                isFollowedBy(principal, influencerId),
                publicMeetings(influencerId)
        );
    }

    /**
     * 예정·진행 팬미팅 뒤에 최근 종료 이력을 이어 붙인 단일 목록을 만든다.
     * 명세가 하나의 meetings 배열을 요구하므로 각 항목의 status로 구간을 구분한다.
     *
     * @param influencerId 인플루언서 사용자 식별자
     * @return 예정·진행은 가까운 순, 종료는 최근 순으로 정렬된 팬미팅 목록
     */
    private List<MeetingSummaryResponse> publicMeetings(Long influencerId) {
        Stream<InfluencerProfileRepository.MeetingView> upcoming = influencerProfileRepository
                .findUpcomingMeetings(influencerId, UPCOMING_MEETING_STATUSES).stream();
        Stream<InfluencerProfileRepository.MeetingView> past = influencerProfileRepository
                .findPastMeetings(influencerId, PAST_MEETING_STATUSES,
                        PageRequest.of(0, PAST_MEETING_LIMIT)).stream();
        return Stream.concat(upcoming, past)
                .map(MeetingSummaryResponse::from)
                .toList();
    }

    /**
     * 로그인한 팬이 지정한 인플루언서를 팔로우 중인지 확인한다.
     *
     * @param principal JWT 인증 사용자 정보이며 비로그인 요청은 null
     * @param influencerId 확인 대상 인플루언서 사용자 식별자
     * @return 팔로우 중이면 true이며 비로그인·비팬 요청은 false
     */
    private boolean isFollowedBy(AuthenticatedUser principal, Long influencerId) {
        // 공개 API라 비로그인 요청이 정상 흐름이므로 활성 사용자 조회를 강제하지 않는다.
        if (principal == null || principal.role() != UserRole.FAN) {
            return false;
        }
        return followingRepository.existsByFollower_IdAndFollowedInfluencer_Id(
                principal.userId(), influencerId);
    }

    /**
     * 공개 대상 인플루언서를 검색어로 필터링해 최신순으로 조회한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param keyword 활동명·소개·닉네임에 적용할 검색어이며 비어 있으면 전체 조회
     * @param principal JWT 인증 사용자 정보이며 비로그인 요청은 null
     * @return 인플루언서 요약 페이지
     * @throws BusinessException 페이지 번호나 크기가 허용 범위를 벗어난 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<InfluencerSummaryResponse> getInfluencers(
            int page, int size, String keyword, AuthenticatedUser principal
    ) {
        Page<InfluencerProfileRepository.InfluencerSummaryView> views =
                influencerProfileRepository.findDiscoverable(
                        UserStatus.ACTIVE, DISCOVERABLE_ROLES,
                        normalizeKeyword(keyword), pageRequest(page, size)
                );
        List<Long> influencerIds = views.getContent().stream()
                .map(InfluencerProfileRepository.InfluencerSummaryView::getInfluencerId)
                .toList();

        // 목록 크기와 무관하게 집계 1회, 팔로우 여부 1회만 조회해 N+1을 피한다.
        Map<Long, Long> followerCounts = followerCounts(influencerIds);
        Set<Long> followedIds = followedInfluencerIds(principal, influencerIds);

        return PageResponse.from(views.map(view -> {
            Long influencerId = view.getInfluencerId();
            return InfluencerSummaryResponse.of(
                    view,
                    followerCounts.getOrDefault(influencerId, 0L),
                    followedIds.contains(influencerId)
            );
        }));
    }

    /**
     * 여러 인플루언서의 팔로워 수를 한 번에 집계한다.
     *
     * @param influencerIds 집계할 인플루언서 사용자 식별자 목록
     * @return 인플루언서별 팔로워 수이며 팔로워가 없으면 항목이 없다
     */
    private Map<Long, Long> followerCounts(Collection<Long> influencerIds) {
        if (influencerIds.isEmpty()) {
            return Map.of();
        }
        return influencerProfileRepository.countFollowersByInfluencerIds(influencerIds).stream()
                .collect(Collectors.toMap(
                        InfluencerProfileRepository.FollowerCountView::getInfluencerId,
                        InfluencerProfileRepository.FollowerCountView::getFollowerCount
                ));
    }

    /**
     * 로그인한 팬이 팔로우 중인 인플루언서 식별자를 한 번에 조회한다.
     *
     * @param principal JWT 인증 사용자 정보이며 비로그인 요청은 null
     * @param influencerIds 확인 대상 인플루언서 사용자 식별자 목록
     * @return 팔로우 중인 인플루언서 식별자이며 비로그인·비팬 요청은 빈 집합
     */
    private Set<Long> followedInfluencerIds(AuthenticatedUser principal, Collection<Long> influencerIds) {
        // 공개 API라 비로그인 요청이 정상 흐름이므로 활성 사용자 조회를 강제하지 않는다.
        if (principal == null || principal.role() != UserRole.FAN || influencerIds.isEmpty()) {
            return Set.of();
        }
        return Set.copyOf(
                influencerProfileRepository.findFollowedInfluencerIds(principal.userId(), influencerIds)
        );
    }

    /**
     * 검색어의 공백을 정리하고 빈 값이면 전체 조회로 취급한다.
     *
     * @param keyword 요청으로 받은 검색어
     * @return 정리된 검색어이며 비어 있으면 null
     */
    private String normalizeKeyword(String keyword) {
        return StringUtils.hasText(keyword) ? keyword.trim() : null;
    }

    /**
     * 목록 API의 페이지 번호와 크기를 검증해 페이지 요청을 생성한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @return 검증을 통과한 페이지 요청
     * @throws BusinessException 페이지 번호나 크기가 허용 범위를 벗어난 경우
     */
    private PageRequest pageRequest(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return PageRequest.of(page, size);
    }
}
