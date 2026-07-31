package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 인플루언서 프로필 영속성 처리를 담당한다.
 */
public interface InfluencerProfileRepository extends JpaRepository<InfluencerProfile, Long> {

    /** 여러 인플루언서 사용자의 공개 프로필을 한 번에 조회한다. */
    List<InfluencerProfile> findAllByUser_IdIn(Collection<Long> userIds);

    /**
     * 공개 대상 인플루언서를 검색어로 필터링해 최신순으로 조회한다.
     * 사용자 계정을 함께 가져와 목록 변환 시 추가 조회가 발생하지 않도록 한다.
     *
     * @param status 노출 대상 사용자 상태
     * @param roles 노출 대상 사용자 역할
     * @param keyword 활동명·소개·닉네임에 적용할 검색어이며 null이면 전체 조회
     * @param pageable 페이지 요청
     * @return 공개 대상 인플루언서 프로필 페이지
     */
    @Query(value = """
            select profile from InfluencerProfile profile
            join fetch profile.user account
            where account.status = :status
              and account.role in :roles
              and (:keyword is null
                   or lower(profile.activityName) like lower(concat('%', :keyword, '%'))
                   or lower(profile.introduction) like lower(concat('%', :keyword, '%'))
                   or lower(account.nickname) like lower(concat('%', :keyword, '%')))
            order by profile.createdAt desc, profile.id desc
            """,
            countQuery = """
                    select count(profile) from InfluencerProfile profile
                    join profile.user account
                    where account.status = :status
                      and account.role in :roles
                      and (:keyword is null
                           or lower(profile.activityName) like lower(concat('%', :keyword, '%'))
                           or lower(profile.introduction) like lower(concat('%', :keyword, '%'))
                           or lower(account.nickname) like lower(concat('%', :keyword, '%')))
                    """)
    Page<InfluencerProfile> findDiscoverable(@Param("status") UserStatus status,
                                             @Param("roles") Collection<UserRole> roles,
                                             @Param("keyword") String keyword,
                                             Pageable pageable);

    /**
     * 공개 대상 인플루언서 한 명의 프로필을 사용자 계정과 함께 조회한다.
     *
     * @param influencerId 인플루언서 사용자 식별자
     * @param status 노출 대상 사용자 상태
     * @param roles 노출 대상 사용자 역할
     * @return 공개 대상이면 프로필, 아니면 empty
     */
    @Query("""
            select profile from InfluencerProfile profile
            join fetch profile.user account
            where account.id = :influencerId
              and account.status = :status
              and account.role in :roles
            """)
    Optional<InfluencerProfile> findDiscoverableByUserId(@Param("influencerId") Long influencerId,
                                                         @Param("status") UserStatus status,
                                                         @Param("roles") Collection<UserRole> roles);

    /**
     * 여러 인플루언서의 팔로워 수를 한 번의 집계 쿼리로 조회한다.
     * FollowingRepository는 변경 대상이 아니므로 탐색 전용 집계를 이곳에 둔다.
     *
     * @param influencerIds 집계할 인플루언서 사용자 식별자 목록
     * @return 팔로워가 한 명 이상인 인플루언서의 집계 결과
     */
    @Query("""
            select following.followedInfluencer.id as influencerId, count(following.id) as followerCount
            from Following following
            where following.followedInfluencer.id in :influencerIds
            group by following.followedInfluencer.id
            """)
    List<FollowerCountView> countFollowersByInfluencerIds(
            @Param("influencerIds") Collection<Long> influencerIds);

    /**
     * 특정 팬이 지정한 인플루언서 중 팔로우 중인 대상만 한 번에 조회한다.
     *
     * @param followerId 팔로우 여부를 확인할 팬의 사용자 식별자
     * @param influencerIds 확인 대상 인플루언서 사용자 식별자 목록
     * @return 팔로우 중인 인플루언서 사용자 식별자 목록
     */
    @Query("""
            select following.followedInfluencer.id
            from Following following
            where following.follower.id = :followerId
              and following.followedInfluencer.id in :influencerIds
            """)
    List<Long> findFollowedInfluencerIds(@Param("followerId") Long followerId,
                                         @Param("influencerIds") Collection<Long> influencerIds);

    /**
     * 인플루언서 상세에 노출할 공개 팬미팅을 예정 시각 순으로 조회한다.
     * 팬미팅 저장소는 담당 범위 밖이므로 탐색 전용 조회를 이곳에 둔다.
     *
     * @param influencerId 인플루언서 사용자 식별자
     * @param statuses 공개 대상으로 허용하는 팬미팅 상태
     * @return 삭제되지 않은 공개 대상 팬미팅 목록
     */
    @Query("""
            select meeting from FanMeeting meeting
            where meeting.influencer.id = :influencerId
              and meeting.deletedAt is null
              and meeting.status in :statuses
            order by meeting.scheduledStartAt asc, meeting.id asc
            """)
    List<FanMeeting> findPublicMeetings(@Param("influencerId") Long influencerId,
                                        @Param("statuses") Collection<FanMeetingStatus> statuses);

    /** 인플루언서별 팔로워 수 집계 결과를 전달한다. */
    interface FollowerCountView {
        /** 인플루언서 사용자 식별자를 반환한다. */
        Long getInfluencerId();

        /** 해당 인플루언서의 팔로워 수를 반환한다. */
        long getFollowerCount();
    }
}
