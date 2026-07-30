package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.influencer.dto.FanMemoCreateRequest;
import com.ssafy.backend.influencer.dto.FanMemoResponse;
import com.ssafy.backend.influencer.repository.FanMemoRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 인플루언서가 팬에 대해 남기는 메모의 조회와 작성을 처리한다.
 */
@Service
public class FanMemoService {

    private final FanMemoRepository fanMemoRepository;
    private final UserRepository userRepository;
    private final FanMeetingRepository fanMeetingRepository;
    private final CurrentUserService currentUserService;

    /**
     * 팬 메모 처리에 필요한 저장소와 현재 사용자 조회 서비스를 주입받는다.
     *
     * @param fanMemoRepository 팬 메모 저장소
     * @param userRepository 사용자 저장소
     * @param fanMeetingRepository 팬미팅 저장소
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     */
    public FanMemoService(FanMemoRepository fanMemoRepository,
                          UserRepository userRepository,
                          FanMeetingRepository fanMeetingRepository,
                          CurrentUserService currentUserService) {
        this.fanMemoRepository = fanMemoRepository;
        this.userRepository = userRepository;
        this.fanMeetingRepository = fanMeetingRepository;
        this.currentUserService = currentUserService;
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
     * @throws BusinessException 이미 해당 회차에 메모가 있거나, 팬 또는 팬미팅이 존재하지 않는 경우
     */
    @Transactional
    public FanMemoResponse createMemo(Long fanId, FanMemoCreateRequest request, AuthenticatedUser principal) {
        User influencer = currentUserService.requireActiveUser(principal);
        // 회차당 메모 1개 규칙이 여기서 지켜진다 (DB UNIQUE 제약은 최후 방어선)
        if (fanMemoRepository.existsByFan_IdAndMeeting_IdAndDeletedAtIsNull(fanId, request.meetingId())) {
            throw new BusinessException(ErrorCode.FAN_MEMO_ALREADY_EXISTS);
        }

        User fan = userRepository.findById(fanId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACTIVE_USER_NOT_FOUND));
        FanMeeting meeting = fanMeetingRepository.findById(request.meetingId())
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));

        FanMemo memo = FanMemo.create(influencer, fan, meeting, request.content());
        return FanMemoResponse.from(fanMemoRepository.save(memo));
    }


}
