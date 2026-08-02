package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.FanMemoCreateRequest;
import com.ssafy.backend.influencer.dto.FanMemoCreateResponse;
import com.ssafy.backend.influencer.dto.FanMemoDeleteResponse;
import com.ssafy.backend.influencer.dto.FanMemoListResponse;
import com.ssafy.backend.influencer.dto.FanMemoUpdateRequest;
import com.ssafy.backend.influencer.dto.FanMemoUpdateResponse;
import com.ssafy.backend.influencer.service.FanMemoService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 팬 메모의 조회·작성·수정·삭제 API를 제공한다.
 * 목록·작성은 팬 하위 경로를, 개별 메모 수정·삭제는 메모 식별자 경로를 사용하므로
 * 공통 접두사만 클래스에 두고 나머지 경로는 메서드마다 지정한다.
 */
@RestController
@RequestMapping("/api/v1")
public class FanMemoController {

    private final FanMemoService fanMemoService;

    /**
     * 팬 메모 서비스를 주입받는다.
     *
     * @param fanMemoService 팬 메모 조회·작성·수정·삭제 서비스
     */
    public FanMemoController(FanMemoService fanMemoService) {
        this.fanMemoService = fanMemoService;
    }

    /**
     * 특정 팬에 대한 메모 이력을 최신순으로 페이지 조회한다.
     *
     * @param fanId 조회 대상 팬의 식별자
     * @param page 페이지 번호이며 기본값은 0이다
     * @param size 페이지 크기이며 기본값은 20이다
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 메모 페이지 응답
     */
    @GetMapping("/influencers/me/fans/{fanId}/memos")
    public ApiResponse<PageResponse<FanMemoListResponse>> getMemos(
            @PathVariable Long fanId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(fanMemoService.getMemos(fanId, page, size, principal));
    }

    /**
     * 특정 팬에 대한 메모를 작성한다.
     *
     * @param fanId 메모 대상 팬의 식별자
     * @param request 메모 내용과 선택적인 회차 정보
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 생성된 메모 정보
     */
    @PostMapping("/influencers/me/fans/{fanId}/memos")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<FanMemoCreateResponse> createMemo(
            @PathVariable Long fanId,
            @Valid @RequestBody FanMemoCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(fanMemoService.createMemo(fanId, request, principal));
    }

    /**
     * 작성자 본인이 메모 내용을 수정한다.
     *
     * @param memoId 수정할 메모 식별자
     * @param request 새로운 메모 내용
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 수정된 메모 정보
     */
    @PatchMapping("/fan-memos/{memoId}")
    public ApiResponse<FanMemoUpdateResponse> updateMemo(
            @PathVariable Long memoId,
            @Valid @RequestBody FanMemoUpdateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(fanMemoService.updateMemo(memoId, request, principal));
    }

    /**
     * 작성자 본인이 메모를 소프트 삭제한다.
     *
     * @param memoId 삭제할 메모 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 삭제 처리 결과
     */
    @DeleteMapping("/fan-memos/{memoId}")
    public ApiResponse<FanMemoDeleteResponse> deleteMemo(
            @PathVariable Long memoId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(fanMemoService.deleteMemo(memoId, principal));
    }
}
