import { useEffect, useState, type CSSProperties } from 'react'
import jellyDuo from '../../assets/landing/jelly-duo-selected-transparent.png'
import './JellyCelebration.css'

// Melly 브랜드 팔레트 — Jelly Coral / Peach / Soft Yellow / Lavender / Pink
const CORAL = '#ff8f7d'
const PEACH = '#ffbf9e'
const SOFT_YELLOW = '#ffe1a3'
const LAVENDER = '#cfc0f0'
const PINK = '#ffb0c8'

type ParticleKind = 'blob' | 'piece' | 'heart' | 'sparkle'

interface Particle {
  kind: ParticleKind
  /** 컨테이너 기준 가로 위치(%) — 중앙 하단에서 좌우로 퍼진다. */
  left: number
  size: number
  color: string
  /** 최종 이동량(px)과 회전 — CSS 변수로 keyframe에 전달한다. */
  tx: number
  ty: number
  rot: number
  delay: number
  duration: number
}

// 매 렌더가 같은 연출을 재생하도록 난수 대신 고정 배치를 쓴다.
// 하트·반짝이는 늦게 시작해 천천히 사라지고, 젤리 조각이 가장 먼저 튀어 오른다.
const PARTICLES: Particle[] = [
  { kind: 'piece', left: 44, size: 14, color: CORAL, tx: -66, ty: -150, rot: -120, delay: 0, duration: 1.15 },
  { kind: 'piece', left: 54, size: 12, color: LAVENDER, tx: 58, ty: -166, rot: 140, delay: 0.04, duration: 1.2 },
  { kind: 'blob', left: 38, size: 11, color: PEACH, tx: -96, ty: -110, rot: 40, delay: 0.08, duration: 1.25 },
  { kind: 'blob', left: 62, size: 13, color: PINK, tx: 92, ty: -126, rot: -60, delay: 0.1, duration: 1.2 },
  { kind: 'piece', left: 48, size: 9, color: SOFT_YELLOW, tx: -20, ty: -186, rot: 90, delay: 0.12, duration: 1.3 },
  { kind: 'blob', left: 58, size: 8, color: LAVENDER, tx: 34, ty: -180, rot: 0, delay: 0.16, duration: 1.3 },
  { kind: 'heart', left: 34, size: 18, color: CORAL, tx: -118, ty: -132, rot: -24, delay: 0.24, duration: 1.5 },
  { kind: 'heart', left: 66, size: 15, color: PINK, tx: 112, ty: -150, rot: 20, delay: 0.3, duration: 1.55 },
  { kind: 'heart', left: 52, size: 12, color: LAVENDER, tx: 30, ty: -204, rot: 14, delay: 0.36, duration: 1.5 },
  { kind: 'heart', left: 26, size: 14, color: PINK, tx: -142, ty: -172, rot: -36, delay: 0.18, duration: 1.55 },
  { kind: 'heart', left: 74, size: 17, color: CORAL, tx: 138, ty: -118, rot: 30, delay: 0.22, duration: 1.5 },
  { kind: 'heart', left: 44, size: 11, color: PINK, tx: -54, ty: -224, rot: -18, delay: 0.42, duration: 1.45 },
  { kind: 'heart', left: 58, size: 13, color: CORAL, tx: 70, ty: -196, rot: 26, delay: 0.32, duration: 1.5 },
  { kind: 'heart', left: 38, size: 10, color: LAVENDER, tx: -96, ty: -160, rot: -30, delay: 0.44, duration: 1.4 },
  { kind: 'heart', left: 62, size: 12, color: PINK, tx: 124, ty: -186, rot: 38, delay: 0.38, duration: 1.45 },
  { kind: 'sparkle', left: 42, size: 13, color: SOFT_YELLOW, tx: -78, ty: -196, rot: 90, delay: 0.28, duration: 1.55 },
  { kind: 'sparkle', left: 60, size: 11, color: '#fff3d6', tx: 96, ty: -176, rot: -70, delay: 0.34, duration: 1.5 },
  { kind: 'sparkle', left: 50, size: 9, color: SOFT_YELLOW, tx: -8, ty: -228, rot: 120, delay: 0.4, duration: 1.45 },
  { kind: 'blob', left: 30, size: 7, color: PEACH, tx: -128, ty: -84, rot: 0, delay: 0.2, duration: 1.35 },
  { kind: 'blob', left: 70, size: 7, color: CORAL, tx: 130, ty: -96, rot: 0, delay: 0.22, duration: 1.35 },
]

// 파티클 연출이 모두 끝나는 시점(delay + duration 최대값) 뒤에 DOM에서 정리한다.
const PARTICLES_DONE_MS = 2000

function HeartParticle({ color }: { color: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24">
      <path
        d="M12 21C9.2 18.9 2 14 2 8.7 2 5.6 4.3 3.5 7 3.5c2 0 3.8 1.1 5 2.9 1.2-1.8 3-2.9 5-2.9 2.7 0 5 2.1 5 5.2C22 14 14.8 18.9 12 21Z"
        fill={color}
        opacity={0.85}
      />
      <ellipse cx="8.2" cy="8" fill="white" opacity={0.75} rx="2.4" ry="1.7" transform="rotate(-28 8.2 8)" />
    </svg>
  )
}

function SparkleParticle({ color }: { color: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24">
      <path
        d="M12 1.5 14.4 9.6 22.5 12 14.4 14.4 12 22.5 9.6 14.4 1.5 12 9.6 9.6Z"
        fill={color}
        opacity={0.9}
      />
      <circle cx="12" cy="12" fill="white" opacity={0.85} r="2.2" />
    </svg>
  )
}

export interface JellyCelebrationProps {
  /** 컨테이너에 높이를 부여하는 클래스. 예: h-[clamp(150px,18vw,210px)] */
  className?: string
}

/**
 * 당첨 결과가 나타나는 순간 재생되는 장식용 축하 애니메이션.
 * 코랄·라벤더 젤리 듀오가 아래에서 squash & stretch로 튀어나오고
 * 투명한 젤리 파티클·하트·반짝이가 퍼졌다가 사라진다.
 * 정보를 담지 않는 순수 장식이므로 스크린 리더와 포인터에서 제외한다.
 */
export function JellyCelebration({ className }: JellyCelebrationProps) {
  // CSS 애니메이션 시계는 탭이 가려져 있어도 흐르므로, 문서가 실제로 보이기
  // 전에는 마운트를 미뤄 사용자가 보는 순간부터 재생되게 한다.
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  const [particlesDone, setParticlesDone] = useState(false)

  useEffect(() => {
    if (visible) return
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') setVisible(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => setParticlesDone(true), PARTICLES_DONE_MS)
    return () => window.clearTimeout(timer)
  }, [visible])

  if (!visible) {
    // 높이를 유지해 레이아웃 이동 없이 보이는 순간부터 연출을 시작한다.
    return <div aria-hidden className={`jc-root ${className ?? ''}`} />
  }

  return (
    <div aria-hidden className={`jc-root ${className ?? ''}`}>
      <div className="jc-glow" />
      {particlesDone
        ? null
        : PARTICLES.map((particle, index) => {
            const style: CSSProperties & Record<`--jc-${string}`, string> = {
              left: `${particle.left}%`,
              width: particle.size,
              height: particle.size,
              '--jc-color': particle.color,
              '--jc-tx': `${particle.tx}px`,
              '--jc-ty': `${particle.ty}px`,
              '--jc-rot': `${particle.rot}deg`,
              '--jc-delay': `${particle.delay}s`,
              '--jc-dur': `${particle.duration}s`,
            }
            const shapeClass =
              particle.kind === 'blob' ? 'jc-blob' : particle.kind === 'piece' ? 'jc-piece' : ''
            return (
              <span className={`jc-particle ${shapeClass}`} key={index} style={style}>
                {particle.kind === 'heart' ? <HeartParticle color={particle.color} /> : null}
                {particle.kind === 'sparkle' ? <SparkleParticle color={particle.color} /> : null}
              </span>
            )
          })}
      <img alt="" className="jc-duo" decoding="async" draggable={false} src={jellyDuo} />
    </div>
  )
}
