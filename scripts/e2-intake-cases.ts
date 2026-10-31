// Option E2 probes (Hieu, 2026-10-31): the two questions in words, answered the way people type. Development cases, not a benchmark.
export const E2_INTAKE_CASES = [
  { id: 'e2-hieu-vi', category: 'intake', lines: [ // lang-ok
    'Mình muốn lập kế hoạch tài chính', // lang-ok
    '31\n600\n400\nCó 1 cô con gái\nNợ mẹ 20K$ ko lãi suất, mẹ chỉ nói mỗi tháng trả mẹ 200$, tiền đó thua lỗ cả rồi', // lang-ok
    'Mình có 2K stablecoin trong ví, 2K cash ngân hàng, vàng trị giá 2K, hết rồi. Lương đều, lâu lâu có airdrop', // lang-ok
    '@review-all',
  ] },
  { id: 'e2-en', category: 'intake', lines: [
    'I want to plan my money',
    "I'm 28, earn 3000 a month, steady, plus bonuses sometimes. I spend about 1800. No kids. Credit card 1500 at 22%, I pay 150 a month.",
    '5k in the bank, 1000 USDC, 2 shares of VOO, 0.05 BTC. I want 40/60 traditional/crypto.',
    '@review-all',
  ] },
  { id: 'e2-vnd', category: 'intake', lines: [ // lang-ok
    'Lập kế hoạch giúp mình', // lang-ok
    '25 tuổi, lương 15tr đều, tiêu 9tr, chưa vợ con, không nợ', // lang-ok
    '20tr tiết kiệm ngân hàng, 5tr USDT, 3 chỉ vàng', // lang-ok
    '@review-all',
  ] },
]
