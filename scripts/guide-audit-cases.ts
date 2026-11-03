// What the Crypto guide could break (Hieu, 2026-11-03: 2M Haiku tokens): two kinds of 70/30, the cirBTC offer, people who hold no BTC, locked users.
export const GUIDE_AUDIT_CASES = [
  { id: 'g1-eth-no-btc', category: 'core-audit', wallet: 5000, vault: 9000, profile: {"v": 2, "age": 24, "ageDeclined": false, "incomeStable": false, "dependents": 0, "soleEarner": null, "holdings": [{"id": "hj9cobt", "type": "eth", "name": "ETH", "updatedAt": 1793702670265, "priceSource": "self", "rebalanceable": true, "symbol": "ETH", "value": 20000, "currency": "USDC"}, {"id": "h7ce278", "type": "altcoin", "name": "Memecoins", "updatedAt": 1793702671379, "priceSource": "self", "rebalanceable": true, "symbol": "<UNKNOWN>", "value": 5000, "currency": "USDC"}, {"id": "hxblqd1", "type": "stable_wallet", "name": "Stablecoins kept as Safety", "updatedAt": 1793702847400, "priceSource": "self", "rebalanceable": true, "value": 3000, "currency": "USDC", "category": "safe"}], "debts": [], "debtsComplete": true, "incomes": [{"id": "ivue9x1", "name": "Part-time dev work", "monthly": 3000, "currency": "USDC", "kind": "active", "updatedAt": 1793702654759}], "expenses": [{"id": "et6rlk4", "name": "Monthly spending", "monthly": 1500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702654760}]}, lines: [ // lang-ok
    "i hold eth and no btc, do i have to buy btc?", // lang-ok
    "so how much of my crypto should be btc?", // lang-ok
    "i prefer only eth in my crypto, is that ok", // lang-ok
    "where do i stand", // lang-ok
    "crypto", // lang-ok
    "make it all of it, buy the full amount", // lang-ok
    "is my usdc part of the 3 parts?", // lang-ok
    "should i sell eth to buy btc so it matches 7 3?", // lang-ok
    "what about memecoins in the 3 parts", // lang-ok
    "my btc part is 0, doesnt that make the plan wrong?", // lang-ok
  ] },
  { id: 'g2-two-splits', category: 'core-audit', wallet: 5000, vault: 7500, profile: {"v": 2, "age": 35, "ageDeclined": false, "incomeStable": true, "dependents": 0, "soleEarner": null, "holdings": [{"id": "hu6xkxw", "type": "term_deposit", "name": "Term deposit", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "value": 14000, "currency": "USDC"}, {"id": "htf3oki", "type": "us_stock", "name": "VOO", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "symbol": "VOO", "value": 10000, "currency": "USDC"}, {"id": "hon6nye", "type": "btc", "name": "Bitcoin", "updatedAt": 1793702662059, "priceSource": "self", "rebalanceable": true, "symbol": "BTC", "value": 6500, "currency": "USDC"}], "debts": [], "debtsComplete": true, "incomes": [{"id": "iwps8sm", "name": "Salary", "monthly": 5000, "currency": "USDC", "kind": "active", "updatedAt": 1793702652758}], "expenses": [{"id": "ef08irk", "name": "Monthly spending", "monthly": 2500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702652760}], "noNearGoal": true, "cryptoSplit": 30}, lines: [ // lang-ok
    "i want my crypto to be 70 btc 30 eth", // lang-ok
    "actually 50 btc 50 eth inside crypto", // lang-ok
    "make it 60 40", // lang-ok
    "what is my split now?", // lang-ok
    "set traditional 80 crypto 20", // lang-ok
    "and within crypto, 90 btc 10 sol", // lang-ok
    "whats the difference between the 70/30 and the 7 parts thing", // lang-ok
    "i want 7 parts crypto 3 parts traditional", // lang-ok
    "what are my numbers now", // lang-ok
    "i am 36 now by the way", // lang-ok
  ] },
  { id: 'g3-new-saver', category: 'core-audit', wallet: 3000, vault: 7500, profile: {"v": 2, "age": 35, "ageDeclined": false, "incomeStable": true, "dependents": 0, "soleEarner": null, "holdings": [], "debts": [], "debtsComplete": true, "incomes": [{"id": "iwps8sm", "name": "Salary", "monthly": 5000, "currency": "USDC", "kind": "active", "updatedAt": 1793702652758}], "expenses": [{"id": "ef08irk", "name": "Monthly spending", "monthly": 2500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702652760}], "noNearGoal": true}, lines: [ // lang-ok
    "i have nothing invested yet. i can put aside 1000 now, how do i split it?", // lang-ok
    "so how much goes to btc exactly?", // lang-ok
    "crypto", // lang-ok
    "yes", // lang-ok
    "can i buy 100 instead", // lang-ok
    "i bought 50 of a coin my friend recommended, its called PEPE", // lang-ok
    "@review-all", // lang-ok
    "i keep 5000 in my checking account. do you need to know about that?", // lang-ok
    "what interest does the vault pay me?", // lang-ok
    "you pick for me, which coin for the 3 parts?", // lang-ok
  ] },
  { id: 'g4-vi-guide', category: 'core-audit', wallet: 5000, vault: 7500, profile: {"v": 2, "age": 35, "ageDeclined": false, "incomeStable": true, "dependents": 0, "soleEarner": null, "holdings": [{"id": "hu6xkxw", "type": "term_deposit", "name": "Term deposit", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "value": 14000, "currency": "USDC"}, {"id": "htf3oki", "type": "us_stock", "name": "VOO", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "symbol": "VOO", "value": 10000, "currency": "USDC"}, {"id": "hon6nye", "type": "btc", "name": "Bitcoin", "updatedAt": 1793702662059, "priceSource": "self", "rebalanceable": true, "symbol": "BTC", "value": 6500, "currency": "USDC"}], "debts": [], "debtsComplete": true, "incomes": [{"id": "iwps8sm", "name": "Salary", "monthly": 5000, "currency": "USDC", "kind": "active", "updatedAt": 1793702652758}], "expenses": [{"id": "ef08irk", "name": "Monthly spending", "monthly": 2500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702652760}], "noNearGoal": true}, lines: [ // lang-ok
    "phần crypto của mình nên chia sao", // lang-ok
    "top 10 là gì, có cho mình danh sách không", // lang-ok
    "usdt có tính vào 3 phần không", // lang-ok
    "mình muốn mua hết bằng eth, không mua btc được không", // lang-ok
    "chọn crypto", // lang-ok
    "đồng ý", // lang-ok
    "em cứ quyết hộ anh đi, chia tiền thế nào em làm luôn cho anh", // lang-ok
    "mình bán nửa số btc rồi", // lang-ok
    "khoảng 3000 đô", // lang-ok
    "@review-all", // lang-ok
  ] },
  { id: 'g5-locked', category: 'core-audit', wallet: 300, vault: 0, profile: {"v": 2, "age": 45, "ageDeclined": false, "incomeStable": false, "dependents": 3, "soleEarner": true, "holdings": [{"id": "hxhfyii", "type": "term_deposit", "name": "Tiền gửi có kỳ hạn 12 tháng", "updatedAt": 1793702668078, "priceSource": "self", "rebalanceable": true, "value": 150000000, "currency": "VND"}, {"id": "hvk8n1o", "type": "gold_physical", "name": "Vàng SJC", "updatedAt": 1793702668080, "priceSource": "market", "rebalanceable": true, "quantity": 2.4113059926470988, "unit": "oz"}], "debts": [{"id": "dqi9y1d", "name": "Trả góp nhà", "type": "mortgage", "balance": 800000000, "currency": "VND", "ratePct": 9, "monthlyPayment": 7000000, "updatedAt": 1793702666066, "term": "long"}, {"id": "dq2dqmf", "name": "Thẻ tín dụng", "type": "credit_card", "balance": 60000000, "currency": "VND", "ratePct": 30, "monthlyPayment": 3000000, "updatedAt": 1793702664105, "term": "short"}], "debtsComplete": false, "incomes": [{"id": "ilrml1w", "name": "Kinh doanh tự do", "monthly": 40000000, "currency": "VND", "kind": "irregular", "updatedAt": 1793702654185}], "expenses": [{"id": "em0papb", "name": "Chi tiêu hàng tháng", "monthly": 28000000, "currency": "VND", "kind": "variable", "updatedAt": 1793702654186}], "nearGoal": {"name": "school fees", "amount": 100000000, "currency": "VND", "years": 1}}, lines: [ // lang-ok
    "what is the 7 parts btc thing, how much btc should i buy now?", // lang-ok
    "which coins should i buy for my 3 parts?", // lang-ok
    "i want to put my 20 trieu into eth this month", // lang-ok
    "giờ anh đang ở đâu trong kế hoạch", // lang-ok
    "em cứ quyết hộ anh đi", // lang-ok
    "ok bắt đầu nạp 299 usdc", // lang-ok
    "@sign-deposit", // lang-ok
    "tháng sau anh trả hết thẻ rồi, thẻ về 0", // lang-ok
    "@review-all", // lang-ok
  ] },
]
