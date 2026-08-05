import { useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  confirmExternalParticipantsCsv,
  downloadExternalParticipantCsvTemplate,
  previewExternalParticipantsCsv,
  type ExternalParticipantPreviewResponse,
} from '../../api/externalParticipants'
import { AlertBanner, Button, Dialog } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { useTranslation } from '../../i18n'

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof ApiError || reason instanceof TypeError ? reason.message : fallback
}

/**
 * CSV로 직접 등록(EXTERNAL_SELECTION)하는 팬미팅의 참가자 명단을 올리는 화면이다.
 *
 * 백엔드는 팬미팅이 PUBLISHED 상태이고 아직 명단을 확정하지 않았을 때만 업로드를 허용한다.
 * 생성 마법사가 발행 직후 이 화면으로 보내며, 확정하면 참가자·대기열이 만들어지고
 * 팬미팅 상태가 READY로 바뀐다 — 한 번 확정하면 같은 팬미팅에는 다시 올릴 수 없다.
 */
export function ManagerExternalParticipantsPage() {
  const { t } = useTranslation()
  const fanMeetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const navigate = useNavigate()

  const [file, setFile] = useState<File>()
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<ExternalParticipantPreviewResponse>()
  const [previewError, setPreviewError] = useState<string>()
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string>()
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string>()

  if (!fanMeetingId.trim()) {
    return (
      <InvalidRouteState
        message={t('managerExternalParticipantsPage.t1')}
        title={t('managerExternalParticipantsPage.t2')}
      />
    )
  }

  async function handleDownloadTemplate() {
    const token = getAuthSession()?.accessToken
    if (!token || downloadingTemplate) return

    setDownloadingTemplate(true)
    setTemplateError(undefined)
    try {
      const { blob, fileName } = await downloadExternalParticipantCsvTemplate(token)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch (reason) {
      setTemplateError(errorMessage(reason, t('managerExternalParticipantsPage.t34')))
    } finally {
      setDownloadingTemplate(false)
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    // 같은 파일을 다시 선택해도 change 이벤트가 발생하도록 입력값을 비운다.
    event.target.value = ''
    if (!selected) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setPreviewError(t('managerExternalParticipantsPage.t35'))
      return
    }

    setFile(selected)
    setPreview(undefined)
    setConfirmError(undefined)
    setPreviewError(undefined)
    setPreviewing(true)
    try {
      setPreview(await previewExternalParticipantsCsv(fanMeetingId, selected, token))
    } catch (reason) {
      setPreviewError(errorMessage(reason, t('managerExternalParticipantsPage.t36')))
      setFile(undefined)
    } finally {
      setPreviewing(false)
    }
  }

  function handleReset() {
    setFile(undefined)
    setPreview(undefined)
    setPreviewError(undefined)
    setConfirmError(undefined)
  }

  async function handleConfirm() {
    const token = getAuthSession()?.accessToken
    if (!token || !file || !preview?.confirmable || confirming) return

    setConfirming(true)
    setConfirmError(undefined)
    try {
      await confirmExternalParticipantsCsv(fanMeetingId, file, token)
      setConfirmDialogOpen(false)
      navigate(`/manager/fan-meetings/${fanMeetingId}`)
    } catch (reason) {
      const message = errorMessage(reason, t('managerExternalParticipantsPage.t37'))
      // 백엔드 전역 핸들러가 모든 DB 제약 위반을 회원가입용 문구로 돌려줘 이 화면과 문맥이
      // 어긋난다. 명단 확정에서는 실제로는 참가자 저장이 실패한 것이므로 상황을 설명해 준다.
      setConfirmError(
        message === 'Login ID or email is already in use.'
          ? t('managerExternalParticipantsPage.t44', { p0: message })
          : message,
      )
      // 오류가 모달 뒤에 가려지지 않도록 확인 창을 닫고 화면의 오류 배너로 보여 준다.
      setConfirmDialogOpen(false)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="grid gap-6 pb-10">
      <header>
        <Link
          className="inline-flex w-fit text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          to={`/manager/fan-meetings/${fanMeetingId}`}
        >
          {t('managerExternalParticipantsPage.t3')}
        </Link>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.05em]">{t('managerExternalParticipantsPage.t4')}</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">
          {t('managerExternalParticipantsPage.t5')}
        </p>
      </header>

      {!preview ? (
        <div className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-divider)] p-6">
          <div>
            <h2 className="text-lg font-extrabold">{t('managerExternalParticipantsPage.t6')}</h2>
            <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
              {t('managerExternalParticipantsPage.t7')} <strong>{t('managerExternalParticipantsPage.t8')}</strong>{t('managerExternalParticipantsPage.t9')} <strong>{t('managerExternalParticipantsPage.t10')}</strong> {t('managerExternalParticipantsPage.t11')}
            </p>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-divider)]">
            <div className="grid grid-cols-2 border-b border-[var(--color-divider)] bg-[var(--color-surface-page)] px-4 py-2.5 text-sm font-bold">
              <span>{t('managerExternalParticipantsPage.t12')}</span>
              <span>{t('managerExternalParticipantsPage.t13')}</span>
            </div>
            <div className="grid grid-cols-2 border-b border-[var(--color-border-row)] px-4 py-2.5 text-sm">
              <span>fan1@example.com</span>
              <span>1</span>
            </div>
            <div className="grid grid-cols-2 px-4 py-2.5 text-sm">
              <span>fan2@example.com</span>
              <span>2</span>
            </div>
          </div>

          {previewError ? (
            <AlertBanner title={t('managerExternalParticipantsPage.t14')} variant="error">
              {previewError}
            </AlertBanner>
          ) : null}
          {templateError ? (
            <AlertBanner title={t('managerExternalParticipantsPage.t15')} variant="error">
              {templateError}
            </AlertBanner>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              loading={downloadingTemplate}
              onClick={() => void handleDownloadTemplate()}
              type="button"
              variant="outline"
            >
              {t('managerExternalParticipantsPage.t16')}
            </Button>
            <label
              className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)] ${
                previewing ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              {previewing ? t('managerExternalParticipantsPage.t38') : t('managerExternalParticipantsPage.t39')}
              <input
                accept=".csv,text/csv"
                className="sr-only"
                disabled={previewing}
                onChange={(event) => void handleFileSelected(event)}
                type="file"
              />
            </label>
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            {t('managerExternalParticipantsPage.t17')}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-divider)] p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold">{t('managerExternalParticipantsPage.t18')}</h2>
              <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                {file?.name} · {preview.totalRowCount}{t('managerExternalParticipantsPage.t19')}
              </p>
            </div>
            <p className="whitespace-nowrap text-sm font-bold">
              {preview.validRowCount}{t('managerExternalParticipantsPage.t20')}
              {preview.invalidRowCount > 0
                ? t('managerExternalParticipantsPage.t45', { p0: preview.invalidRowCount })
                : t('managerExternalParticipantsPage.t40')}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-divider)] text-left text-[var(--color-text-secondary)]">
                  <th className="py-2 pr-3 font-bold">{t('managerExternalParticipantsPage.t21')}</th>
                  <th className="py-2 pr-3 font-bold">{t('managerExternalParticipantsPage.t22')}</th>
                  <th className="py-2 pr-3 font-bold">{t('managerExternalParticipantsPage.t23')}</th>
                  <th className="py-2 pr-3 font-bold">{t('managerExternalParticipantsPage.t24')}</th>
                  <th className="py-2 pr-3 text-right font-bold">{t('managerExternalParticipantsPage.t25')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr className="border-b border-[var(--color-border-row)]" key={row.rowNumber}>
                    <td className="py-2 pr-3 font-bold tabular-nums">
                      {String(row.rowNumber).padStart(2, '0')}
                    </td>
                    <td className="py-2 pr-3 [overflow-wrap:anywhere]">{row.email}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.callOrder ?? '-'}</td>
                    <td className="py-2 pr-3">{row.matchedNickname ?? '-'}</td>
                    <td
                      className={`py-2 pr-3 text-right font-bold ${
                        row.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                      }`}
                    >
                      {row.valid ? t('managerExternalParticipantsPage.t41') : (row.errorMessage ?? t('managerExternalParticipantsPage.t42'))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.fileErrors.map((fileError) => (
            <AlertBanner key={fileError.errorCode} title={t('managerExternalParticipantsPage.t26')} variant="error">
              {fileError.errorMessage}
            </AlertBanner>
          ))}
          {confirmError ? (
            <AlertBanner title={t('managerExternalParticipantsPage.t27')} variant="error">
              {confirmError}
            </AlertBanner>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={confirming} onClick={handleReset} type="button" variant="outline">
              {t('managerExternalParticipantsPage.t28')}
            </Button>
            <Button
              disabled={!preview.confirmable}
              onClick={() => setConfirmDialogOpen(true)}
              title={
                preview.confirmable
                  ? undefined
                  : t('managerExternalParticipantsPage.t43')
              }
              type="button"
            >
              {t('managerExternalParticipantsPage.t29')}
            </Button>
          </div>
          {!preview.confirmable ? (
            <p className="text-sm font-medium text-[var(--color-text-muted)]">
              {t('managerExternalParticipantsPage.t30')}
            </p>
          ) : null}
        </div>
      )}

      <Dialog
        description={t('managerExternalParticipantsPage.t31')}
        footer={
          <>
            <Button
              disabled={confirming}
              onClick={() => setConfirmDialogOpen(false)}
              variant="outline"
            >
              {t('managerExternalParticipantsPage.t32')}
            </Button>
            <Button loading={confirming} onClick={() => void handleConfirm()}>
              {t('managerExternalParticipantsPage.t33')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!confirming) setConfirmDialogOpen(open)
        }}
        open={confirmDialogOpen}
        title={t('managerExternalParticipantsPage.t46', { p0: preview?.validRowCount ?? 0 })}
      />
    </div>
  )
}
