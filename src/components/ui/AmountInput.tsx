interface AmountInputProps {
  value: string
  onChange: (v: string) => void
  max?: bigint         // USDC units (6 decimals)
  disabled?: boolean
  placeholder?: string
}

function formatUsdc(units: bigint, decimals = 2): string {
  if (units === 0n) return '0'
  const str = units.toString().padStart(7, '0')
  const int = str.slice(0, -6) || '0'
  const frac = str.slice(-6).slice(0, decimals)
  return `${int}.${frac}`
}

export function AmountInput({ value, onChange, max, disabled, placeholder = '0.00' }: AmountInputProps) {
  const chips = max ? [
    { label: '25%', factor: 0.25 },
    { label: '50%', factor: 0.5 },
    { label: 'Tối đa', factor: 1 },
  ] : []

  const setChip = (factor: number) => {
    if (!max) return
    const amt = (max * BigInt(Math.round(factor * 1000))) / 1000n
    onChange(formatUsdc(amt))
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">USDC</span>
      </div>
      {chips.length > 0 && (
        <div className="flex gap-2">
          {chips.map(c => (
            <button
              key={c.label}
              onClick={() => setChip(c.factor)}
              disabled={disabled}
              className="flex-1 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors disabled:opacity-40"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
