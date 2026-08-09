import { describe, expect, it } from 'vitest'

import { fillPhotoSlots } from './fanCardLayoutOptions'

describe('fillPhotoSlots', () => {
  /** 사진이 칸 수만큼 있으면 앞에서부터 한 장씩 채운다. */
  it('사진이 넉넉하면 서로 다른 사진으로 칸을 채운다', () => {
    expect(fillPhotoSlots([], 4, 6)).toEqual([0, 1, 2, 3])
  })

  /** 사진이 모자라면 빈 칸을 남기지 않고 같은 사진을 번갈아 다시 쓴다. */
  it('사진 두 장으로 네 칸을 채우면 두 장이 번갈아 들어간다', () => {
    expect(fillPhotoSlots([], 4, 2)).toEqual([0, 1, 0, 1])
  })

  /** 한 장뿐이면 모든 칸이 그 사진으로 채워진다. */
  it('사진 한 장으로 네 칸을 채우면 모든 칸이 같은 사진이 된다', () => {
    expect(fillPhotoSlots([], 4, 1)).toEqual([0, 0, 0, 0])
  })

  /** 이미 고른 순서는 그대로 두고 뒤쪽 빈 칸만 채운다. */
  it('팬이 고른 순서를 유지한 채 남은 칸만 채운다', () => {
    expect(fillPhotoSlots([1], 4, 2)).toEqual([1, 0, 1, 0])
  })

  /** 칸보다 많이 고른 상태로 좁은 레이아웃으로 바꾸면 앞에서부터 잘라 쓴다. */
  it('칸 수보다 많이 고른 경우 앞에서부터 자른다', () => {
    expect(fillPhotoSlots([3, 2, 1, 0], 2, 4)).toEqual([3, 2])
  })

  /** 사진이 없거나 칸이 없으면 채울 것이 없다. */
  it('사진이 없거나 문구 전용이면 빈 배열을 준다', () => {
    expect(fillPhotoSlots([], 4, 0)).toEqual([])
    expect(fillPhotoSlots([0, 1], 0, 4)).toEqual([])
  })
})
