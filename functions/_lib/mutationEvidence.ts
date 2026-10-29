/** Financial mutations need assertions, not words merely present in a question. */
export function assertions(text: string): string[] {
  return text.replace(/"[^"\n]*"|“[^”\n]*”/gu, '').split(/(?<=[.!?])\s+|[;\n]/u).filter(s =>
    !/\?|\b(?:if|suppose|imagine|whether|assume|can you|could you|should|not sure|don't know|do not know|have not asked)\b|giả sử|ví dụ|chưa biết|không biết|có phải|liệu/iu.test(s)) // lang-ok
}

export function zeroInterestEvidence(text: string): boolean {
  return assertions(text).some(s => !/not interest[- ]free|isn.t interest[- ]free|not zero interest/iu.test(s)
    && /interest[- ]free|zero interest|0\s*%|\bno interest\b|\bwithout interest\b|(?:không|ko|chẳng)\s+(?:(?:tính|lấy)\s+)?lãi|lãi(?: suất)?\s*(?:là|bằng|:)\s*0/iu.test(s)) // lang-ok
}

export function interestRateEvidence(text: string, rate: number): boolean {
  if (rate === 0) return zeroInterestEvidence(text)
  if (!(rate > 0 && rate <= 1000)) return false
  return assertions(text).some(s => [...s.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent|phần trăm)/giu)].some(m => Number(m[1]) === rate)) // lang-ok
}

export const passiveEvidence = (text: string) => assertions(text).some(s =>
  /dividends?|staking|rental income|rent income|interest income|earn.*interest|passive income|cổ tức|tiền cho thuê|thu nhập thụ động|lãi tiết kiệm/iu.test(s)) // lang-ok

/** Explicit BTC purchase cost only. Never infer cost from today's value or from quantity. */
export function investedBasis(text: string, symbol: string | undefined): { amount: number; currency: 'USDC' | 'VND' } | null {
  if (!/^(?:BTC|WBTC|CIRBTC)$/iu.test(symbol ?? '')) return null
  for (const s of assertions(text)) {
    const usd = s.match(/\bi (?:invested|put)\s*\$([\d,]+(?:\.\d+)?)\s*(?:into|in)\s*(?:BTC|Bitcoin)\b|\b(?:BTC|Bitcoin)\s+(?:bought|purchased)\s+for\s*\$([\d,]+(?:\.\d+)?)/iu)
    if (usd) return { amount: Number((usd[1] ?? usd[2]).replace(/,/g, '')), currency: 'USDC' }
    const vi = s.match(/(?:mình|tôi)\s+(?:đã\s+)?(?:bỏ|đầu tư|chi)\s+([\d,]+(?:\.\d+)?)\s*(triệu|nghìn)?\s*(?:VND|đồng)?\s*(?:để\s+)?(?:mua|vào)\s+(?:BTC|Bitcoin)/iu) // lang-ok
    if (vi) return { amount: Number(vi[1].replace(/,/g, '')) * (vi[2] === 'triệu' ? 1e6 : vi[2] === 'nghìn' ? 1000 : 1), currency: 'VND' } // lang-ok
  }
  return null
}

export const currentMarketValue = (text: string) => /current (?:market )?value|worth (?:now|today)|worth\s*\$?[\d,]+\s+today|giá trị (?:hiện tại|còn)|giờ.*(?:còn|giá trị)/iu.test(text) // lang-ok
