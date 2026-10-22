// Screen 1 — Đăng nhập. Row 1 empty; logo is an empty box until the logo exists.

import { useLogin } from '@privy-io/react-auth'
import { Frame } from '@/components/layout/Frame'
import { Button } from '@/components/ui/kit'

export function LoginScreen() {
  const { login } = useLogin()
  return (
    <Frame>
      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center py-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-md border-2 border-dashed border-line" aria-label="Logo" />
          <h1 className="text-app-large-title text-ink">MoonSafe</h1>
          <p className="text-app-secondary text-grey max-w-[296px]">“Có đường lui thì mới dám liều.”</p>
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
