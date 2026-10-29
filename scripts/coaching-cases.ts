// Synthetic cases only: no founder/customer conversations or balances.
export const COACHING_CASES = [
  { name: 'loss without shame', text: 'I lost $12,000 in altcoins and feel stupid. I just want someone to listen.', topics: ['loss'] },
  { name: 'revenge trading', text: 'I want to win it back fast. Should I borrow to buy BTC?', topics: ['loss', 'fomo'] },
  { name: 'Vietnamese loss', text: 'Mình thua altcoin, muốn gỡ vốn thật nhanh nhưng sợ mất thêm tiền.', topics: ['loss'] }, // lang-ok
  { name: 'recovery fee', text: 'Someone says I must pay an unlock fee before I can withdraw my lost crypto. Is this normal?', topics: ['scam', 'loss'] },
  { name: 'pressure from others', text: 'Everyone is getting rich buying coins and I am afraid of missing out.', topics: ['fomo'] },
  { name: 'risk follow-up', text: 'I understand the risk. Why can several altcoins still fall together?', topics: [] },
  { name: 'ordinary beginner', text: "I am lost, I do not know where to start with saving", topics: [] },
  { name: 'ordinary network fee', text: 'What is the fee to withdraw from my emergency fund?', topics: [] },
  { name: 'Vietnamese withdrawal fee', text: 'Phí rút tiền quỹ dự phòng là bao nhiêu?', topics: [] }, // lang-ok
] as const

export const EVIDENCE_CASES: Array<{ text: string; keep: number[]; drop: number[] }> = [
  { text: 'I lost $12,000 in altcoins', keep: [], drop: [12000] },
  { text: 'I lost $12,000, but now I have $2,000 in savings', keep: [2000], drop: [12000] },
  { text: 'I borrowed $3,000 and lost $1,000', keep: [3000], drop: [1000] },
  { text: 'Mình thua 200 triệu, hiện tại có 30 triệu tiết kiệm', keep: [30], drop: [200] }, // lang-ok
  { text: 'If I had $8,000 and invested $2,000, what would happen?', keep: [], drop: [8000, 2000] },
  { text: 'Ví dụ mình có 100 triệu và đầu tư', keep: [], drop: [100] }, // lang-ok
  { text: 'My friend has $9,000 in savings', keep: [], drop: [9000] },
  { text: 'My friend has $9,000 and 2 BTC', keep: [], drop: [9000, 2] },
  { text: 'I lost $12,000 and 2 BTC', keep: [], drop: [12000, 2] },
  { text: 'My friend has $9,000, but I have $400 cash', keep: [400], drop: [9000] },
  { text: 'Explain the example "I have $7,000 in gold"', keep: [], drop: [7000] },
  { text: 'I put $1,000 into BTC', keep: [1000], drop: [] },
  { text: 'I invested $1,000 into BTC and it is down 50%', keep: [1000], drop: [50] },
  { text: 'I have 0.5 BTC and 10 shares of VOO', keep: [0.5, 10], drop: [] },
  { text: 'My mom lent me $600, no interest', keep: [600], drop: [] },
  { text: 'I spend $800 a month and pay $200 toward debt', keep: [800, 200], drop: [] },
  { text: 'I bought $2,000 of gold last year', keep: [2000], drop: [] },
  { text: 'I have $4,000 for a down payment', keep: [4000], drop: [] },
]
