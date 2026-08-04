import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nginxConfig = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8')

describe('nginx 보안 및 캐시 설정', () => {
  it('실행 스크립트와 프레임 삽입을 제한하는 CSP를 제공한다', () => {
    expect(nginxConfig).toContain("script-src 'self'")
    expect(nginxConfig).toContain("frame-ancestors 'none'")
    expect(nginxConfig).toContain("object-src 'none'")
    expect(nginxConfig).not.toContain("'unsafe-eval'")
  })

  it('스니핑·클릭재킹·권한 오용 방지 헤더를 설정한다', () => {
    expect(nginxConfig).toContain('X-Content-Type-Options "nosniff"')
    expect(nginxConfig).toContain('X-Frame-Options "DENY"')
    expect(nginxConfig).toContain('Permissions-Policy')
    expect(nginxConfig).toContain('Strict-Transport-Security')
  })

  it('해시 정적 자산만 immutable로 장기 캐시한다', () => {
    expect(nginxConfig).toContain('~^/assets/ "public, max-age=31536000, immutable"')
    expect(nginxConfig).toContain('default "no-cache"')
  })
})
