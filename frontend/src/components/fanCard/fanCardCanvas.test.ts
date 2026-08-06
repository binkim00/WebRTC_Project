import { describe, expect, it } from 'vitest'

import { minPhotoScale } from './fanCardCanvas'

describe('minPhotoScale', () => {
  it('칸과 사진 비율이 같으면 줄일 여지가 없다', () => {
    // 가로 스트립 칸(16:9)에 통화 화면(16:9)을 넣는 경우다. 기본 배치가 곧 전체가 보이는 배치다.
    expect(minPhotoScale(1600, 900, 1280, 720)).toBeCloseTo(1)
  })

  it('가로 사진을 정사각 칸에 넣으면 9/16 까지 줄일 수 있다', () => {
    // 폴라로이드·2×2 그리드가 이 경우다. 기본 배치에서는 좌우가 잘리므로, 여기까지 줄여야
    // 두 사람이 함께 찍힌 투샷이 온전히 들어간다.
    expect(minPhotoScale(500, 500, 1280, 720)).toBeCloseTo(9 / 16)
  })

  it('가로 사진을 세로로 긴 칸에 넣으면 더 많이 줄여야 한다', () => {
    // 세로 칸(9:16)은 잘리는 양이 가장 크다. 조정 없이는 맞닿은 어깨만 남는다.
    expect(minPhotoScale(450, 800, 1280, 720)).toBeCloseTo((9 / 16) ** 2)
  })

  it('세로 사진을 가로로 넓은 칸에 넣는 반대 경우도 같은 규칙이다', () => {
    expect(minPhotoScale(800, 450, 720, 1280)).toBeCloseTo((9 / 16) ** 2)
  })

  it('크기를 알 수 없으면 줄이지 않는다', () => {
    // 사진을 아직 못 읽은 순간에도 슬라이더가 0으로 무너지지 않아야 한다.
    expect(minPhotoScale(0, 0, 1280, 720)).toBe(1)
  })
})
