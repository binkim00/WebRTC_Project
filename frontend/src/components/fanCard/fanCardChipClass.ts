/**
 * 기념 카드 화면에서 "골라 두는 칩"의 클래스다.
 *
 * 카드 모양·글꼴·스티커 갈래를 고르는 칩이 서로 다른 파일에 있는데, 각자 스타일을 들고 있으면
 * 같은 화면 안에서도 모양이 갈라진다. 서비스의 표준 칩(팬 응모 내역의 상태 필터)과 같은 규칙을
 * 한곳에 두고 그 세 곳이 함께 쓴다.
 *
 * 고른 칩을 **채움색 + 흰 글자**로 두는 이유: 기존 화면이 그 방식이라 사용자가 이미 익숙하고,
 * 옅은 배경에 옅은 글자를 쓰면 고른 것과 고르지 않은 것의 대비가 약해 무엇을 골랐는지 잘 보이지 않는다.
 */
export function selectableChipClass(selected: boolean): string {
  return [
    // 최소 높이를 두어 손가락으로도 누를 수 있게 한다. 서비스의 다른 칩과 같은 기준이다.
    'inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-semibold transition-colors',
    'focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]',
    selected
      ? 'border-transparent bg-[var(--color-primary-coral)] text-white'
      : 'border-[var(--color-border-control)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]',
  ].join(' ')
}
