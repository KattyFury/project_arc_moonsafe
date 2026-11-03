// Rechecks of the Crypto guide fixes, and the turns round 1 did not reach (audit 2026-11-03).
export const GUIDE_AUDIT_RECHECKS = [
  { id: 'h1-eth', category: 'core-audit', wallet: 5000, vault: 9000, profile: {"v": 2, "age": 24, "ageDeclined": false, "incomeStable": false, "dependents": 0, "soleEarner": null, "holdings": [{"id": "hj9cobt", "type": "eth", "name": "ETH", "updatedAt": 1793702670265, "priceSource": "self", "rebalanceable": true, "symbol": "ETH", "value": 20000, "currency": "USDC"}, {"id": "h7ce278", "type": "altcoin", "name": "Memecoins", "updatedAt": 1793702671379, "priceSource": "self", "rebalanceable": true, "symbol": "<UNKNOWN>", "value": 5000, "currency": "USDC"}, {"id": "hxblqd1", "type": "stable_wallet", "name": "Stablecoins kept as Safety", "updatedAt": 1793702847400, "priceSource": "self", "rebalanceable": true, "value": 3000, "currency": "USDC", "category": "safe"}], "debts": [], "debtsComplete": true, "incomes": [{"id": "ivue9x1", "name": "Part-time dev work", "monthly": 3000, "currency": "USDC", "kind": "active", "updatedAt": 1793702654759}], "expenses": [{"id": "et6rlk4", "name": "Monthly spending", "monthly": 1500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702654760}]}, lines: [ // lang-ok
    "so how much of my crypto should be btc?", // lang-ok
    "should i sell eth to buy btc so it matches?", // lang-ok
    "my btc is 0, doesnt that make the plan wrong?", // lang-ok
    "buy 1000 of cirbtc", // lang-ok
  ] },
  { id: 'h2-splits', category: 'core-audit', wallet: 5000, vault: 7500, profile: {"v": 2, "age": 35, "ageDeclined": false, "incomeStable": true, "dependents": 0, "soleEarner": null, "holdings": [{"id": "hu6xkxw", "type": "term_deposit", "name": "Term deposit", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "value": 14000, "currency": "USDC"}, {"id": "htf3oki", "type": "us_stock", "name": "VOO", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "symbol": "VOO", "value": 10000, "currency": "USDC"}, {"id": "hon6nye", "type": "btc", "name": "Bitcoin", "updatedAt": 1793702662059, "priceSource": "self", "rebalanceable": true, "symbol": "BTC", "value": 6500, "currency": "USDC"}], "debts": [], "debtsComplete": true, "incomes": [{"id": "iwps8sm", "name": "Salary", "monthly": 5000, "currency": "USDC", "kind": "active", "updatedAt": 1793702652758}], "expenses": [{"id": "ef08irk", "name": "Monthly spending", "monthly": 2500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702652760}], "noNearGoal": true, "cryptoSplit": 30}, lines: [ // lang-ok
    "i want my crypto to be 70 btc 30 eth", // lang-ok
    "make it 60 40", // lang-ok
    "what is my split now?", // lang-ok
    "i want 7 parts crypto 3 parts traditional", // lang-ok
    "i am 36 now by the way", // lang-ok
  ] },
  { id: 'h3-saver', category: 'core-audit', wallet: 3000, vault: 7500, profile: {"v": 2, "age": 35, "ageDeclined": false, "incomeStable": true, "dependents": 0, "soleEarner": null, "holdings": [], "debts": [], "debtsComplete": true, "incomes": [{"id": "iwps8sm", "name": "Salary", "monthly": 5000, "currency": "USDC", "kind": "active", "updatedAt": 1793702652758}], "expenses": [{"id": "ef08irk", "name": "Monthly spending", "monthly": 2500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702652760}], "noNearGoal": true}, lines: [ // lang-ok
    "i have nothing invested yet. i can put aside 1000 now, how do i split it?", // lang-ok
    "so how much goes to btc exactly?", // lang-ok
    "i bought 50 of a coin my friend recommended, its called PEPE", // lang-ok
    "@review-all", // lang-ok
    "i keep 5000 in my checking account. do you need to know about that?", // lang-ok
  ] },
  { id: 'h4-vi', category: 'core-audit', wallet: 5000, vault: 7500, profile: {"v": 2, "age": 35, "ageDeclined": false, "incomeStable": true, "dependents": 0, "soleEarner": null, "holdings": [{"id": "hu6xkxw", "type": "term_deposit", "name": "Term deposit", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "value": 14000, "currency": "USDC"}, {"id": "htf3oki", "type": "us_stock", "name": "VOO", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "symbol": "VOO", "value": 10000, "currency": "USDC"}, {"id": "hon6nye", "type": "btc", "name": "Bitcoin", "updatedAt": 1793702662059, "priceSource": "self", "rebalanceable": true, "symbol": "BTC", "value": 6500, "currency": "USDC"}], "debts": [], "debtsComplete": true, "incomes": [{"id": "iwps8sm", "name": "Salary", "monthly": 5000, "currency": "USDC", "kind": "active", "updatedAt": 1793702652758}], "expenses": [{"id": "ef08irk", "name": "Monthly spending", "monthly": 2500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702652760}], "noNearGoal": true}, lines: [ // lang-ok
    "mình muốn mua hết bằng eth, không mua btc được không", // lang-ok
    "mình bán nửa số btc rồi", // lang-ok
    "khoảng 3000 đô", // lang-ok
    "@review-all", // lang-ok
    "giờ mình đứng ở đâu", // lang-ok
  ] },
  { id: 'h5-locked', category: 'core-audit', wallet: 300, vault: 0, profile: {"v": 2, "age": 45, "ageDeclined": false, "incomeStable": false, "dependents": 3, "soleEarner": true, "holdings": [{"id": "hxhfyii", "type": "term_deposit", "name": "Tiền gửi có kỳ hạn 12 tháng", "updatedAt": 1793702668078, "priceSource": "self", "rebalanceable": true, "value": 150000000, "currency": "VND"}, {"id": "hvk8n1o", "type": "gold_physical", "name": "Vàng SJC", "updatedAt": 1793702668080, "priceSource": "market", "rebalanceable": true, "quantity": 2.4113059926470988, "unit": "oz"}], "debts": [{"id": "dqi9y1d", "name": "Trả góp nhà", "type": "mortgage", "balance": 800000000, "currency": "VND", "ratePct": 9, "monthlyPayment": 7000000, "updatedAt": 1793702666066, "term": "long"}, {"id": "dq2dqmf", "name": "Thẻ tín dụng", "type": "credit_card", "balance": 60000000, "currency": "VND", "ratePct": 30, "monthlyPayment": 3000000, "updatedAt": 1793702664105, "term": "short"}], "debtsComplete": false, "incomes": [{"id": "ilrml1w", "name": "Kinh doanh tự do", "monthly": 40000000, "currency": "VND", "kind": "irregular", "updatedAt": 1793702654185}], "expenses": [{"id": "em0papb", "name": "Chi tiêu hàng tháng", "monthly": 28000000, "currency": "VND", "kind": "variable", "updatedAt": 1793702654186}], "nearGoal": {"name": "school fees", "amount": 100000000, "currency": "VND", "years": 1}}, lines: [ // lang-ok
    "giờ anh đang ở đâu trong kế hoạch", // lang-ok
    "em cứ quyết hộ anh đi", // lang-ok
    "ok bắt đầu nạp 299 usdc", // lang-ok
    "@sign-deposit", // lang-ok
  ] },
]
