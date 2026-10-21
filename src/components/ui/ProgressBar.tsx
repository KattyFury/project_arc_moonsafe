interface ProgressBarProps {
  value: number      // 0–1
  color?: string     // tailwind bg class e.g. 'bg-blue-500'
  height?: string
  showLabel?: boolean
  label?: string
}

export function ProgressBar({ value, color = 'bg-blue-500', height = 'h-2', showLabel = false, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{label ?? ''}</span>
          <span>{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${height}`}>
        <div
          className={`${color} ${height} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
