/**
 * 카메라 대신 내보낼 **캐릭터 영상 트랙**을 만든다. (팬 전용)
 *
 * 왜 이렇게 만드는가: 얼굴을 보이고 싶지 않은 팬은 지금 "카메라 끄기"밖에 없어서 검은 화면으로
 * 참여하게 된다. 그렇다고 버추얼 유튜버처럼 얼굴을 추적해 3D 아바타를 움직이려면 얼굴 랜드마크
 * 모델과 3D 렌더러, VRM 모델 파일이 필요해 이 프로젝트의 의존성(런타임 8개)과 2분짜리 통화에
 * 견주면 비용이 너무 크다.
 *
 * 그래서 **입만 소리에 맞춰 움직이는 2D 캐릭터**를 canvas로 직접 그린다. 버추얼 유튜버 영상에서
 * 시청자가 "살아 있다"고 느끼는 요소의 대부분이 립싱크와 눈 깜빡임이라, 얼굴 추적 없이도 효과가
 * 충분하다. 새 의존성이 하나도 필요하지 않다.
 *
 * **중요 — 왜 화면에 덧그리지 않고 트랙을 교체하는가**: 녹화는 상대의 *원본* 카메라 트랙을 담는다
 * (`useCallRecording`이 `new MediaStream([remoteVideoTrack])`을 쓴다). 받는 쪽 화면에 캐릭터를
 * 덧그리면 상대에게도, 녹화에도 남지 않는다. 그래서 보내는 쪽에서 canvas를 트랙으로 만들어
 * 카메라 자리에 발행한다. 그러면 상대 화면·녹화·내 미리보기가 모두 같은 캐릭터를 본다.
 */

/** 캐릭터 프리셋이다. 통화 중에 고르는 시간을 아끼려고 색만 다른 소수의 선택지를 둔다. */
export const CHARACTER_PRESETS = [
  { id: 'coral', skin: '#ffd9c9', hair: '#e8615c', cheek: '#ff9d8f' },
  { id: 'mint', skin: '#d9f3ec', hair: '#3fae95', cheek: '#8fd9c6' },
  { id: 'indigo', skin: '#dcdcf7', hair: '#5a5ac8', cheek: '#9d9de8' },
  { id: 'butter', skin: '#fdf0cd', hair: '#d9a72c', cheek: '#f0c96b' },
] as const

export type CharacterPresetId = (typeof CHARACTER_PRESETS)[number]['id']

/** 캐릭터 영상의 크기다. 얼굴 하나만 그리므로 4:3 저해상도로 충분하고 CPU도 아낀다. */
const WIDTH = 480
const HEIGHT = 360
/** 초당 프레임이다. 입 움직임은 15fps로도 자연스럽고, 30fps 대비 CPU를 절반만 쓴다. */
const FPS = 15

/** 캐릭터를 그리고 트랙으로 내보내는 렌더러의 제어 손잡이다. */
export type CharacterRenderer = {
  /** LiveKit에 발행할 비디오 MediaStreamTrack이다. */
  track: MediaStreamTrack
  /** 그리기와 오디오 분석을 멈추고 자원을 정리한다. */
  stop: () => void
}

/** 0~1 범위로 자른다. */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * 마이크 트랙의 순간 음량을 0~1로 읽어 주는 함수를 만든다.
 *
 * `AnalyserNode`의 시간영역 데이터로 RMS를 구한다. 주파수 분석까지 할 필요가 없고, 입을 얼마나
 * 벌릴지만 정하면 되기 때문이다. 마이크가 없거나 Web Audio를 쓸 수 없으면 항상 0을 준다.
 */
function createLevelReader(microphoneTrack?: MediaStreamTrack): {
  read: () => number
  close: () => void
} {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!microphoneTrack || !AudioContextConstructor) {
    return { read: () => 0, close: () => undefined }
  }

  try {
    const audioContext = new AudioContextConstructor()
    const source = audioContext.createMediaStreamSource(
      new MediaStream([microphoneTrack]),
    )
    const analyser = audioContext.createAnalyser()
    // 짧은 창을 쓰면 입이 소리에 민감하게 반응한다. 값이 커지면 반응이 둔해진다.
    analyser.fftSize = 512
    source.connect(analyser)
    const buffer = new Float32Array(analyser.fftSize)

    return {
      read: () => {
        analyser.getFloatTimeDomainData(buffer)
        let sumOfSquares = 0
        for (const sample of buffer) sumOfSquares += sample * sample
        const rms = Math.sqrt(sumOfSquares / buffer.length)
        // 말소리 RMS는 대개 0.02~0.2 구간이라 그 범위를 0~1로 넓혀야 입이 제대로 벌어진다.
        return clamp01(rms * 6)
      },
      close: () => {
        source.disconnect()
        analyser.disconnect()
        void audioContext.close().catch(() => undefined)
      },
    }
  } catch {
    // 오디오 분석에 실패해도 캐릭터 자체는 보여야 하므로 입만 닫힌 채로 진행한다.
    return { read: () => 0, close: () => undefined }
  }
}

/** 캐릭터 한 프레임을 그린다. */
function drawCharacter(
  context: CanvasRenderingContext2D,
  preset: (typeof CHARACTER_PRESETS)[number],
  /** 입을 벌린 정도(0~1)다. */
  mouthOpen: number,
  /** 눈을 감은 정도(0~1)다. 1이면 완전히 감는다. */
  blink: number,
  /** 경과 시간(ms)이며 숨쉬기처럼 천천히 흔드는 데 쓴다. */
  elapsedMs: number,
) {
  context.clearRect(0, 0, WIDTH, HEIGHT)

  // 배경 — 캐릭터가 떠 보이지 않게 은은한 단색을 깐다.
  context.fillStyle = '#23242a'
  context.fillRect(0, 0, WIDTH, HEIGHT)

  // 숨쉬기: 위아래로 아주 조금 움직여 정지 화면처럼 보이지 않게 한다.
  const breathe = Math.sin(elapsedMs / 900) * 4
  const centerX = WIDTH / 2
  const centerY = HEIGHT / 2 + breathe

  // 머리카락 — 얼굴보다 조금 큰 원으로 뒤에 깐다.
  context.fillStyle = preset.hair
  context.beginPath()
  context.arc(centerX, centerY - 6, 108, 0, Math.PI * 2)
  context.fill()

  // 얼굴
  context.fillStyle = preset.skin
  context.beginPath()
  context.arc(centerX, centerY, 96, 0, Math.PI * 2)
  context.fill()

  // 볼 — 표정을 부드럽게 만든다.
  context.fillStyle = preset.cheek
  context.globalAlpha = 0.55
  for (const offsetX of [-52, 52]) {
    context.beginPath()
    context.ellipse(centerX + offsetX, centerY + 26, 18, 11, 0, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1

  // 눈 — 깜빡임은 세로 반지름을 줄여 표현한다.
  context.fillStyle = '#2b2b33'
  const eyeRadiusY = 13 * (1 - blink)
  for (const offsetX of [-34, 34]) {
    if (eyeRadiusY < 1.2) {
      // 거의 감은 상태에서는 타원이 점처럼 보여 어색하므로 선으로 그린다.
      context.fillRect(centerX + offsetX - 11, centerY - 10, 22, 3)
      continue
    }
    context.beginPath()
    context.ellipse(centerX + offsetX, centerY - 8, 9, eyeRadiusY, 0, 0, Math.PI * 2)
    context.fill()
  }

  // 입 — 음량에 따라 높이가 자란다. 닫혀 있을 때도 선이 보여야 얼굴로 읽힌다.
  const mouthHeight = 4 + mouthOpen * 34
  const mouthWidth = 30 + mouthOpen * 14
  context.fillStyle = '#7a2f33'
  context.beginPath()
  context.ellipse(centerX, centerY + 52, mouthWidth / 2, mouthHeight / 2, 0, 0, Math.PI * 2)
  context.fill()
}

/**
 * 캐릭터를 그려 비디오 트랙으로 내보내기 시작한다.
 *
 * @param presetId 사용할 캐릭터 프리셋
 * @param microphoneTrack 입 움직임에 쓸 내 마이크 트랙이며 없으면 입은 닫힌 채로 있는다
 * @returns 발행할 트랙과 정리 함수. canvas를 쓸 수 없는 환경에서는 undefined다.
 */
export function startCharacterRenderer(
  presetId: CharacterPresetId,
  microphoneTrack?: MediaStreamTrack,
): CharacterRenderer | undefined {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  // jsdom이나 canvas를 막은 환경에서는 캐릭터 기능을 끈다.
  if (!context || typeof canvas.captureStream !== 'function') return undefined

  const preset =
    CHARACTER_PRESETS.find((candidate) => candidate.id === presetId) ?? CHARACTER_PRESETS[0]
  const level = createLevelReader(microphoneTrack)
  const startedAt = performance.now()

  /**
   * 입 움직임을 부드럽게 만들기 위한 직전 값이다.
   *
   * 음량을 그대로 쓰면 입이 프레임마다 튀어 경련처럼 보인다. 직전 값과 섞어 따라가게 한다.
   */
  let smoothedMouth = 0
  /** 다음 눈 깜빡임까지 남은 시간(ms)이다. 사람은 대략 3~6초에 한 번 깜빡인다. */
  let nextBlinkIn = 2_000
  /** 깜빡이는 동안의 진행도(0~1)이며 undefined면 눈을 뜨고 있다. */
  let blinkProgress: number | undefined
  let lastFrameAt = startedAt

  const intervalId = window.setInterval(() => {
    const nowMs = performance.now()
    const deltaMs = nowMs - lastFrameAt
    lastFrameAt = nowMs

    const target = level.read()
    // 벌릴 때는 빠르게, 닫을 때는 조금 느리게 따라가면 말하는 것처럼 보인다.
    const follow = target > smoothedMouth ? 0.5 : 0.25
    smoothedMouth += (target - smoothedMouth) * follow

    if (blinkProgress === undefined) {
      nextBlinkIn -= deltaMs
      if (nextBlinkIn <= 0) blinkProgress = 0
    } else {
      // 깜빡임 한 번은 약 140ms다.
      blinkProgress += deltaMs / 140
      if (blinkProgress >= 1) {
        blinkProgress = undefined
        nextBlinkIn = 3_000 + Math.random() * 3_000
      }
    }

    // 0 → 1 → 0으로 감았다 뜨는 곡선이다.
    const blink =
      blinkProgress === undefined ? 0 : Math.sin(clamp01(blinkProgress) * Math.PI)

    drawCharacter(context, preset, smoothedMouth, blink, nowMs - startedAt)
  }, Math.round(1000 / FPS))

  const stream = canvas.captureStream(FPS)
  const track = stream.getVideoTracks()[0]
  if (!track) {
    window.clearInterval(intervalId)
    level.close()
    return undefined
  }

  return {
    track,
    stop: () => {
      window.clearInterval(intervalId)
      level.close()
      track.stop()
    },
  }
}
