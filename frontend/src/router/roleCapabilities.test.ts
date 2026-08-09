import { describe, expect, it } from 'vitest'
import {
  canRoleAccessPath,
  hasRoleCapability,
  landingPathAfterLogin,
  requiredCapabilityForPath,
} from './roleCapabilities'

describe('역할별 기능 권한', () => {
  it('솔로 인플루언서는 인플루언서 업무와 팬미팅 운영을 함께 사용할 수 있다', () => {
    expect(hasRoleCapability('SOLO_INFLUENCER', 'USE_INFLUENCER_WORKSPACE')).toBe(true)
    expect(hasRoleCapability('SOLO_INFLUENCER', 'MANAGE_FAN_MEETINGS')).toBe(true)
    expect(canRoleAccessPath('/influencer/meetings', 'SOLO_INFLUENCER')).toBe(true)
    expect(canRoleAccessPath('/manager/fan-meetings/17', 'SOLO_INFLUENCER')).toBe(true)
    expect(canRoleAccessPath('/manager/events/17', 'SOLO_INFLUENCER')).toBe(true)
    expect(canRoleAccessPath('/fan-meetings/17/fans', 'SOLO_INFLUENCER')).toBe(true)
  })

  it('솔로 인플루언서에게 조직과 매니저 계정 화면은 노출하지 않는다', () => {
    expect(canRoleAccessPath('/manager/organization', 'SOLO_INFLUENCER')).toBe(false)
    expect(canRoleAccessPath('/manager/mypage', 'SOLO_INFLUENCER')).toBe(false)
    expect(canRoleAccessPath('/manager', 'SOLO_INFLUENCER')).toBe(false)
  })

  it('매니저는 팬미팅·조직·계정 운영 화면과 공용 운영 통계를 사용할 수 있다', () => {
    expect(canRoleAccessPath('/manager/fan-meetings', 'MANAGER')).toBe(true)
    expect(canRoleAccessPath('/manager/organization', 'MANAGER')).toBe(true)
    expect(canRoleAccessPath('/manager/mypage', 'MANAGER')).toBe(true)
    expect(canRoleAccessPath('/fan-meetings/17/statistics', 'MANAGER')).toBe(true)
  })

  it('팬은 팬 전용 화면만 사용하고 운영자·인플루언서 화면에는 접근하지 못한다', () => {
    expect(canRoleAccessPath('/fan/events', 'FAN')).toBe(true)
    expect(canRoleAccessPath('/manager/fan-meetings', 'FAN')).toBe(false)
    expect(canRoleAccessPath('/influencer/meetings', 'FAN')).toBe(false)
    expect(canRoleAccessPath('/fan-meetings/17/fans', 'FAN')).toBe(false)
    expect(canRoleAccessPath('/fan-meetings/17/statistics', 'FAN')).toBe(false)
  })

  it('경로를 가장 구체적인 기능 권한으로 변환하고 공개 경로는 제한하지 않는다', () => {
    expect(requiredCapabilityForPath('/manager/fan-meetings/17')).toBe('MANAGE_FAN_MEETINGS')
    expect(requiredCapabilityForPath('/manager/organization/influencers')).toBe(
      'MANAGE_ORGANIZATION',
    )
    expect(requiredCapabilityForPath('/fan-meetings/17/fans')).toBe(
      'VIEW_MEETING_OPERATIONS',
    )
    expect(requiredCapabilityForPath('/login')).toBeUndefined()
    expect(canRoleAccessPath('/login', 'FAN')).toBe(true)
  })

  it('로그인 후에는 현재 역할에 허용된 이전 URL로만 돌아간다', () => {
    expect(landingPathAfterLogin('/fan/events?status=open', 'FAN')).toBe(
      '/fan/events?status=open',
    )
    expect(landingPathAfterLogin('/manager/fan-meetings/17', 'FAN')).toBe('/')
    expect(landingPathAfterLogin('/manager/fan-meetings/17', 'MANAGER')).toBe(
      '/manager/fan-meetings/17',
    )
    expect(landingPathAfterLogin('//malicious.example', 'FAN')).toBe('/')
  })
})
