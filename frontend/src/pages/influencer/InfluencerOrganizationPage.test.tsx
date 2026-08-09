// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  getMyOrganization: vi.fn(),
}))

vi.mock('../../api/authSession', () => ({ getAuthSession: mocks.getAuthSession }))
vi.mock('../../api/organizations', () => ({ getMyOrganization: mocks.getMyOrganization }))

const { InfluencerOrganizationPage } = await import('./InfluencerOrganizationPage')

const organization = {
  organizationId: 3,
  name: '멜리 엔터테인먼트',
  businessNumber: null,
  representativeName: '김대표',
  contactEmail: 'hello@melly.test',
  contactPhone: '02-1234-5678',
  logoUrl: null,
  description: null,
  status: 'ACTIVE',
  createdAt: '2026-01-05T09:00:00+09:00',
}

/**
 * 조직 구성원 한 건을 만든다.
 *
 * @param overrides 기본값을 덮어쓸 필드다. 최소한 식별자와 역할은 테스트마다 다르게 준다.
 * @return 활성 구성원 응답
 */
function member(overrides: Record<string, unknown>) {
  return {
    organizationMemberId: 1,
    userId: 1,
    nickname: '구성원',
    profileImageUrl: null,
    userRole: 'INFLUENCER',
    memberType: 'INFLUENCER',
    status: 'ACTIVE',
    joinedAt: '2026-03-02T10:00:00+09:00',
    leftAt: null,
    ...overrides,
  }
}

/**
 * 실제 사용처와 같이 I18nProvider와 라우터 안에서 화면을 그린다.
 * 한국어 문구로 요소를 찾으므로 저장된 언어를 ko로 고정한다.
 */
function renderPage() {
  window.localStorage.setItem('melly-locale', 'ko')
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/influencer/organization']}>
        <InfluencerOrganizationPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAuthSession.mockReturnValue({
    accessToken: 'token',
    role: 'INFLUENCER',
    userId: 42,
  })
})

describe('InfluencerOrganizationPage', () => {
  /** 소속이 있으면 조직명과 담당 매니저, 본인 표시가 함께 보여야 한다. */
  it('소속 조직과 담당 매니저를 보여 준다', async () => {
    mocks.getMyOrganization.mockResolvedValue({
      organization,
      members: [
        member({ organizationMemberId: 10, userId: 7, nickname: '박매니저', userRole: 'MANAGER', memberType: 'MANAGER' }),
        member({ organizationMemberId: 11, userId: 42, nickname: '본인닉네임' }),
        member({ organizationMemberId: 12, userId: 43, nickname: '동료인플루언서' }),
      ],
    })

    renderPage()

    expect(await screen.findByText('멜리 엔터테인먼트')).toBeTruthy()
    expect(screen.getByText('박매니저')).toBeTruthy()
    expect(screen.getByText('동료인플루언서')).toBeTruthy()
    // 목록에서 본인을 구분할 수 있어야 한다.
    expect(screen.getByText('나')).toBeTruthy()
    // 비어 있는 선택 입력(사업자등록번호 등)이 있어도 화면이 오류로 바뀌지 않는다.
    expect(screen.getByText('hello@melly.test')).toBeTruthy()
  })

  /** 활성 소속이 없으면 백엔드가 400을 주고 api 계층이 null로 바꾼다. 그때 초대 안내를 띄운다. */
  it('소속이 없는 인플루언서에게 초대 링크 안내를 보여 준다', async () => {
    mocks.getMyOrganization.mockResolvedValue(null)

    renderPage()

    expect(await screen.findByText('아직 소속된 조직이 없습니다')).toBeTruthy()
  })

  /** 1인 인플루언서는 조직 가입 대상이 아니므로(백엔드가 INFLUENCER만 허용) 다른 안내를 준다. */
  it('1인 인플루언서에게는 소속사 없이 활동한다고 안내한다', async () => {
    mocks.getAuthSession.mockReturnValue({
      accessToken: 'token',
      role: 'SOLO_INFLUENCER',
      userId: 55,
    })
    mocks.getMyOrganization.mockResolvedValue(null)

    renderPage()

    expect(await screen.findByText('1인 인플루언서는 소속사 없이 활동합니다')).toBeTruthy()
  })
})
