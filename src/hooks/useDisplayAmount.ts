// Formats a USDC bigint (6-decimal) for display based on app language:
//   'en' → "1,234.56 USDC"
//   'vi' → "31,234,567 ₫"

import { useCallback } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { formatUsdc } from '@/hooks/useVault'

export function useDisplayAmount() {
  const { language } = useLanguage()
  const { usdcToVnd } = useExchangeRate()

  const display = useCallback((usdc: bigint | undefined | null, opts?: { unit?: boolean }): string => {
    if (usdc === undefined || usdc === null) return '–'
    if (language === 'vi') {
      const vnd = usdcToVnd(usdc)
      const formatted = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(vnd))
      return opts?.unit === false ? formatted : formatted + ' ₫'
    }
    const formatted = formatUsdc(usdc)
    return opts?.unit === false ? formatted : formatted + ' USDC'
  }, [language, usdcToVnd])

  const unit = language === 'vi' ? '₫' : 'USDC'

  return { display, unit, language }
}
