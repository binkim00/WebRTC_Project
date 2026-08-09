/**
 * 알림이 새로 생겼을 수 있다는 것을 앱 전체에 알리는 신호다.
 *
 * 알림 벨(NotificationBell)은 App 레이아웃에 붙어 있어 라우트를 옮겨도 재마운트되지 않고,
 * 알림을 만드는 쪽(응모 발표·순번 변경·조직 초대 화면 등)과는 부모-자식 관계가 아니다.
 * 그래서 props나 상태로 "지금 다시 읽어라"를 전달할 방법이 없다. 로그인 만료를 알리는
 * `AUTH_EXPIRED_EVENT`(api/authSession)와 같은 방식으로 window 이벤트를 쓴다.
 *
 * 이 모듈은 상수와 발신 함수만 두고 다른 모듈을 import하지 않는다. api/client가 이 신호를
 * 보내고 api/notifications를 쓰는 화면이 받는데, 상수를 그 둘 중 하나에 두면 순환 import가 된다.
 */

/** 알림 목록이 바뀌었을 수 있음을 알리는 window 이벤트 이름이다. */
export const NOTIFICATIONS_CHANGED_EVENT = 'melly:notifications-changed'

/**
 * 알림 벨에 주기를 기다리지 말고 곧바로 다시 읽으라고 알린다.
 *
 * 실제로 알림이 생겼는지는 보내는 쪽이 알 수 없다. "생겼을 수도 있다"는 신호이며,
 * 받는 쪽이 다시 조회해 확인한다.
 */
export function announceNotificationsMayHaveChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}
