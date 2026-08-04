import { EnvelopeSimple } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  getEmailVerificationStatus,
  maskEmail,
  resendEmailVerification,
  sendEmailVerification,
} from '../../api/emailVerifications'
import { AlertBanner } from '../feedback/AlertBanner'
import { Button } from '../ui/Button'

/** 재발송 버튼 잠금 시간이며 서버 기본 쿨다운(60초)과 맞춘다. */
const RESEND_COOLDOWN_MS = 60_000

/**
 * 이메일 인증 안내와 발송·재발송·완료 확인 흐름을 담은 카드다.
 *
 * 응모 게이트(FanEventDetailPage)와 마이페이지가 함께 쓴다. 인증 여부 판단은
 * 부모가 하고, 이 컴포넌트는 미인증이 확정된 뒤에만 렌더링한다.
 * 재발송 대기 시간은 서버가 준 resendAvailableAt(KST LocalDateTime)을 기준으로 센다.
 */
export function EmailVerificationNotice({
  email,
  onVerified,
}: {
  /** 안내에 표시할 이메일이며 모르면 상태 조회로 채운다. 화면에는 항상 마스킹해 보여 준다. */
  email?: string
  /** 인증 완료가 확인됐을 때 부모 화면 상태를 갱신하기 위한 콜백이다. */
  onVerified: () => void
}) {
  const [knownEmail, setKnownEmail] = useState(email)
  const [sentOnce, setSentOnce] = useState(false)
  // 서버의 resendAvailableAt(KST 문자열)을 절대 시각으로 쓰면 KST가 아닌 브라우저에서
  // 쿨다운이 최대 9시간 어긋나므로, 클라이언트 시계 기준 상대 시각으로만 센다.
  // 상수가 서버 설정(기본 60초)과 어긋나도 서버 429 처리가 흡수한다.
  const [cooldownUntil, setCooldownUntil] = useState<number>()
  const [devToken, setDevToken] = useState<string>()
  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [now, setNow] = useState(() => Date.now())

  // 이메일을 모른 채 렌더링되면(인증 완료 페이지의 실패 분기) 상태 조회로 채운다.
  // 이 조회는 기능이 없는 구버전 백엔드에서 404(→401 마스킹)가 될 수 있지만, email 없이
  // 렌더링되는 곳은 메일 링크로만 진입하는 인증 완료 페이지뿐이라 실사용 경로에서는 안전하다.
  useEffect(() => {
    if (email) {
      setKnownEmail(email)
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) return

    const controller = new AbortController()
    void getEmailVerificationStatus(token, controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return
        setKnownEmail(status.email)
        // 다른 탭에서 이미 인증을 마친 경우를 여기서 흡수한다.
        if (status.emailVerified) onVerified()
      })
      .catch(() => {
        // 표시용 이메일을 못 채워도 발송 흐름은 동작하므로 무시한다.
      })

    return () => controller.abort()
    // onVerified는 부모 리렌더마다 새 함수일 수 있어 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  // 재발송 카운트다운 동안만 1초 간격으로 시간을 갱신한다.
  const cooldownRemainingSec = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
    : 0
  const cooldownActive = cooldownRemainingSec > 0

  useEffect(() => {
    if (!cooldownActive) return

    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [cooldownActive])

  /** 인증 메일을 보낸다. 이미 한 번 보냈으면 재발송 경로를 쓴다. */
  async function handleSend() {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('로그인이 만료되었습니다. 다시 로그인해 주세요.')
      return
    }

    setSending(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const result = sentOnce
        ? await resendEmailVerification(token)
        : await sendEmailVerification(token)
      setSentOnce(true)
      setKnownEmail(result.email)
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS)
      setNow(Date.now())
      setMessage('인증 메일을 보냈어요. 메일함에서 인증 링크를 눌러 주세요.')
      // 개발 프로파일에서만 내려오는 값이며, 로컬에서 메일 없이 흐름을 확인할 때 쓴다.
      if (import.meta.env.DEV && result.devToken) setDevToken(result.devToken)
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'EMAIL_ALREADY_VERIFIED') {
        onVerified()
        return
      }
      if (reason instanceof ApiError && reason.status === 429) {
        // 서버 쿨다운이 진행 중이라는 뜻이므로 버튼도 같은 시간만큼 잠가 반복 429를 막는다.
        setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS)
        setNow(Date.now())
        setError('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.')
        return
      }
      setError(
        reason instanceof ApiError
          ? reason.message
          : '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setSending(false)
    }
  }

  /** 메일 링크를 다른 탭에서 눌렀을 사용자를 위해 인증 상태를 다시 확인한다. */
  async function handleCheck() {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('로그인이 만료되었습니다. 다시 로그인해 주세요.')
      return
    }

    setChecking(true)
    setError(undefined)
    try {
      const status = await getEmailVerificationStatus(token)
      if (status.emailVerified) {
        onVerified()
        return
      }
      setError('아직 인증이 확인되지 않았어요. 메일의 인증 링크를 누른 뒤 다시 확인해 주세요.')
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : '인증 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
          <EnvelopeSimple aria-hidden size={22} weight="duotone" />
        </span>
        <div>
          <h3 className="text-lg font-extrabold">이메일 인증이 필요해요</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
            안전한 응모를 위해 이메일 인증을 완료해 주세요.
            {knownEmail ? (
              <>
                {' '}
                인증 메일은 <strong>{maskEmail(knownEmail)}</strong> 주소로 발송됩니다.
              </>
            ) : null}
          </p>
        </div>
      </div>

      {error ? (
        <AlertBanner title="요청 실패" variant="error">
          {error}
        </AlertBanner>
      ) : null}
      {message ? (
        <AlertBanner title="발송 완료" variant="success">
          {message}
        </AlertBanner>
      ) : null}

      <div className="grid gap-2">
        <Button
          className="w-full"
          disabled={sending || cooldownRemainingSec > 0}
          loading={sending}
          onClick={() => void handleSend()}
          type="button"
        >
          {cooldownRemainingSec > 0
            ? `다시 보내기 (${cooldownRemainingSec}초 후)`
            : sentOnce
              ? '인증 메일 다시 보내기'
              : '인증 메일 보내기'}
        </Button>
        <Button
          className="w-full"
          disabled={checking}
          loading={checking}
          onClick={() => void handleCheck()}
          type="button"
          variant="secondary"
        >
          인증을 완료했어요
        </Button>
      </div>

      {devToken ? (
        <Link
          className="text-xs font-semibold text-[var(--color-text-tertiary)] underline underline-offset-4"
          to={`/email-verification?token=${encodeURIComponent(devToken)}`}
        >
          [개발용] 메일 없이 인증 링크 바로 열기
        </Link>
      ) : null}

      <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
        메일이 보이지 않으면 스팸함을 확인해 주세요. 인증 링크는 30분 동안 유효하며, 새 메일을
        보내면 이전 링크는 사용할 수 없어요.
      </p>
    </div>
  )
}
