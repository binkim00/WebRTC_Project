import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { I18nProvider } from './i18n'
import { registerPreloadErrorReload } from './registerPreloadErrorReload'
import { router } from './router'

// 배포로 화면 조각이 교체되면 먼저 열어 둔 탭이 없는 파일을 받으러 가 화면이 깨진다.
// 그리기 전에 등록해 두어야 첫 화면 전환부터 스스로 복구할 수 있다.
registerPreloadErrorReload()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 라우터 바깥에 두어 모든 화면과 라우트 전환 사이에서 같은 언어 상태를 공유한다. */}
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  </StrictMode>,
)
