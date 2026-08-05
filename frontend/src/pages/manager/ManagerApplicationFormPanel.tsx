import { CaretDown, CaretUp, FloppyDisk, Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/ApiError'
import {
  getApplicationForm,
  saveApplicationForm,
} from '../../api/applications'
import { getAuthSession } from '../../api/authSession'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Select,
  TextField,
  Textarea,
} from '../../components'
import { toErrorMessage } from './meetingLifecycle'
import { useTranslation } from '../../i18n'

/** 백엔드가 응모 답변으로 허용하는 질문 유형은 주관식 두 가지뿐이다. */
const QUESTION_TYPE_OPTIONS = [
  { value: 'SHORT_TEXT', label: '단답형' },
  { value: 'LONG_TEXT', label: '장문형' },
]

/** 백엔드가 허용하는 응모 질문 최대 개수다. */
const MAX_QUESTIONS = 10
const MAX_FORM_DESCRIPTION_LENGTH = 2_000
const MAX_QUESTION_TEXT_LENGTH = 500

/** 응모 폼 편집기에서 사용하는 로컬 질문 상태다. */
type EditableFormQuestion = {
  key: number
  questionId?: number
  questionText: string
  questionType: 'SHORT_TEXT' | 'LONG_TEXT'
  required: boolean
}

/**
 * 팬미팅의 응모 안내문과 질문 목록을 편집한다.
 *
 * 백엔드는 응모가 시작되면 폼 수정을 거부하므로 `editable`이 false면 읽기 전용으로 표시한다.
 */
export function ManagerApplicationFormPanel({
  meetingId,
  editable,
  lockedReason,
}: {
  meetingId: string
  editable: boolean
  lockedReason?: string
}) {
  const { t } = useTranslation()
  const [formDescription, setFormDescription] = useState('')
  const [questions, setQuestions] = useState<EditableFormQuestion[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const nextKey = useRef(1)

  useEffect(() => {
    if (!meetingId) return
    const controller = new AbortController()

    getApplicationForm(meetingId, controller.signal)
      .then((response) => {
        setFormDescription(response.formDescription ?? '')
        setQuestions(toEditableQuestions(response.questions, nextKey))
        setLoaded(true)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        // 아직 폼을 만들지 않은 팬미팅이면 빈 편집기로 시작한다.
        if (cause instanceof ApiError && cause.status === 404) {
          setLoaded(true)
          return
        }
        setError(toErrorMessage(cause, '응모 폼을 불러오지 못했습니다.'))
      })

    return () => controller.abort()
  }, [meetingId])

  /** 질문 순서를 위나 아래로 한 칸 옮긴다. */
  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((items) => {
      const target = index + direction
      if (target < 0 || target >= items.length) return items
      const next = items.slice()
      const [picked] = next.splice(index, 1)
      // noUncheckedIndexedAccess에서도 범위를 벗어난 항목을 재삽입하지 않도록 방어한다.
      if (!picked) return items
      next.splice(target, 0, picked)
      return next
    })
  }

  /** 질문 하나의 일부 값만 바꾼다. */
  function updateQuestion(key: number, patch: Partial<EditableFormQuestion>) {
    setQuestions((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  /** 응모 폼 전체(안내문 + 질문 목록)를 서버에 교체 저장한다. */
  async function save(event: FormEvent) {
    event.preventDefault()

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('응모 폼을 저장하려면 먼저 로그인해 주세요.')
      return
    }
    if (questions.some((question) => !question.questionText.trim())) {
      setError('모든 질문 내용을 입력해 주세요.')
      return
    }
    if (formDescription.trim().length > MAX_FORM_DESCRIPTION_LENGTH) {
      setError(`응모 안내 문구는 ${MAX_FORM_DESCRIPTION_LENGTH}자 이내로 입력해 주세요.`)
      return
    }
    if (questions.some((question) => question.questionText.trim().length > MAX_QUESTION_TEXT_LENGTH)) {
      setError(`질문 내용은 항목당 ${MAX_QUESTION_TEXT_LENGTH}자 이내로 입력해 주세요.`)
      return
    }
    if (questions.length > MAX_QUESTIONS) {
      setError(`응모 질문은 최대 ${MAX_QUESTIONS}개까지 등록할 수 있습니다.`)
      return
    }

    setSaving(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const saved = await saveApplicationForm(
        meetingId,
        {
          formDescription: formDescription.trim() || null,
          questions: questions.map((question, index) => ({
            questionId: question.questionId ?? null,
            questionText: question.questionText.trim(),
            questionType: question.questionType,
            required: question.required,
            displayOrder: index + 1,
          })),
        },
        token,
      )
      setFormDescription(saved.formDescription ?? '')
      setQuestions(toEditableQuestions(saved.questions, nextKey))
      setMessage('응모 폼을 저장했습니다.')
    } catch (cause) {
      setError(toErrorMessage(cause, '응모 폼을 저장하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-5" onSubmit={save}>
      {!editable ? (
        <AlertBanner title={t('managerApplicationFormPanel.t1')} variant="info">
          {lockedReason ?? '응모가 시작된 뒤에는 응모 폼을 수정할 수 없습니다. 현재 내용은 확인만 가능합니다.'}
        </AlertBanner>
      ) : null}

      <Card>
        <CardHeader>
          <Badge variant="primary">{t('managerApplicationFormPanel.t2')}</Badge>
          <CardTitle as="h2" className="mt-3">{t('managerApplicationFormPanel.t3')}</CardTitle>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {t('managerApplicationFormPanel.t4')}
          </p>
        </CardHeader>
        <CardContent className="grid gap-5">
          {!loaded && !error ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{t('managerApplicationFormPanel.t5')}</p>
          ) : null}

          <Textarea
            disabled={!editable}
            label={t('managerApplicationFormPanel.t6')}
            maxLength={MAX_FORM_DESCRIPTION_LENGTH}
            onChange={(event) => setFormDescription(event.target.value)}
            placeholder={t('managerApplicationFormPanel.t7')}
            rows={3}
            value={formDescription}
          />

          {questions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--color-divider)] p-5 text-center text-sm text-[var(--color-text-secondary)]">
              {t('managerApplicationFormPanel.t8')}
            </p>
          ) : (
            <div className="grid gap-4">
              {questions.map((question, index) => (
                <div className="grid gap-4 rounded-2xl border border-[var(--color-divider)] p-5" key={question.key}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Badge variant="neutral">{t('managerApplicationFormPanel.t9')} {index + 1}</Badge>
                    {editable ? (
                      <div className="flex gap-2">
                        <Button aria-label={t('managerApplicationFormPanel.t10')} disabled={index === 0} onClick={() => moveQuestion(index, -1)} size="sm" type="button" variant="secondary">
                          <CaretUp size={15} />
                        </Button>
                        <Button aria-label={t('managerApplicationFormPanel.t11')} disabled={index === questions.length - 1} onClick={() => moveQuestion(index, 1)} size="sm" type="button" variant="secondary">
                          <CaretDown size={15} />
                        </Button>
                        <Button
                          leadingIcon={<Trash size={15} />}
                          onClick={() => setQuestions((items) => items.filter((item) => item.key !== question.key))}
                          size="sm"
                          type="button"
                          variant="danger"
                        >
                          {t('managerApplicationFormPanel.t12')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                    <TextField
                      disabled={!editable}
                      label={t('managerApplicationFormPanel.t13')}
                      maxLength={MAX_QUESTION_TEXT_LENGTH}
                      onChange={(event) => updateQuestion(question.key, { questionText: event.target.value })}
                      placeholder={t('managerApplicationFormPanel.t14')}
                      required
                      value={question.questionText}
                    />
                    <Select
                      disabled={!editable}
                      label={t('managerApplicationFormPanel.t15')}
                      onChange={(event) =>
                        updateQuestion(question.key, {
                          questionType: event.target.value === 'LONG_TEXT' ? 'LONG_TEXT' : 'SHORT_TEXT',
                        })
                      }
                      options={QUESTION_TYPE_OPTIONS}
                      value={question.questionType}
                    />
                  </div>
                  <Checkbox
                    checked={question.required}
                    disabled={!editable}
                    label={t('managerApplicationFormPanel.t16')}
                    onChange={(event) => updateQuestion(question.key, { required: event.target.checked })}
                  />
                </div>
              ))}
            </div>
          )}

          {editable ? (
            <div>
              <Button
                disabled={questions.length >= MAX_QUESTIONS}
                leadingIcon={<Plus size={17} />}
                onClick={() =>
                  setQuestions((items) => [
                    ...items,
                    { key: nextKey.current++, questionText: '', questionType: 'SHORT_TEXT', required: true },
                  ])
                }
                type="button"
                variant="secondary"
              >
                {t('managerApplicationFormPanel.t17')}{questions.length}/{MAX_QUESTIONS})
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? <AlertBanner title={t('managerApplicationFormPanel.t18')} variant="error">{error}</AlertBanner> : null}
      {message ? (
        <AlertBanner onDismiss={() => setMessage(undefined)} title={t('managerApplicationFormPanel.t19')} variant="success">
          {message}
        </AlertBanner>
      ) : null}

      {editable ? (
        <div className="flex justify-end">
          <Button disabled={!loaded} leadingIcon={<FloppyDisk size={18} />} loading={saving} type="submit">
            {t('managerApplicationFormPanel.t20')}
          </Button>
        </div>
      ) : null}
    </form>
  )
}

/** 서버 응답 질문 목록을 표시 순서대로 정렬해 편집기 상태로 바꾼다. */
function toEditableQuestions(
  questions: { questionId: number; questionText: string; questionType: string; required: boolean; displayOrder: number }[],
  nextKey: { current: number },
): EditableFormQuestion[] {
  return questions
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((question) => ({
      key: nextKey.current++,
      questionId: question.questionId,
      questionText: question.questionText,
      questionType: question.questionType === 'LONG_TEXT' ? 'LONG_TEXT' : 'SHORT_TEXT',
      required: question.required,
    }))
}
