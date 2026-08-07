import { useState } from 'react'
import { ApiError } from '../../api/ApiError'
import { attachmentContentUrl, uploadAttachment } from '../../api/attachments'
import { getAuthSession } from '../../api/authSession'
import { useTranslation } from '../../i18n'
import { Button } from '../ui/Button'

type CoverImageUploadProps = {
  /** 현재 커버 이미지 주소다. 비어 있으면 미리보기를 그리지 않는다. */
  value: string
  /** 업로드가 끝나 새 주소가 정해졌을 때 호출한다. */
  onChange: (url: string) => void
  /** 응모가 시작돼 기본 정보를 잠근 경우처럼 편집이 막힌 상태다. */
  disabled?: boolean
}

/**
 * 팬미팅 커버 이미지를 파일로 올리는 보조 위젯이다.
 *
 * 커버 이미지는 여전히 URL 문자열 하나(`fan_meetings.cover_image_url`)로 저장된다. 이 위젯은
 * 파일을 `attachmentType=MEETING_COVER`로 올린 뒤 받은 콘텐츠 주소를 그 칸에 대신 채워 준다.
 * 그래서 운영자는 외부 주소를 직접 붙여 넣는 방식과 파일 업로드 중 편한 쪽을 고를 수 있고,
 * 화면들은 여전히 `coverImageUrl` 하나만 보고 그림을 그린다.
 *
 * 저장하는 값은 `attachmentContentUrl`이 만든 **절대 주소**다. 서버가 주는 상대 경로를 그대로
 * 넣으면 URL 입력칸(`type="url"`)의 검증을 통과하지 못하고, 프론트와 API 오리진이 다른 로컬
 * 개발에서는 이미지도 깨진다. 배포는 프론트와 API가 같은 도메인이라 절대 주소도 같은 오리진을
 * 가리킨다.
 *
 * 커버 첨부는 게시글에 연결하지 않으므로 백엔드가 이 유형을 공개 조회로 취급한다. 덕분에
 * 비로그인 팬에게도 커버가 보인다.
 */
export function CoverImageUpload({ value, onChange, disabled = false }: CoverImageUploadProps) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string>()

  /** 고른 파일을 커버 이미지로 올리고 주소를 부모에게 넘긴다. */
  async function upload(file: File | undefined) {
    if (!file) return

    const authToken = getAuthSession()?.accessToken
    if (!authToken) {
      setError(t('coverImageUpload.s6LoginRequired'))
      return
    }

    setUploading(true)
    setError(undefined)
    try {
      const uploaded = await uploadAttachment(file, 'MEETING_COVER', authToken)
      onChange(attachmentContentUrl(uploaded.attachmentId))
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof TypeError
          ? cause.message
          : t('coverImageUpload.s6Failed'),
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-[var(--color-text-secondary)]">
          {t('coverImageUpload.s6Label')}
          <input
            // 커버는 화면에 그림으로 그려지므로 백엔드도 이미지만 받는다.
            accept="image/png,image/jpeg,image/webp"
            className="mt-1 block w-full text-sm"
            disabled={disabled || uploading}
            onChange={(event) => {
              void upload(event.target.files?.[0])
              event.target.value = ''
            }}
            type="file"
          />
        </label>
        {value ? (
          <Button
            disabled={disabled || uploading}
            onClick={() => onChange('')}
            size="sm"
            variant="ghost"
          >
            {t('coverImageUpload.s6Clear')}
          </Button>
        ) : null}
      </div>

      {uploading ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('coverImageUpload.s6Uploading')}
        </p>
      ) : null}
      {error ? <p className="text-sm font-semibold text-[var(--color-error)]">{error}</p> : null}

      {value ? (
        <img
          alt={t('coverImageUpload.s6PreviewAlt')}
          className="h-32 w-full max-w-sm rounded-lg object-cover"
          // 주소를 손으로 잘못 적었을 때 미리보기가 깨진 아이콘으로 남지 않게 숨긴다.
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
          onLoad={(event) => {
            event.currentTarget.style.display = ''
          }}
          src={value}
        />
      ) : null}
    </div>
  )
}
