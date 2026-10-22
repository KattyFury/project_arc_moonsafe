// Screen 1 — Đăng nhập. Row 1 empty.

import { useLogin } from '@privy-io/react-auth'
import { Frame } from '@/components/layout/Frame'
import { Button } from '@/components/ui/kit'

export function LoginScreen() {
  const { login } = useLogin()
  return (
    <Frame>
      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center py-8">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.svg" alt="MoonSafe" width={64} height={64} />
          <h1 className="text-app-large-title text-ink">MoonSafe</h1>
          <p className="text-app-secondary text-grey max-w-[296px]">“Nên đầu tư nhưng phải có đường lui.”</p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-app-note text-grey">Email OTP · Google · Ví web3</p>
            <p className="text-app-caption text-muted">Đang chạy trên Arc Testnet</p>
          </div>
          <Button onClick={() => login()}>Đăng nhập</Button>
        </div>
      </div>
    </Frame>
  )
}
