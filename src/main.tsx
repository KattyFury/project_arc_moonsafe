/*
 *  Built with Arc Studio — https://studio.arc.io
 */

import './tracing'
import './console-capture'

import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { Toaster } from 'sonner'
import { config } from './config'
import { PRIVY_APP_ID, privyConfig } from './privyConfig'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

// Catches Privy init failures (e.g. bad app id) instead of a blank page.
class PrivyErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex items-center justify-center p-4 bg-ground">
          <div className="w-[312px] max-w-full rounded-md bg-ground shadow-y2 p-4 flex flex-col gap-2">
            <h2 className="text-app-title-card text-ink">Không khởi động được</h2>
            <p className="text-app-note text-grey">Đăng nhập (Privy) chưa được cấu hình đúng. Tải lại trang, nếu vẫn lỗi hãy báo cho đội MoonSafe.</p>
            <p className="mono text-app-caption text-muted break-all">{this.state.error}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyErrorBoundary>
      <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={config}>
            <App />
            <Toaster position="top-center" />
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    </PrivyErrorBoundary>
  </StrictMode>,
)
