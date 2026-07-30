package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.influencer.dto.FanMemoCreateRequest;
import com.ssafy.backend.influencer.dto.FanMemoResponse;
import com.ssafy.backend.influencer.dto.FanMemoUpdateRequest;
import com.ssafy.backend.influencer.repository.FanMemoRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 인플루언서가 팬에 대해 남기는 메모의 조회·작성·수정·삭제를 처리한다.
 */
@Service
public class FanMemoService {

    private final FanMemoRepository fanMemoRepository;
    private final UserRepository userRepository;
    private final MeetingAccessService meetingAccessService;
    private final CurrentUserService currentUserService;
    private final Clock clock;

    /**
     * 팬 메모 처리에 필요한 저장소와 권한 검증 서비스, 현재 사용자 조회 서비스, 시계를 주입받는다.
     *
     * @param fanMemoRepository 팬 메모 저장소
     * @param userRepository 사용자 저장소
     * @param meetingAccessService 팬미팅 권한 검증 서비스
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param clock 소프트 삭제 시각 기준 시계
     */
    public FanMemoService(FanMemoRepository fanMemoRepository,
                          UserRepository userRepository,
                          MeetingAccessService meetingAccessService,
                          CurrentUserService currentUserService,
                          Clock clock) {
        this.fanMemoRepository = fanMemoRepository;
        this.userRepository = userRepository;
        this.meetingAccessService = meetingAccessService;
        this.currentUserService = currentUserService;
        this.clock = clock;
    }

    /**
     * 로그인한 인플루언서가 특정 팬에 대해 작성한 메모 목록을 조회한다.
     *
     * @param fanId 조회 대상 팬의 ID
     * @param principal JWT 인증 사용자 정보
     * @return 삭제되지 않은 본인 작성 메모 목록
     * @throws BusinessException 인증 정보가 없거나 활성 사용자가 아닌 경우
     */
    @Transactional(readOnly = true)
    public List<FanMemoResponse> getMemos(Long fanId, AuthenticatedUser principal) {
        User influencer = currentUserService.requireActiveUser(principal);
        // /influencers/me 경로이므로 다른 인플루언서가 남긴 메모는 조회 대상에서 제외한다.
        return fanMemoRepository
                .findByInfluencer_IdAndFan_IdAndDeletedAtIsNull(influencer.getId(), fanId).stream()
                .map(FanMemoResponse::from)
                .toList();
    }

    /**
     * 팬미팅 회차에 대한 팬 메모를 작성한다.
     *
     * @param fanId 메모 대상 팬의 ID
     * @param request 메모 내용과 회차 정보
     * @param principal JWT 인증 사용자 정보
     * @return 저장된 메모 정보
     * @throws BusinessException 본인이 주최한 회차가 아니거나, 이미 해당 회차에 메모가 있거나,
     *         팬 또는 팬미팅이 존재하지 않는 경우
     */
    @Transactional
    public FanMemoResponse createMemo(Long fanId, FanMemoCreateRequest request, AuthenticatedUser principal) {
        User influencer = currentUserService.requireActiveUser(principal);
        // 권한 확인 → 존재 확인 → 비즈니스 규칙
        // 남의 팬미팅을 자기 것처럼 참조하지 못하도록 회차 소유권을 가장 먼저 검증한다.
        // 중복 검사보다 앞에 두어야 남의 회차 메모 존재 여부가 409 응답으로 새어나가지 않는다.
        FanMeeting meeting = meetingAccessService.requireInfluencer(request.meetingId(), influencer);

        // 회차당 메모 1개 규칙이 여기서 지켜진다 (DB UNIQUE 제약은 최후 방어선)
        if (fanMemoRepository.existsByFan_IdAndMeeting_IdAndDeletedAtIsNull(fanId, request.meetingId())) {
            throw new BusinessException(ErrorCode.FAN_MEMO_ALREADY_EXISTS);
        }

        User fan = userRepository.findById(fanId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACTIVE_USER_NOT_FOUND));

        FanMemo memo = FanMemo.create(influencer, fan, meeting, request.content());
        return FanMemoResponse.from(fanMemoRepository.save(memo));
    }

    /**
     * 작성자 본인이 메모 내용을 수정한다.
     *
     * @param memoId 수정할 메모 ID
     * @param request 새로운 메모 내용
     * @param principal JWT 인증 사용자 정보
     * @return 수정된 메모 정보
     * @throws BusinessException 메모가 없거나 이미 삭제되었거나 작성자가 아닌 경우
     */
    @Transactional
    public FanMemoResponse updateMemo(Long memoId, FanMemoUpdateRequest request, AuthenticatedUser principal) {
        FanMemo memo = requireWritableMemo(memoId, principal);
        // 영속 상태 엔티티라 변경 감지로 반영되므로 별도 save 호출이 필요 없다.
        memo.updateContent(request.content());
        return FanMemoResponse.from(memo);
    }

    /**
     * 작성자 본인이 메모를 소프트 삭제한다.
     *
     * @param memoId 삭제할 메모 ID
     * @param principal JWT 인증 사용자 정보
     * @throws BusinessException 메모가 없거나 이미 삭제되었거나 작성자가 아닌 경우
     */
    @Transactional
    public void deleteMemo(Long memoId, AuthenticatedUser principal) {
        FanMemo memo = requireWritableMemo(memoId, principal);
        memo.delete(LocalDateTime.now(clock));
    }

    /**
     * 수정·삭제가 가능한 상태인지 확인한 뒤 대상 메모를 반환한다.
     *
     * @param memoId 대상 메모 ID
     * @param principal JWT 인증 사용자 정보
     * @return 작성자 본인의 삭제되지 않은 메모
     * @throws BusinessException 메모가 없거나 이미 삭제되었거나 작성자가 아닌 경우
     */
    private FanMemo requireWritableMemo(Long memoId, AuthenticatedUser principal) {
        User influencer = currentUserService.requireActiveUser(principal);
        FanMemo memo = fanMemoRepository.findWithMeetingById(memoId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEMO_NOT_FOUND));
        if (memo.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEMO_ALREADY_DELETED);
        }
        // LAZY 프록시의 식별자만 읽으므로 작성자 조회를 위한 추가 쿼리가 발생하지 않는다.
        if (!memo.getInfluencer().getId().equals(influencer.getId())) {
            throw new BusinessException(ErrorCode.FAN_MEMO_ACCESS_DENIED);
        }
        return memo;
    }
}
