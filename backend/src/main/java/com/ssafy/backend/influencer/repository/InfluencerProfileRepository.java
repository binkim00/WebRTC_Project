package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
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
     * 사용자의 공개 프로필 행을 삭제한다.
     * 회원탈퇴 시 활동명·소개를 남기지 않기 위해 사용하며, 호출 측 트랜잭션 안에서만 실행한다.
     *
     * @param userId 프로필을 삭제할 사용자 식별자
     */
    void deleteByUser_Id(Long userId);

    /**
     * 공개 대상 인플루언서를 검색어로 필터링해 최신순으로 조회한다.
     * 노출 여부는 사용자 계정(상태·역할)으로 판단하고 공개 프로필은 부가 정보로 붙인다.
     * 프로필을 아직 등록하지 않은 인플루언서도 목록에 나와야 하므로 left join을 쓴다.
     *
     * @param status 노출 대상 사용자 상태
     * @param roles 노출 대상 사용자 역할
     * @param keyword 활동명·소개·닉네임에 적용할 검색어이며 null이면 전체 조회
     * @param pageable 페이지 요청
     * @return 공개 대상 인플루언서 요약 페이지
     */
    @Query(value = """
            select account.id as influencerId,
                   profile.activityName as activityName,
                   account.nickname as nickname,
                   account.profileImageUrl as profileImageUrl,
                   profile.introduction as introduction
            from User account
            left join InfluencerProfile profile on profile.user.id = account.id
            where account.status = :status
              and account.role in :roles
              and (:keyword is null
                   or lower(profile.activityName) like lower(concat('%', :keyword, '%'))
                   or lower(profile.introduction) like lower(concat('%', :keyword, '%'))
                   or lower(account.nickname) like lower(concat('%', :keyword, '%')))
            order by account.createdAt desc, account.id desc
            """,
            countQuery = """
                    select count(account) from User account
                    left join InfluencerProfile profile on profile.user.id = account.id
                    where account.status = :status
                      and account.role in :roles
                      and (:keyword is null
                           or lower(profile.activityName) like lower(concat('%', :keyword, '%'))
                           or lower(profile.introduction) like lower(concat('%', :keyword, '%'))
                           or lower(account.nickname) like lower(concat('%', :keyword, '%')))
                    """)
    Page<InfluencerSummaryView> findDiscoverable(@Param("status") UserStatus status,
                                                 @Param("roles") Collection<UserRole> roles,
                                                 @Param("keyword") String keyword,
                                                 Pageable pageable);

    /**
     * 공개 대상 인플루언서 한 명의 계정과 공개 프로필을 조회한다.
     * 프로필이 없어도 계정이 공개 대상이면 조회된다.
     *
     * @param influencerId 인플루언서 사용자 식별자
     * @param status 노출 대상 사용자 상태
     * @param roles 노출 대상 사용자 역할
     * @return 공개 대상이면 상세 정보, 아니면 empty
     */
    @Query("""
            select account.id as influencerId,
                   profile.activityName as activityName,
                   account.nickname as nickname,
                   account.profileImageUrl as profileImageUrl,
                   profile.introduction as introduction,
                   profile.socialUrl as socialUrl
            from User account
            left join InfluencerProfile profile on profile.user.id = account.id
            where account.id = :influencerId
              and account.status = :status
              and account.role in :roles
            """)
    Optional<InfluencerDetailView> findDiscoverableByUserId(@Param("influencerId") Long influencerId,
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
     * 인플루언서 상세에 노출할 예정·진행 팬미팅을 시작이 가까운 순서로 조회한다.
     * 팬미팅 저장소는 담당 범위 밖이므로 탐색 전용 조회를 이곳에 둔다.
     * 응모 기간은 별도 설정 엔티티에 있으므로 left join으로 함께 읽어 추가 조회를 막는다.
     *
     * @param influencerId 인플루언서 사용자 식별자
     * @param statuses 예정·진행으로 취급하는 팬미팅 상태
     * @return 삭제되지 않은 예정·진행 팬미팅 목록
     */
    @Query("""
            select meeting.id as meetingId,
                   meeting.title as title,
                   meeting.coverImageUrl as coverImageUrl,
                   meeting.scheduledStartAt as scheduledStartAt,
                   meeting.status as status,
                   setting.applicationOpenAt as applicationStartAt,
                   setting.applicationCloseAt as applicationEndAt
            from FanMeeting meeting
            left join MeetingApplicationSetting setting on setting.meetingId = meeting.id
            where meeting.influencer.id = :influencerId
              and meeting.deletedAt is null
              and meeting.status in :statuses
            order by meeting.scheduledStartAt asc, meeting.id asc
            """)
    List<MeetingView> findUpcomingMeetings(@Param("influencerId") Long influencerId,
                                           @Param("statuses") Collection<FanMeetingStatus> statuses);

    /**
     * 인플루언서 상세에 노출할 종료 팬미팅 이력을 최근 종료 순서로 조회한다.
     * 오래 활동한 인플루언서의 응답이 비대해지지 않도록 호출 측이 건수를 제한한다.
     *
     * @param influencerId 인플루언서 사용자 식별자
     * @param statuses 종료로 취급하는 팬미팅 상태
     * @param pageable 노출할 최근 이력 건수
     * @return 삭제되지 않은 종료 팬미팅 목록
     */
    @Query("""
            select meeting.id as meetingId,
                   meeting.title as title,
                   meeting.coverImageUrl as coverImageUrl,
                   meeting.scheduledStartAt as scheduledStartAt,
                   meeting.status as status,
                   setting.applicationOpenAt as applicationStartAt,
                   setting.applicationCloseAt as applicationEndAt
            from FanMeeting meeting
            left join MeetingApplicationSetting setting on setting.meetingId = meeting.id
            where meeting.influencer.id = :influencerId
              and meeting.deletedAt is null
              and meeting.status in :statuses
            order by meeting.scheduledStartAt desc, meeting.id desc
            """)
    List<MeetingView> findPastMeetings(@Param("influencerId") Long influencerId,
                                       @Param("statuses") Collection<FanMeetingStatus> statuses,
                                       Pageable pageable);

    /**
     * 인플루언서 탐색 목록의 조회 결과를 전달한다.
     * 활동명과 소개는 공개 프로필이 없으면 null이다.
     */
    interface InfluencerSummaryView {
        /** 인플루언서 사용자 식별자를 반환한다. */
        Long getInfluencerId();

        /** 공개 프로필의 활동명을 반환하며 프로필이 없으면 null이다. */
        String getActivityName();

        /** 계정 닉네임을 반환한다. 활동명이 없을 때 대체 표시에 사용한다. */
        String getNickname();

        /** 계정 프로필 이미지 URL을 반환한다. */
        String getProfileImageUrl();

        /** 공개 프로필의 소개를 반환하며 프로필이 없으면 null이다. */
        String getIntroduction();
    }

    /** 인플루언서 상세의 조회 결과를 전달한다. */
    interface InfluencerDetailView extends InfluencerSummaryView {
        /** 공개 프로필의 외부 채널 URL을 반환하며 프로필이 없으면 null이다. */
        String getSocialUrl();
    }

    /** 인플루언서별 팔로워 수 집계 결과를 전달한다. */
    interface FollowerCountView {
        /** 인플루언서 사용자 식별자를 반환한다. */
        Long getInfluencerId();

        /** 해당 인플루언서의 팔로워 수를 반환한다. */
        long getFollowerCount();
    }

    /** 인플루언서 상세에 노출할 팬미팅과 응모 기간 조회 결과를 전달한다. */
    interface MeetingView {
        /** 팬미팅 식별자를 반환한다. */
        Long getMeetingId();

        /** 팬미팅 제목을 반환한다. */
        String getTitle();

        /** 팬미팅 대표 이미지 URL을 반환하며 없으면 null이다. */
        String getCoverImageUrl();

        /** 팬미팅 예정 시작 시각을 반환한다. */
        LocalDateTime getScheduledStartAt();

        /** 팬미팅 진행 상태를 반환한다. */
        FanMeetingStatus getStatus();

        /** 응모 시작 시각을 반환하며 응모 설정이 없으면 null이다. */
        LocalDateTime getApplicationStartAt();

        /** 응모 마감 시각을 반환하며 응모 설정이 없으면 null이다. */
        LocalDateTime getApplicationEndAt();
    }
}
