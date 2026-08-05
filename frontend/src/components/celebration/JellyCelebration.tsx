import { cn } from '../ui/cn'

/**
 * 당첨 결과 화면 상단의 장식형 축하 연출이다.
 *
 * `FanApplicationResultPage`가 당첨 문구 위에 배치한다. **정보가 아니라 배경 장식**이므로
 * 스크린 리더에서 감추고(`aria-hidden`), 높이는 호출자가 className으로 정한 범위 안에만 머문다.
 * 포인터 이벤트를 받지 않아 아래의 버튼·링크를 가리지 않는다.
 *
 * 모션은 프로젝트에 이미 있는 `jelly-soft`(index.css) 언어를 따라 부드럽게 눌리는 형태로 두었다.
 * `prefers-reduced-motion: reduce`는 index.css의 전역 규칙이 애니메이션을 사실상 정지시키므로
 * 이 컴포넌트에 별도 분기를 두지 않는다.
 *
 * 원 작성자(김경린)의 구현이 커밋에 포함되지 않아 dev 서버가 이 import에서 멈춰 있었다.
 * 화면을 다시 띄우기 위해 같은 인터페이스(className 하나)로 채운 것이므로, 원본 연출이
 * 복구되면 이 파일을 그대로 대체하면 된다.
 */
export function JellyCelebration({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none relative w-full select-none', className)}
    >
      {/* 중앙의 젤리 덩어리 — 코랄 계열 그라데이션으로 브랜드 색을 한 번만 강조한다. */}
      <div className="absolute left-1/2 top-1/2 aspect-square h-[62%] -translate-x-1/2 -translate-y-1/2">
        <div
          className="size-full rounded-[42%_58%_54%_46%/48%_44%_56%_52%] opacity-90"
          style={{
            background:
              'radial-gradient(65% 65% at 32% 28%, var(--color-primary-coral-highlight), var(--color-primary-coral) 72%)',
            animation: 'jelly-soft 2600ms cubic-bezier(0.16, 1, 0.3, 1) infinite',
          }}
        />
        {/* 광택 하이라이트 — 젤리 질감을 만드는 흰 반사다. */}
        <div className="absolute left-[22%] top-[18%] size-[24%] rounded-full bg-white/55 blur-[2px]" />
      </div>

      {/* 주변에 흩어지는 축하 조각들. 위치·크기·지연을 조금씩 달리해 규칙적으로 보이지 않게 한다. */}
      {CONFETTI.map((piece) => (
        <span
          className={cn('absolute block rounded-full', piece.tone)}
          key={piece.key}
          style={{
            left: piece.left,
            top: piece.top,
            width: piece.size,
            height: piece.size,
            animation: `jelly-celebration-float ${piece.duration} ease-in-out ${piece.delay} infinite`,
          }}
        />
      ))}

      {/*
        떠오르는 조각의 keyframes는 이 컴포넌트만 쓰므로 전역 index.css를 늘리지 않고 여기에 둔다.
        같은 이름이 두 번 정의되어도 내용이 같아 문제가 없다.
      */}
      <style>{`
        @keyframes jelly-celebration-float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.75; }
          50% { transform: translateY(-12px) scale(1.12); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/** 축하 조각의 배치값이다. 렌더마다 흔들리지 않도록 상수로 고정한다. */
const CONFETTI = [
  { key: 'a', left: '18%', top: '24%', size: '14px', tone: 'bg-[var(--color-primary-coral)]/70', duration: '2800ms', delay: '0ms' },
  { key: 'b', left: '30%', top: '68%', size: '10px', tone: 'bg-[var(--color-primary-coral-highlight)]/75', duration: '3200ms', delay: '240ms' },
  { key: 'c', left: '68%', top: '20%', size: '11px', tone: 'bg-[var(--color-primary-coral-highlight)]/70', duration: '3000ms', delay: '480ms' },
  { key: 'd', left: '78%', top: '62%', size: '15px', tone: 'bg-[var(--color-primary-coral)]/65', duration: '2600ms', delay: '120ms' },
  { key: 'e', left: '48%', top: '12%', size: '8px', tone: 'bg-[var(--color-primary-coral-highlight)]/80', duration: '3400ms', delay: '600ms' },
  { key: 'f', left: '58%', top: '78%', size: '9px', tone: 'bg-[var(--color-primary-coral)]/60', duration: '2900ms', delay: '360ms' },
] as const
