import type { NotificationType } from '../api/notifications'
import type { TranslationKey } from './locales'
import { getActiveLocale, translate } from './translate'

/**
 * 서버가 한국어로 저장해 내려주는 문장(알림 제목·본문, 순번 변경 안내)을 화면 언어에 맞춘다.
 *
 * 백엔드는 알림 문구를 만든 시점의 한국어 문장을 그대로 저장하므로, 화면 언어가 영어일 때
 * 그대로 보여 주면 영어 사용자에게 한국어가 노출된다. 원문을 기계 번역할 수는 없으니
 * 알림 `type`과 원문 속 키워드(승인·거절)·숫자(순번)를 근거로 화면 언어의 대체 문구를 만든다.
 *
 * 화면 언어가 한국어이거나 원문에 한글이 없으면(이미 영어라면) 원문을 그대로 쓴다.
 */

const KOREAN_CHAR_PATTERN = /[ㄱ-ㅎㅏ-ㅣ가-힣]/

/** 화면 언어가 한국어가 아니고 원문이 한국어일 때만 대체 문구로 바꾼다. */
function shouldLocalize(text: string): boolean {
  return getActiveLocale() !== 'ko' && KOREAN_CHAR_PATTERN.test(text)
}

/**
 * 서버가 함께 준 사전 키로 문장을 만든다.
 *
 * 키가 있으면 원문을 추정할 필요가 없다. 화면 언어가 계정 선호 언어와 달라도 키로 다시 만들면
 * 언제나 화면 언어를 따라가므로, 아래 키워드 추정보다 항상 우선한다.
 *
 * 사전에 없는 키는 translate가 키를 그대로 돌려준다. 서버가 프론트보다 먼저 새 문구를 내보낸
 * 경우이므로, 그때는 키 문자열을 화면에 보이지 않고 서버 문장으로 넘긴다.
 */
function fromServerKey(
  key: string | null | undefined,
  args: Record<string, string> | null | undefined,
): string | undefined {
  if (!key) return undefined

  const translated = translate(key as TranslationKey, args ?? undefined)
  return translated === key ? undefined : translated
}

/** 원문에서 "3번" 같은 순번 숫자를 찾는다. 없으면 undefined다. */
function extractPosition(message: string): number | undefined {
  const matched = /(\d+)\s*번/.exec(message)
  return matched ? Number(matched[1]) : undefined
}

/** 알림 제목을 화면 언어에 맞춘 문장으로 돌려준다. */
export function localizeNotificationTitle(type: NotificationType, title: string): string {
  if (!shouldLocalize(title)) return title

  switch (type) {
    case 'APPLICATION_RESULT':
      return translate('serverText.notif.applicationResult.title')
    case 'QUEUE_ORDER_ASSIGNED':
      return translate('serverText.notif.queueOrderAssigned.title')
    case 'QUEUE_CHANGE_RESULT':
      return translate('serverText.notif.queueChangeResult.title')
    case 'ENTER_NOW':
      return translate('serverText.notif.enterNow.title')
    case 'MEETING_CHANGED':
      return translate('serverText.notif.meetingChanged.title')
    case 'MEETING_CANCELED':
      return translate('serverText.notif.meetingCanceled.title')
  }
}

/**
 * 알림 본문을 화면 언어에 맞춘 문장으로 돌려준다.
 *
 * 서버가 사전 키를 함께 준 알림은 그 키로 만든다. 키가 없는 예전 알림만 원문에서 유형과
 * 키워드를 추정해 대체한다.
 */
export function localizeNotificationMessage(
  type: NotificationType,
  message: string,
  messageKey?: string | null,
  messageArgs?: Record<string, string> | null,
): string {
  const fromKey = fromServerKey(messageKey, messageArgs)
  if (fromKey) return fromKey

  if (!shouldLocalize(message)) return message

  switch (type) {
    case 'APPLICATION_RESULT':
      return translate('serverText.notif.applicationResult.message')
    case 'QUEUE_ORDER_ASSIGNED': {
      const position = extractPosition(message)
      return position === undefined
        ? translate('serverText.notif.queueOrderAssigned.message')
        : translate('serverText.notif.queueOrderAssigned.messageWithPosition', { position })
    }
    case 'QUEUE_CHANGE_RESULT':
      if (message.includes('승인')) return translate('serverText.notif.queueChangeResult.approved')
      if (message.includes('거절')) return translate('serverText.notif.queueChangeResult.rejected')
      return translate('serverText.notif.queueChangeResult.message')
    case 'ENTER_NOW':
      return translate('serverText.notif.enterNow.message')
    case 'MEETING_CHANGED':
      return translate('serverText.notif.meetingChanged.message')
    case 'MEETING_CANCELED':
      return translate('serverText.notif.meetingCanceled.message')
  }
}

/**
 * 대기실의 순번 변경 안내 문구(`lastChangeReason`)를 화면 언어에 맞춘다.
 *
 * 운영자가 직접 적은 사유는 번역할 수 없으므로, 승인·거절 같은 정형 문구만 구분해
 * 대체하고 나머지는 일반 안내 문장으로 바꾼다.
 */
export function localizeQueueChangeNotice(reason: string): string {
  if (!shouldLocalize(reason)) return reason

  if (reason.includes('승인')) return translate('serverText.queueNotice.approved')
  if (reason.includes('거절')) return translate('serverText.queueNotice.rejected')
  return translate('serverText.queueNotice.adjusted')
}
