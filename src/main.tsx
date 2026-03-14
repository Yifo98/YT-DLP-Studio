import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MediaToolsView from './MediaToolsView'
import './index.css'

function renderFatalError(message: string) {
  const root = document.getElementById('root')
  if (!root) {
    return
  }

  root.innerHTML = `
    <div style="min-height:100vh;padding:32px;background:#07101b;color:#f6f8fb;font-family:Segoe UI,Arial,sans-serif;">
      <div style="max-width:960px;margin:0 auto;padding:24px;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(255,255,255,.04);">
        <div style="letter-spacing:.18em;font-size:12px;color:#ffb15f;">YT-DLP STUDIO</div>
        <h1 style="margin:12px 0 8px;">Renderer error</h1>
        <p style="margin:0 0 16px;color:#b9c7d6;">The UI crashed before it could render.</p>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#03070d;padding:16px;border-radius:14px;">${message}</pre>
      </div>
    </div>
  `
}

window.addEventListener('error', (event) => {
  renderFatalError(event.error?.stack || event.message || 'Unknown error')
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason)
  renderFatalError(reason)
})

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root was not found.')
}

createRoot(root).render(
  <StrictMode>
    {window.location.hash === '#media-tools' ? <MediaToolsView /> : <App />}
  </StrictMode>,
)
