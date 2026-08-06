import { useState } from 'react'
import { ApiError } from '../../api/ApiError'
import { clearAuthSession, getAuthSession } from '../../api/authSession'
import { withdrawMyAccount } from '../../api/users'
import { Button } from '../ui/Button'
import { TextField } from '../ui/FormControls'
import { AlertBanner } from '../feedback/AlertBanner'
import { Dialog } from '../feedback/Dialog'
import { useTranslation } from '../../i18n'

/**
 * 회원탈퇴 진입점과 비밀번호 확인 대화상자를 함께 제공한다.
 *
 * 팬·인플루언서 마이페이지가 같은 흐름을 쓰므로 한 곳에 두고 재사용한다.
 * 백엔드가 탈퇴와 함께 액세스 토큰을 무효화하므로 성공 후에는 세션을 지우고 로그인 화면으로 보낸다.
 */
export function WithdrawAccountSection({
  description,
}: {
  description?: string
}) {
  const { t } = useTranslation()
  // 파라미터 기본값은 훅보다 먼저 평가되므로 기본 문구는 본문에서 정한다.
  const descriptionResolved = description ?? t('withdrawAccountSection.t7')
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  /** 대화상자를 닫고 입력값을 비운다. 처리 중에는 닫히지 않게 막는다. */
  function closeDialog() {
    if (submitting) return
    setOpen(false)
    setPassword('')
    setError(undefined)
  }

  /** 비밀번호로 본인 확인 후 탈퇴를 요청한다. 성공하면 세션을 지우고 로그인 화면으로 보낸다. */
  async function submit() {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('withdrawAccountSection.t8'))
      return
    }
    if (!password) {
      setError(t('withdrawAccountSection.t9'))
      return
    }

    setSubmitting(true)
    setError(undefined)
    try {
      await withdrawMyAccount(password, token)
      clearAuthSession()
      // 로그인 라우트는 AuthLayout 아래에 있지만 경로는 최상위 '/login'이다. '/auth/login'은 404다.
      // 탈퇴한 계정으로는 어떤 화면도 조회할 수 없어 라우터 전환 대신 전체 새로고침으로 상태를 비운다.
      window.location.replace('/login')
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(
          cause.status === 401
            ? t('withdrawAccountSection.t10')
            : cause.status === 409
              ? t('withdrawAccountSection.t11')
              : cause.message,
        )
      } else {
        setError(t('withdrawAccountSection.t12'))
      }
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          className="text-sm text-[var(--color-text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--color-error)]"
          onClick={() => setOpen(true)}
          type="button"
        >
          {t('withdrawAccountSection.t1')}
        </button>
      </div>

      <Dialog
        description={descriptionResolved}
        footer={
          <div className="flex justify-end gap-3">
            <Button disabled={submitting} onClick={closeDialog} variant="secondary">
              {t('withdrawAccountSection.t2')}
            </Button>
            <Button
              disabled={!password || submitting}
              loading={submitting}
              onClick={() => void submit()}
            >
              {t('withdrawAccountSection.t3')}
            </Button>
          </div>
        }
        onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}
        open={open}
        title={t('withdrawAccountSection.t4')}
      >
        <div className="grid gap-4">
          <TextField
            autoComplete="current-password"
            label={t('withdrawAccountSection.t5')}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
          {error ? (
            <AlertBanner title={t('withdrawAccountSection.t6')} variant="error">
              {error}
            </AlertBanner>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
