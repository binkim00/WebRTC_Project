/**
 * 팬이 보는 팬미팅 공지 목록 화면이다.
 *
 * 지금까지 팬은 대기실(FanMeetingWaitingPage)에서 최신 공지 몇 건만 볼 수 있었고
 * 전체 목록을 여는 경로가 없었다. 이 화면이 그 자리를 맡는다.
 *
 * **작업 세션 S6(첨부·이미지·공지)에서 내용을 채운다.** 라우트를 미리 등록해 둔 이유는
 * 여러 세션이 동시에 router/index.tsx를 고치다 충돌하는 것을 막기 위해서다.
 * 아직 헤더 네비게이션에는 연결하지 않았다 — 화면이 실제로 동작할 때 S6이 링크를 붙인다.
 */
export function FanMeetingNoticesPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <h1 className="text-2xl font-black tracking-[-0.035em]">공지</h1>
    </main>
  )
}
