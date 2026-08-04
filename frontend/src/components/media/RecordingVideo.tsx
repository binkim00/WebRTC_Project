import { useCallback, useRef, type SyntheticEvent, type VideoHTMLAttributes } from 'react'

/**
 * 통화 녹화를 재생하는 video 요소다.
 *
 * ## 왜 별도 컴포넌트인가
 *
 * 녹화는 브라우저 `MediaRecorder`로 만든 WebM인데, MediaRecorder는 **길이(Duration)를
 * 컨테이너 헤더에 쓰지 않는다.** 스트리밍 중에는 최종 길이를 알 수 없기 때문이다.
 * 그래서 그냥 재생하면 `video.duration`이 `Infinity`가 되고, 브라우저가 전체 길이를
 * 모르니 **진행바를 드래그할 수 없다.**
 *
 * 서버 문제가 아니다. 백엔드 `GET /api/v1/recordings/{id}/content`는 이미
 * `Accept-Ranges: bytes`와 206 Partial Content를 지원한다.
 *
 * ## 해결 방법
 *
 * 메타데이터를 읽은 뒤 길이가 `Infinity`면 재생 위치를 파일 끝보다 큰 값으로 한 번 보낸다.
 * 그러면 브라우저가 끝까지 훑어 실제 길이를 계산하고 `durationchange`를 발생시킨다.
 * 길이가 확정되면 위치를 처음으로 되돌린다. WebM 재생에 널리 쓰이는 우회법이다.
 *
 * 녹화 메타데이터로 `durationSec`을 알고 있어도 `video.duration`은 읽기 전용이라
 * 직접 넣을 수 없어, 이 과정을 거치는 것 말고는 방법이 없다.
 */
export function RecordingVideo({
  onLoadedMetadata,
  ...props
}: VideoHTMLAttributes<HTMLVideoElement>) {
  // 길이를 확정한 src를 기억해 같은 파일에 대해 우회 절차를 반복하지 않는다.
  // src가 바뀌면 새 파일이므로 다시 수행한다.
  const probedSrcRef = useRef<string | undefined>(undefined)

  const handleLoadedMetadata = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      onLoadedMetadata?.(event)

      const video = event.currentTarget
      const currentSrc = video.currentSrc || String(props.src ?? '')

      if (probedSrcRef.current === currentSrc) return
      // 길이를 이미 알 수 있으면 우회할 필요가 없다.
      if (Number.isFinite(video.duration)) return

      probedSrcRef.current = currentSrc

      const restore = () => {
        if (!Number.isFinite(video.duration)) return
        video.removeEventListener('durationchange', restore)
        // 끝까지 훑는 동안 옮겨진 재생 위치를 처음으로 돌려놓는다.
        video.currentTime = 0
      }

      video.addEventListener('durationchange', restore)
      // 파일 끝을 넘어서는 값을 주면 브라우저가 실제 끝을 찾아 길이를 확정한다.
      video.currentTime = Number.MAX_SAFE_INTEGER
    },
    [onLoadedMetadata, props.src],
  )

  return <video {...props} onLoadedMetadata={handleLoadedMetadata} />
}
