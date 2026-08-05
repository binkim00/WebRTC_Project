import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { startSocialAuth } from '../../api/oauthState'
import {
  disconnectMySocialAccount,
  getMySocialAccounts,
  toProviderPath,
  SOCIAL_PROVIDERS,
  SOCIAL_PROVIDER_LABELS,
  type SocialAccountResponse,
  type SocialProviderPath,
} from '../../api/socialAuth'
import { SocialProviderLogo } from './SocialProviderLogo'
import { AlertBanner } from '../feedback/AlertBanner'
import { Spinner } from '../feedback/Spinner'
import { Button } from '../ui/Button'

/** 연결 시각을 2026.08.05 14:00 형태로 보여 준다. */
function formatConnectedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 마이페이지의 소셜 계정 연결 관리 섹션이다.
 *
 * 이 화면이 필요한 이유: 소셜 로그인 오류 안내 중 "마이페이지에서 기존 연결을 해제한 뒤 다시
 * 연결해 주세요"(SOCIAL_PROVIDER_ALREADY_LINKED)가 있어, 이 섹션이 없으면 사용자가 갈 곳이 없다.
 *
 * 추가 연결은 로그인과 같은 공급자 왕복이 필요하므로, 돌아올 경로를 함께 넘겨 콜백 화면이
 * "로그인 흐름"이 아니라 "연결 흐름"으로 처리하게 한다.
 */
export function SocialAccountsSection({ returnTo }: { returnTo: string }) {
  const location = useLocation()
  const [accounts, setAccounts] = useState<SocialAccountResponse[]>()
  const [loadError, setLoadError] = useState<string>()
  const [busyProvider, setBusyProvider] = useState<SocialProviderPath>()
  const [actionError, setActionError] = useState<string>()
  // 콜백 화면이 연결 성공 후 넘겨주는 안내다. 새로고침하면 사라진다.
  const [connectedNotice] = useState<string | undefined>(() => {
    const state = location.state as { socialConnected?: string } | null
    return typeof state?.socialConnected === 'string' ? state.socialConnected : undefined
  })

  const load = useCallback(async (signal?: AbortSignal) => {
    const token = getAuthSession()?.accessToken
    if (!token) return

    try {
      setAccounts(await getMySocialAccounts(token, signal))
      setLoadError(undefined)
    } catch (reason) {
      if (signal?.aborted) return
      setLoadError(
        reason instanceof ApiError
          ? reason.message
          : '연결된 소셜 계정을 불러오지 못했습니다.',
      )
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  /** 공급자 화면으로 이동해 계정을 추가 연결한다. 돌아오면 콜백이 연결 API를 호출한다. */
  async function handleConnect(provider: SocialProviderPath) {
    if (busyProvider) return

    setBusyProvider(provider)
    setActionError(undefined)
    try {
      await startSocialAuth(provider, returnTo)
      // 성공하면 페이지를 떠나므로 아래는 실행되지 않는다.
    } catch (reason) {
      setActionError(
        reason instanceof ApiError
          ? reason.message
          : `${SOCIAL_PROVIDER_LABELS[provider]} 연결을 시작하지 못했습니다.`,
      )
      setBusyProvider(undefined)
    }
  }

  async function handleDisconnect(provider: SocialProviderPath) {
    const token = getAuthSession()?.accessToken
    if (!token || busyProvider) return
    if (!window.confirm(`${SOCIAL_PROVIDER_LABELS[provider]} 연결을 해제할까요?`)) return

    setBusyProvider(provider)
    setActionError(undefined)
    try {
      await disconnectMySocialAccount(provider, token)
      await load()
    } catch (reason) {
      // 마지막 로그인 수단이면 서버가 409로 막는다. 그 문구를 그대로 보여 준다.
      setActionError(
        reason instanceof ApiError
          ? reason.message
          : '연결을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
      // 목록과 화면 상태가 어긋났을 수 있으므로 최신 상태로 맞춘다.
      await load()
    } finally {
      setBusyProvider(undefined)
    }
  }

  return (
    <section aria-labelledby="social-accounts-title" className="grid gap-4">
      <div>
        <h2 className="text-[19px] font-extrabold tracking-[-0.03em]" id="social-accounts-title">
          소셜 계정 연결
        </h2>
        <p className="mt-1.5 text-[15px] font-medium text-[var(--color-text-muted)]">
          연결하면 다음부터 버튼 한 번으로 로그인할 수 있어요.
        </p>
      </div>

      {connectedNotice ? (
        <AlertBanner title="연결 완료" variant="success">
          {connectedNotice} 계정이 연결되었습니다.
        </AlertBanner>
      ) : null}
      {loadError ? (
        <AlertBanner title="연결 정보를 불러오지 못했습니다" variant="error">
          {loadError}
        </AlertBanner>
      ) : null}
      {actionError ? (
        <AlertBanner title="요청을 처리하지 못했습니다" variant="error">
          {actionError}
        </AlertBanner>
      ) : null}

      {accounts === undefined && !loadError ? (
        <div className="flex min-h-24 items-center justify-center">
          <Spinner label="연결된 소셜 계정을 불러오는 중" />
        </div>
      ) : (
        <ul className="grid gap-2.5">
          {SOCIAL_PROVIDERS.map((provider) => {
            const connected = (accounts ?? []).find(
              (account) => toProviderPath(account.provider) === provider,
            )
            const busy = busyProvider === provider

            return (
              <li
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-divider)] pb-3 last:border-b-0"
                key={provider}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {/*
                    공급자 로고. 로그인 버튼과 같은 마크를 써서 사용자가 어떤 버튼으로 연결했는지
                    바로 알아볼 수 있게 한다. 밝은 배경이라 카카오·네이버 단색 마크는
                    브랜드 색을 직접 지정한다(버튼에서는 글자색을 따랐다).
                  */}
                  <span
                    className={`flex size-7 flex-none items-center justify-center rounded-full ${
                      provider === 'kakao'
                        ? 'bg-[#FEE500] text-[#191600]'
                        : provider === 'naver'
                          ? 'bg-[#03C75A] text-white'
                          : 'border border-[var(--color-divider)] bg-white'
                    }`}
                  >
                    <SocialProviderLogo provider={provider} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-extrabold">
                      {SOCIAL_PROVIDER_LABELS[provider]}
                    </p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums text-[var(--color-text-muted)]">
                      {connected
                        ? `${formatConnectedAt(connected.connectedAt)} 연결`
                        : '연결되지 않음'}
                    </p>
                  </div>
                </div>
                {connected ? (
                  <Button
                    disabled={busy}
                    loading={busy}
                    onClick={() => void handleDisconnect(provider)}
                    size="sm"
                    variant="secondary"
                  >
                    연결 해제
                  </Button>
                ) : (
                  <Button
                    disabled={Boolean(busyProvider)}
                    loading={busy}
                    onClick={() => void handleConnect(provider)}
                    size="sm"
                    variant="outline"
                  >
                    연결하기
                  </Button>
                )}
              </li>
            )
          })}
          {/* 연결 가능한 공급자가 늘어나도 위 목록이 자동으로 따라간다. */}
        </ul>
      )}

      <p className="text-sm font-medium leading-[1.6] text-[var(--color-text-muted)]">
        마지막 로그인 수단은 해제할 수 없습니다. 비밀번호가 없는 계정이라면 소셜 연결을 하나 이상
        유지해 주세요.
      </p>
    </section>
  )
}
