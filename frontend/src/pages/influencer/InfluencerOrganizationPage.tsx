/**
 * 인플루언서가 자기 소속 조직과 담당 매니저를 확인하는 화면이다.
 *
 * 지금까지 조직 화면은 매니저 전용(`/manager/organization`)뿐이었고
 * MANAGE_ORGANIZATION 권한도 MANAGER에게만 있어, 인플루언서는 자기가 어느 조직에
 * 속해 있고 누가 자기 매니저인지 확인할 방법이 없었다.
 *
 * 백엔드는 이미 준비되어 있다 — `GET /api/v1/organizations/me/members`는
 * 인증만 되면 호출할 수 있다(SecurityConfig에 별도 제한 없음).
 *
 * **작업 세션 S7(조직)에서 내용을 채운다.** 라우트를 미리 등록해 둔 이유는
 * 여러 세션이 동시에 router/index.tsx를 고치다 충돌하는 것을 막기 위해서다.
 * 아직 헤더 네비게이션에는 연결하지 않았다 — 화면이 실제로 동작할 때 S7이 링크를 붙인다.
 */
export function InfluencerOrganizationPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <h1 className="text-2xl font-black tracking-[-0.035em]">내 조직</h1>
    </main>
  )
}
