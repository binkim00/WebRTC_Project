package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.influencer.dto.FollowCreateResponse;
import com.ssafy.backend.influencer.dto.FollowDeleteResponse;
import com.ssafy.backend.influencer.dto.FollowerSummaryResponse;
import com.ssafy.backend.influencer.dto.FollowingSummaryResponse;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 팬과 인플루언서 사이의 팔로우 등록·취소·목록 조회를 처리한다. */
@Service
public class FollowingService {

    private static final int MAX_PAGE_SIZE = 100;

    private final CurrentUserService currentUserService;
    private final UserRepository userRepository;
    private final FollowingRepository followingRepository;
    private final InfluencerProfileRepository influencerProfileRepository;

    /**
     * 팔로우 처리에 필요한 사용자·관계·프로필 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param userRepository 사용자 저장소
     * @param followingRepository 팔로우 관계 저장소
     * @param influencerProfileRepository 인플루언서 프로필 저장소
     */
    public FollowingService(
            CurrentUserService currentUserService,
            UserRepository userRepository,
            FollowingRepository followingRepository,
            InfluencerProfileRepository influencerProfileRepository
    ) {
        this.currentUserService = currentUserService;
        this.userRepository = userRepository;
        this.followingRepository = followingRepository;
        this.influencerProfileRepository = influencerProfileRepository;
    }

    /**
     * 팬이 활성 인플루언서를 팔로우한다.
     *
     * @param influencerId 팔로우 대상 인플루언서 사용자 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 생성된 팔로우 관계와 현재 팔로워 수
     * @throws BusinessException 팬 권한이 아니거나 대상·관계가 유효하지 않은 경우
     */
    @Transactional
    public FollowCreateResponse follow(Long influencerId, AuthenticatedUser principal) {
        User fan = requireFan(principal);
        if (fan.getId().equals(influencerId)) {
            throw new BusinessException(ErrorCode.SELF_FOLLOW_NOT_ALLOWED);
        }
        User influencer = requireInfluencer(influencerId);
        if (followingRepository.existsByFollower_IdAndFollowedInfluencer_Id(
                fan.getId(), influencerId)) {
            throw new BusinessException(ErrorCode.FOLLOW_ALREADY_EXISTS);
        }

        Following following;
        try {
            following = followingRepository.saveAndFlush(Following.follow(fan, influencer));
        } catch (DataIntegrityViolationException exception) {
            throw new BusinessException(ErrorCode.FOLLOW_ALREADY_EXISTS);
        }
        long followerCount = followingRepository.countByFollowedInfluencer_Id(influencerId);
        return FollowCreateResponse.from(following, followerCount);
    }

    /**
     * 팬과 인플루언서 사이의 기존 팔로우 관계를 취소한다.
     *
     * @param influencerId 팔로우 취소 대상 인플루언서 사용자 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 팔로우 취소 결과와 현재 팔로워 수
     * @throws BusinessException 팬 권한이 아니거나 대상·관계가 존재하지 않는 경우
     */
    @Transactional
    public FollowDeleteResponse unfollow(Long influencerId, AuthenticatedUser principal) {
        User fan = requireFan(principal);
        requireInfluencer(influencerId);
        Following following = followingRepository
                .findByFollower_IdAndFollowedInfluencer_Id(fan.getId(), influencerId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FOLLOW_NOT_FOUND));
        followingRepository.delete(following);
        followingRepository.flush();
        long followerCount = followingRepository.countByFollowedInfluencer_Id(influencerId);
        return new FollowDeleteResponse(influencerId, false, followerCount);
    }

    /**
     * 현재 팬이 팔로우하는 인플루언서를 최신 팔로우 순으로 조회한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 인플루언서 요약 페이지
     * @throws BusinessException 팬 권한이 아니거나 페이지 값이 잘못된 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<FollowingSummaryResponse> getMyFollowings(
            int page, int size, AuthenticatedUser principal
    ) {
        User fan = requireFan(principal);
        Page<Following> followings =
                followingRepository.findAllByFollower_IdOrderByCreatedAtDescIdDesc(
                        fan.getId(), pageRequest(page, size)
                );
        Map<Long, InfluencerProfile> profilesByUserId = influencerProfileRepository
                .findAllByUser_IdIn(followings.getContent().stream()
                        .map(following -> following.getFollowedInfluencer().getId())
                        .toList())
                .stream()
                .collect(Collectors.toMap(profile -> profile.getUser().getId(), Function.identity()));
        Page<FollowingSummaryResponse> responses = followings.map(following -> {
            Long influencerId = following.getFollowedInfluencer().getId();
            InfluencerProfile profile = profilesByUserId.get(influencerId);
            if (profile == null) {
                throw new BusinessException(ErrorCode.INFLUENCER_NOT_FOUND);
            }
            return FollowingSummaryResponse.from(following, profile);
        });
        return PageResponse.from(responses);
    }

    /**
     * 현재 인플루언서를 팔로우하는 팬을 최신 팔로우 순으로 조회한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 팬 요약 페이지
     * @throws BusinessException 인플루언서 권한이 아니거나 페이지 값이 잘못된 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<FollowerSummaryResponse> getMyFollowers(
            int page, int size, AuthenticatedUser principal
    ) {
        User influencer = requireCurrentInfluencer(principal);
        Page<Following> followings =
                followingRepository.findAllByFollowedInfluencer_IdOrderByCreatedAtDescIdDesc(
                        influencer.getId(), pageRequest(page, size)
                );
        return PageResponse.from(followings.map(FollowerSummaryResponse::from));
    }

    /** 현재 사용자가 팬 역할인지 검증한다. */
    private User requireFan(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.getRole() != UserRole.FAN) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /** 현재 사용자가 팔로워 목록을 조회할 수 있는 인플루언서인지 검증한다. */
    private User requireCurrentInfluencer(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (!isInfluencerRole(user.getRole())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /** 식별자에 해당하는 활성 인플루언서를 조회한다. */
    private User requireInfluencer(Long influencerId) {
        return userRepository.findById(influencerId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .filter(user -> isInfluencerRole(user.getRole()))
                .orElseThrow(() -> new BusinessException(ErrorCode.INFLUENCER_NOT_FOUND));
    }

    /** 역할이 팔로우 가능한 인플루언서 역할인지 확인한다. */
    private boolean isInfluencerRole(UserRole role) {
        return role == UserRole.INFLUENCER || role == UserRole.SOLO_INFLUENCER;
    }

    /** 목록 API의 페이지 번호와 크기를 검증해 페이지 요청을 생성한다. */
    private PageRequest pageRequest(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return PageRequest.of(page, size);
    }
}
