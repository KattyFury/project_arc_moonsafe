// Number formatting + parsing. The UI is English (since 2026-10-24), so numbers use en-US
// separators everywhere: 3,200.50 (comma = thousands, dot = decimals).

import { parseUnits } from 'viem'

export const DASH = '–'

/** Arc native USDC has 18 decimals; the app works in 6-decimal USDC units. */
export const NATIVE_PER_USDC6 = 1_000_000_000_000n
export const nativeToUsdc6 = (n: bigint) => n / NATIVE_PER_USDC6
export const usdc6ToNative = (u: bigint) => u * NATIVE_PER_USDC6

const nf = (max: number, min = 0) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max })

/** 6-decimal USDC units → "3,200.5" (no unit). */
export function formatUsdcNumber(units: bigint, maxFrac = 2): string {
  const neg = units < 0n
  const abs = neg ? -units : units
  const whole = abs / 1_000_000n
  const frac = Number(abs % 1_000_000n) / 1_000_000
  const s = nf(maxFrac).format(Number(whole) + frac)
  return neg ? `-${s}` : s
}

export function formatUsdc(units: bigint | null | undefined, maxFrac = 2): string {
  if (units === null || units === undefined) return DASH
  return `${formatUsdcNumber(units, maxFrac)} USDC`
}

/** A value in dollars: 6-decimal units → "$3,200.5". For the token that moves onchain use formatUsdc. */
export function formatUsd(units: bigint | null | undefined, maxFrac = 2): string {
  if (units === null || units === undefined) return DASH
  const s = formatUsdcNumber(units, maxFrac)
  return s.startsWith('-') ? `-$${s.slice(1)}` : `$${s}`
}

export function formatVnd(vnd: number | null | undefined): string {
  if (vnd === null || vnd === undefined || !Number.isFinite(vnd)) return DASH
  return `${nf(0).format(Math.round(vnd))} ₫`
}

export function formatNumber(n: number | null | undefined, maxFrac = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH
  return nf(maxFrac).format(n)
}

export function formatPercent(n: number | null | undefined, maxFrac = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH
  return `${nf(maxFrac).format(n)}%`
}

/** Keeps only digits and one decimal point (thousands commas are dropped). Max 6 decimals. */
export function cleanUsdcInput(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '')
  const i = s.indexOf('.')
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 6)
  s = s.replace(/^0+(?=\d)/, '')
  return s
}

/** "1234.5" → 1234500000n (6-decimal units). Invalid / empty → 0n. */
export function parseUsdcInput(s: string): bigint {
  const v = s
  if (!v || v === '.' || !/^\d*\.?\d*$/.test(v)) return 0n
  try { return parseUnits(v.endsWith('.') ? v.slice(0, -1) || '0' : v, 6) } catch { return 0n }
}

/** 6-decimal units → editable input string ("1234.5"), truncated (never rounded up). */
export function usdcToInput(units: bigint): string {
  if (units <= 0n) return ''
  const whole = units / 1_000_000n
  let frac = (units % 1_000_000n).toString().padStart(6, '0').slice(0, 2).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

/** "12,000,000" → 12000000; empty → null. */
export function parseVndInput(s: string): number | null {
  const digits = s.replace(/\D/g, '')
  if (!digits) return null
  return Number(digits)
}

export function shortAddress(a: string | null | undefined): string {
  if (!a) return DASH
  return `${a.slice(0, 4)}…${a.slice(-2)}`
}
