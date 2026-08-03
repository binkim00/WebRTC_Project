// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTH_SESSION_KEY,
  clearAuthSession,
  getAuthSession,
  replaceAuthSession,
  saveAuthSession,
  type LoginResponse,
} from './authSession'

const session: LoginResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 3600,
  userId: 1,
  role: 'FAN',
  nickname: '테스트 팬',
}

afterEach(() => clearAuthSession())

describe('authSession', () => {
  it('로그인 유지 선택 여부와 관계없이 토큰을 현재 탭 저장소에만 보관한다', () => {
    saveAuthSession(session, true)

    expect(window.localStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(AUTH_SESSION_KEY)).toBe(JSON.stringify(session))
    expect(getAuthSession()).toEqual(session)
  })

  it('이전 버전의 localStorage 세션을 한 번 옮기고 장기 저장 본을 제거한다', () => {
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))

    expect(getAuthSession()).toEqual(session)
    expect(window.localStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(AUTH_SESSION_KEY)).toBe(JSON.stringify(session))
  })

  it('재발급 응답으로 세션을 교체해도 localStorage에 토큰을 남기지 않는다', () => {
    replaceAuthSession({ ...session, accessToken: 'renewed-access-token' })

    expect(getAuthSession()?.accessToken).toBe('renewed-access-token')
    expect(window.localStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })
})
