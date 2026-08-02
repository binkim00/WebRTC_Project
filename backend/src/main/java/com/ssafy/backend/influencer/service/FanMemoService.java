package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.influencer.dto.FanMemoContentPolicy;
import com.ssafy.backend.influencer.dto.FanMemoCreateRequest;
import com.ssafy.backend.influencer.dto.FanMemoCreateResponse;
import com.ssafy.backend.influencer.dto.FanMemoDeleteResponse;
import com.ssafy.backend.influencer.dto.FanMemoListResponse;
import com.ssafy.backend.influencer.dto.FanMemoUpdateRequest;
import com.ssafy.backend.influencer.dto.FanMemoUpdateResponse;
import com.ssafy.backend.influencer.repository.FanMemoRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 인플루언서가 팬에 대해 남기는 메모의 조회·작성·수정·삭제를 처리한다.
 * 메모는 개인 기록이므로 조회는 작성자 또는 같은 활성 조직 매니저 범위로 제한하고
 * 수정·삭제는 작성 인플루언서 본인만 수행한다.
 */
@Service
public class FanMemoService {

    private static final int MAX_PAGE_SIZE = 100;

    private final FanMemoRepository fanMemoRepository;
    private final UserRepository userRepository;
    private final OrganizationMemberRepository organizationMemberRepository;
    private final ParticipantRepository participantRepository;
    private final MeetingAccessService meetingAccessService;
    private final CurrentUserService currentUserService;
    private final Clock clock;

    /**
     * 팬 메모 처리에 필요한 저장소와 권한 검증 서비스, 현재 사용자 조회 서비스, 시계를 주입받는다.
     *
     * @param fanMemoRepository 팬 메모 저장소
     * @param userRepository 사용자 저장소
     * @param organizationMemberRepository 조직 구성원 저장소
     * @param participantRepository 팬미팅 참가자 저장소
     * @param meetingAccessService 팬미팅 권한 검증 서비스
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param clock 소프트 삭제 시각 기준 시계
     */
    public FanMemoService(FanMemoRepository fanMemoRepository,
                          UserRepository userRepository,
                          OrganizationMemberRepository organizationMemberRepository,
                          ParticipantRepository participantRepository,
                          MeetingAccessService meetingAccessService,
                          CurrentUserService currentUserService,
                          Clock clock) {
        this.fanMemoRepository = fanMemoRepository;
        this.userRepository = userRepository;
        this.organizationMemberRepository = organizationMemberRepository;
        this.participantRepository = participantRepository;
        this.meetingAccessService = meetingAccessService;
        this.currentUserService = currentUserService;
        this.clock = clock;
    }

    /**
     * 특정 팬에 대한 메모 이력을 최신순으로 페이지 조회한다.
     * 인플루언서는 자신이 작성한 메모만, 매니저는 자신이 속한 활성 조직 인플루언서의 메모만 조회한다.
     *
     * @param fanId 조회 대상 팬의 식별자
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 삭제되지 않은 메모의 페이지 응답
     * @throws BusinessException 조회 권한이 없거나 팬이 존재하지 않거나 페이지 값이 잘못된 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<FanMemoListResponse> getMemos(
            Long fanId, int page, int size, AuthenticatedUser principal
    ) {
        User viewer = currentUserService.requireActiveUser(principal);
        PageRequest pageRequest = pageRequest(page, size);
        requireFanUser(fanId);

        Page<FanMemo> memos;
        if (isInfluencerRole(viewer.getRole())) {
            // /influencers/me 경로이므로 다른 인플루언서가 남긴 메모는 조회 대상에서 제외한다.
            memos = fanMemoRepository
                    .findByInfluencer_IdAndFan_IdAndDeletedAtIsNullOrderByCreatedAtDescIdDesc(
                            viewer.getId(), fanId, pageRequest);
        } else if (viewer.getRole() == UserRole.MANAGER) {
            // 전역 관리자 조회가 되지 않도록 매니저 본인의 활성 조직 범위로만 작성자를 제한한다.
            memos = fanMemoRepository.findOrganizationScopedByFan(
                    fanId,
                    requireActiveManagedOrganizationIds(viewer),
                    OrganizationMemberType.INFLUENCER,
                    OrganizationMemberStatus.ACTIVE,
                    pageRequest);
        } else {
            throw new BusinessException(ErrorCode.FAN_MEMO_ACCESS_DENIED);
        }
        return PageResponse.from(memos.map(FanMemoListResponse::from));
    }

    /**
     * 팬 메모를 작성한다.
     * 회차 식별자가 있으면 로그인 인플루언서가 주최한 회차이며 해당 팬이 참가했는지까지 검증한다.
     *
     * @param fanId 메모 대상 팬의 식별자
     * @param request 메모 내용과 선택적인 회차 정보
     * @param principal JWT 인증 사용자 정보
     * @return 저장된 메모 정보
     * @throws BusinessException 작성 권한이 없거나, 팬·회차가 유효하지 않거나,
     *         팬이 해당 회차 참가자가 아니거나, 내용이 비어 있는 경우
     */
    @Transactional
    public FanMemoCreateResponse createMemo(
            Long fanId, FanMemoCreateRequest request, AuthenticatedUser principal
    ) {
        // 권한 → 팬 → 회차 → 내용 순서로 검증한다. 매니저 작성은 허용하지 않는다.
        User influencer = requireWritingInfluencer(principal);
        User fan = requireFanUser(fanId);
        FanMeeting meeting = resolveMeeting(request.meetingId(), influencer, fanId);
        String content = requireContent(request.content());

        FanMemo memo = fanMemoRepository.save(FanMemo.create(influencer, fan, meeting, content));
        return FanMemoCreateResponse.from(memo);
    }

    /**
     * 작성자 본인이 메모 내용을 수정한다.
     *
     * @param memoId 수정할 메모 식별자
     * @param request 새로운 메모 내용
     * @param principal JWT 인증 사용자 정보
     * @return 수정된 메모 정보
     * @throws BusinessException 수정 권한이 없거나, 메모가 없거나, 이미 삭제되었거나,
     *         내용이 비어 있는 경우
     */
    @Transactional
    public FanMemoUpdateResponse updateMemo(
            Long memoId, FanMemoUpdateRequest request, AuthenticatedUser principal
    ) {
        FanMemo memo = requireWritableMemo(memoId, principal);
        memo.updateContent(requireContent(request.content()));
        // 응답에 담기는 수정 시각이 갱신 전 값이 되지 않도록 변경을 먼저 반영한다.
        return FanMemoUpdateResponse.from(fanMemoRepository.saveAndFlush(memo));
    }

    /**
     * 작성자 본인이 메모를 소프트 삭제한다.
     *
     * @param memoId 삭제할 메모 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 삭제 처리 결과
     * @throws BusinessException 삭제 권한이 없거나, 메모가 없거나, 이미 삭제된 경우
     */
    @Transactional
    public FanMemoDeleteResponse deleteMemo(Long memoId, AuthenticatedUser principal) {
        FanMemo memo = requireWritableMemo(memoId, principal);
        try {
            memo.delete(LocalDateTime.now(clock));
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.FAN_MEMO_ALREADY_DELETED);
        }
        return FanMemoDeleteResponse.from(fanMemoRepository.saveAndFlush(memo));
    }

    /**
     * 수정·삭제가 가능한 상태인지 확인한 뒤 대상 메모를 반환한다.
     * 삭제 여부보다 작성자 일치를 먼저 검증해 제3자에게 메모의 삭제 상태가 드러나지 않게 한다.
     *
     * @param memoId 대상 메모 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 작성자 본인의 삭제되지 않은 메모
     * @throws BusinessException 수정·삭제 권한이 없거나, 메모가 없거나, 이미 삭제된 경우
     */
    private FanMemo requireWritableMemo(Long memoId, AuthenticatedUser principal) {
        User influencer = requireWritingInfluencer(principal);
        FanMemo memo = fanMemoRepository.findWithMeetingById(memoId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEMO_NOT_FOUND));
        // LAZY 프록시의 식별자만 읽으므로 작성자 조회를 위한 추가 쿼리가 발생하지 않는다.
        if (!memo.getInfluencer().getId().equals(influencer.getId())) {
            throw new BusinessException(ErrorCode.FAN_MEMO_ACCESS_DENIED);
        }
        if (memo.isDeleted()) {
            throw new BusinessException(ErrorCode.FAN_MEMO_ALREADY_DELETED);
        }
        return memo;
    }

    /**
     * 메모를 작성·수정·삭제할 수 있는 인플루언서 본인인지 확인한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 활성 상태의 인플루언서 사용자
     * @throws BusinessException 활성 사용자가 아니거나 인플루언서 역할이 아닌 경우
     */
    private User requireWritingInfluencer(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (!isInfluencerRole(user.getRole())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /**
     * 메모 대상이 실제로 존재하는 활성 팬인지 확인한다.
     *
     * @param fanId 확인할 팬의 식별자
     * @return 활성 상태의 팬 사용자
     * @throws BusinessException 사용자가 없거나 활성 팬이 아닌 경우
     */
    private User requireFanUser(Long fanId) {
        return userRepository.findById(fanId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .filter(user -> user.getRole() == UserRole.FAN)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_NOT_FOUND));
    }

    /**
     * 매니저가 활성 상태로 소속된 조직의 식별자를 모은다.
     *
     * @param manager 조회를 요청한 매니저 사용자
     * @return 활성 소속 조직 식별자 목록
     * @throws BusinessException 활성 상태로 소속된 조직이 없는 경우
     */
    private List<Long> requireActiveManagedOrganizationIds(User manager) {
        List<Long> organizationIds = organizationMemberRepository
                .findAllByUserIdAndMemberTypeAndStatus(
                        manager.getId(),
                        OrganizationMemberType.MANAGER,
                        OrganizationMemberStatus.ACTIVE)
                .stream()
                .map(OrganizationMember::getOrganization)
                .map(organization -> organization.getId())
                .toList();
        if (organizationIds.isEmpty()) {
            throw new BusinessException(ErrorCode.FAN_MEMO_ACCESS_DENIED);
        }
        return organizationIds;
    }

    /**
     * 회차 식별자가 있으면 작성자 소유 회차이며 대상 팬이 참가했는지 검증한 뒤 회차를 반환한다.
     *
     * @param meetingId 회차 식별자이며 없으면 null
     * @param influencer 메모를 작성하는 인플루언서
     * @param fanId 메모 대상 팬의 식별자
     * @return 검증을 통과한 회차이며 회차 식별자가 없으면 null
     * @throws BusinessException 회차가 없거나 작성자 소유가 아니거나 팬이 참가자가 아닌 경우
     */
    private FanMeeting resolveMeeting(Long meetingId, User influencer, Long fanId) {
        if (meetingId == null) {
            return null;
        }
        // 남의 회차를 자기 것처럼 참조하지 못하도록 소유권을 먼저 검증한다.
        FanMeeting meeting = meetingAccessService.requireInfluencer(meetingId, influencer);
        if (participantRepository.findByMeeting_IdAndFan_Id(meetingId, fanId).isEmpty()) {
            throw new BusinessException(ErrorCode.PARTICIPANT_NOT_IN_MEETING);
        }
        return meeting;
    }

    /**
     * 메모 내용을 앞뒤 공백을 제거한 형태로 검증한다.
     * 개인정보 보호를 위해 예외 메시지에 내용을 포함하지 않는다.
     *
     * @param content 검증할 메모 내용
     * @return 공백이 제거된 메모 내용
     * @throws BusinessException 내용이 비어 있거나 최대 길이를 초과한 경우
     */
    private String requireContent(String content) {
        if (content == null) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        String trimmed = content.trim();
        if (trimmed.isEmpty() || trimmed.length() > FanMemoContentPolicy.MAX_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return trimmed;
    }

    /** 역할이 팬 메모를 작성할 수 있는 인플루언서 역할인지 확인한다. */
    private boolean isInfluencerRole(UserRole role) {
        return role == UserRole.INFLUENCER || role == UserRole.SOLO_INFLUENCER;
    }

    /** 목록 API의 페이지 번호와 크기를 검증해 최신순 페이지 요청을 생성한다. */
    private PageRequest pageRequest(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return PageRequest.of(page, size);
    }
}
