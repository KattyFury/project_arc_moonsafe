// Probes for the split rules of 2026-11-01 (Hieu): the fund first, then advice only; cash, bank and stablecoins are idle money, not
// Safety; Safety is the low-risk part the user chooses (low-volatility forms only), not emergency money; never "sell to rebalance".
// Development cases, not a benchmark. Directives: see scripts/claude-reeval.ts.
export const SAFETY_CASES = [
  // Hieu's own chat of 2026-11-01, word for word where possible.
  { id: 'safety-hieu-en', category: 'safety', wallet: 37, lines: [
    'Investing',
    'Age 20, income $2 a month, steady, money now and then from airdrops, spending $1 a month, nobody relies on me, no debt.',
    '10$ in bank, 10$ in stablecoin in this wallet, 10$ in gold at current price',
    '@review-all',
    'Ok. But who said my safety is 20$?',
    'ok',
    '@sign-deposit',
    'Why do I need Safety? Can I take it out any time like the emergency fund?',
    'I keep 5 USDC as Safety',
    '@confirm-record',
    'Can I keep my gold as Safety instead?',
    'Crypto is above its share now, should I sell some?',
  ] },
  // Only bank money, Vietnamese.
  { id: 'safety-bank-vi', category: 'safety', wallet: 0, lines: [ // lang-ok
    'Mình muốn đầu tư', // lang-ok
    '27 tuổi, lương 1500$ đều, tiêu 800$ một tháng, không ai phụ thuộc, không nợ', // lang-ok
    'Mình chỉ có 10000$ trong tài khoản ngân hàng, ngoài ra không có gì', // lang-ok
    '@review-all',
    'Vậy safety của mình là 10000$ đúng không?', // lang-ok
    '@deposit 2400',
    'Giờ mình nên chia tiền thế nào?', // lang-ok
    'Mình vừa gửi tiết kiệm có kỳ hạn 2000$ làm safety', // lang-ok
    '@confirm-record',
    'Tiền gửi có kỳ hạn thì lúc cần mình rút ra lúc nào cũng được đúng không?', // lang-ok
  ] },
  // Already invested, crypto heavy, someone relies on them.
  { id: 'safety-invested-en', category: 'safety', wallet: 0, lines: [
    'Help me check my portfolio',
    "I'm 35, I earn 4000 a month, steady, I spend 2500. My wife and kid rely on me, she also works. No debt.",
    'BTC worth $12,000, ETH worth $9,000, 2000 USDC in Binance earn, and a $5,000 term deposit at my bank.',
    '@review-all',
    '@deposit 30000',
    'What should I do now?',
    'So is my term deposit my Safety? Why?',
    'Ok keep 2000 USDC as Safety',
    '@confirm-record',
    'Tell me exactly how much to buy of each thing right now.',
  ] },
]

// The turns the capped runs of 2026-11-01 did not reach, from a saved profile (fund already full).
const H = (o: Record<string, unknown>) => ({ priceSource: 'self', rebalanceable: true, updatedAt: 1, currency: 'USDC', ...o })
export const SAFETY_SEEDED_CASES = [
  { id: 'safety-seeded-vi', category: 'safety', wallet: 0, vault: 2400, profile: { v: 2, age: 27, incomeStable: true, dependents: 0, debtsComplete: true, noNearGoal: true, // lang-ok
    incomes: [{ id: 'i', name: 'Lương', monthly: 1500, currency: 'USDC', kind: 'active', updatedAt: 1 }], expenses: [{ id: 'e', name: 'Chi tiêu', monthly: 800, currency: 'USDC', kind: 'variable', updatedAt: 1 }], // lang-ok
    holdings: [H({ id: 'b', type: 'savings', name: 'Tài khoản ngân hàng', value: 10000 })] }, lines: [ // lang-ok
    'Mình vừa gửi tiết kiệm có kỳ hạn 2000$ làm safety', // lang-ok
    '@confirm-record',
  ] },
  { id: 'safety-seeded-en', category: 'safety', wallet: 0, vault: 30000, profile: { v: 2, age: 35, incomeStable: true, dependents: 2, debtsComplete: true, noNearGoal: true,
    incomes: [{ id: 'i', name: 'Salary', monthly: 4000, currency: 'USDC', kind: 'active', updatedAt: 1 }], expenses: [{ id: 'e', name: 'Spending', monthly: 2500, currency: 'USDC', kind: 'variable', updatedAt: 1 }],
    holdings: [H({ id: 'btc', type: 'btc', name: 'BTC', value: 12000 }), H({ id: 'eth', type: 'eth', name: 'ETH', value: 9000 }), H({ id: 'earn', type: 'flexible_earn', name: 'Binance Earn', value: 2000 }), H({ id: 'td', type: 'term_deposit', name: 'Term deposit', value: 5000 })] }, lines: [
    'Ok keep 2000 USDC as Safety',
    '@confirm-record',
    'Tell me exactly how much to buy of each thing right now.',
  ] },
]
