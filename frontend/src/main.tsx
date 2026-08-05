import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { I18nProvider } from './i18n'
import { router } from './router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 라우터 바깥에 두어 모든 화면과 라우트 전환 사이에서 같은 언어 상태를 공유한다. */}
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  </StrictMode>,
)
