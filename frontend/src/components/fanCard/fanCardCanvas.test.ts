import { describe, expect, it } from 'vitest'

import { photoOffsetLimits } from './fanCardCanvas'

/**
 * 카드 사진의 기본 배치는 원본 전체를 담는 것이다(잘라 내지 않는다). 그래서 팬이 키우지 않으면
 * 밀 여지가 없고, 키운 만큼만 칸을 넘어가 그 절반까지 밀 수 있다.
 *
 * 이 계산은 카드를 그리는 쪽과 끌기를 처리하는 쪽이 함께 쓴다. 갈라지면 미리보기에서 끌던 위치와
 * 저장본이 어긋난다.
 */
describe('photoOffsetLimits', () => {
  it('키우지 않으면 밀 수 없다', () => {
    // 가로 사진(16:9)을 정사각 칸에 넣으면 위아래에 흐린 띠가 생긴다. 이때 밀어도 얻는 것이 없다.
    expect(photoOffsetLimits(500, 500, 1280, 720, 1)).toEqual({ x: 0, y: 0 })
  })

  it('두 배로 키우면 넘어간 폭의 절반까지 밀 수 있다', () => {
    // 정사각 칸에 담긴 16:9 사진을 두 배로 키우면 가로가 칸의 두 배가 되어 한계는 0.5다.
    const limits = photoOffsetLimits(500, 500, 1280, 720, 2)

    expect(limits.x).toBeCloseTo(0.5)
    // 세로는 720/1280 비율만큼만 커져 아직 칸을 넘지 않는다.
    expect(limits.y).toBeCloseTo(0.0625)
  })

  it('칸과 사진 비율이 같으면 가로세로 한계가 같다', () => {
    const limits = photoOffsetLimits(1600, 900, 1280, 720, 1.5)

    expect(limits.x).toBeCloseTo(0.25)
    expect(limits.y).toBeCloseTo(0.25)
  })

  it('세로로 긴 칸에서도 같은 규칙이다', () => {
    // 9:16 칸에 16:9 사진을 담으면 세로가 많이 남는다. 키우면 가로가 먼저 넘친다.
    const limits = photoOffsetLimits(450, 800, 1280, 720, 2)

    expect(limits.x).toBeCloseTo(0.5)
    expect(limits.y).toBe(0)
  })

  it('크기를 알 수 없으면 밀 수 없다', () => {
    // 사진을 아직 못 읽은 순간에 끌기가 들어와도 값이 튀지 않아야 한다.
    expect(photoOffsetLimits(0, 0, 1280, 720, 2)).toEqual({ x: 0, y: 0 })
    expect(photoOffsetLimits(500, 500, 0, 0, 2)).toEqual({ x: 0, y: 0 })
  })
})
