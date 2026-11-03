// Later turns of the five audit people, from the state round 2 reached (audit 2026-11-03).
export const CORE_AUDIT_TAILS = [
  { id: 'a1-tail', category: 'core-audit', wallet: 0, vault: 9000, profile: {"v": 2, "age": 24, "ageDeclined": false, "incomeStable": false, "dependents": 0, "soleEarner": null, "holdings": [{"id": "hj9cobt", "type": "eth", "name": "ETH", "updatedAt": 1793702670265, "priceSource": "self", "rebalanceable": true, "symbol": "ETH", "value": 20000, "currency": "USDC"}, {"id": "h7ce278", "type": "altcoin", "name": "Memecoins", "updatedAt": 1793702671379, "priceSource": "self", "rebalanceable": true, "symbol": "<UNKNOWN>", "value": 5000, "currency": "USDC"}], "debts": [], "debtsComplete": true, "incomes": [{"id": "ivue9x1", "name": "Part-time dev work", "monthly": 3000, "currency": "USDC", "kind": "active", "updatedAt": 1793702654759}], "expenses": [{"id": "et6rlk4", "name": "Monthly spending", "monthly": 1500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702654760}]}, lines: [ // lang-ok
    "i want my split to be 40 traditional 60 crypto", // lang-ok
    "what about 100% crypto, im 24, ive got time, its my money", // lang-ok
    "ok then 70 traditional 30 crypto", // lang-ok
    "is usdc in my wallet safety?", // lang-ok
    "ok keep 3000 usdc as safety", // lang-ok
    "@confirm-record", // lang-ok
    "where do i stand now", // lang-ok
    "eth dumped 30% today, should i buy more or sell?", // lang-ok
    "should i sell my memecoins since crypto is way over its target", // lang-ok
  ] },
  { id: 'a2-tail', category: 'core-audit', wallet: 300, vault: 0, profile: {"v": 2, "age": 45, "ageDeclined": false, "incomeStable": false, "dependents": 3, "soleEarner": true, "holdings": [{"id": "hxhfyii", "type": "term_deposit", "name": "Tiền gửi có kỳ hạn 12 tháng", "updatedAt": 1793702668078, "priceSource": "self", "rebalanceable": true, "value": 150000000, "currency": "VND"}, {"id": "hvk8n1o", "type": "gold_physical", "name": "Vàng SJC", "updatedAt": 1793702668080, "priceSource": "market", "rebalanceable": true, "quantity": 2.4113059926470988, "unit": "oz"}], "debts": [{"id": "dqi9y1d", "name": "Trả góp nhà", "type": "mortgage", "balance": 800000000, "currency": "VND", "ratePct": 9, "monthlyPayment": 7000000, "updatedAt": 1793702666066, "term": "long"}, {"id": "dq2dqmf", "name": "Thẻ tín dụng", "type": "credit_card", "balance": 60000000, "currency": "VND", "ratePct": 30, "monthlyPayment": 3000000, "updatedAt": 1793702664105, "term": "short"}], "debtsComplete": false, "incomes": [{"id": "ilrml1w", "name": "Kinh doanh tự do", "monthly": 40000000, "currency": "VND", "kind": "irregular", "updatedAt": 1793702654185}], "expenses": [{"id": "em0papb", "name": "Chi tiêu hàng tháng", "monthly": 28000000, "currency": "VND", "kind": "variable", "updatedAt": 1793702654186}], "nearGoal": {"name": "school fees", "amount": 100000000, "currency": "VND", "years": 1}}, lines: [ // lang-ok
    "anh muốn mua thêm bitcoin 20 triệu tháng này được không", // lang-ok
    "nhà 3 tỷ có tính vào tài sản để chia theo tuổi không", // lang-ok
    "ok anh bắt đầu nạp quỹ thế nào, anh có 300 usdc trong ví", // lang-ok
    "@sign-deposit", // lang-ok
    "vàng có tính là safety được không, vàng an toàn mà", // lang-ok
    "em cứ quyết hộ anh đi, chia tiền thế nào em làm luôn cho anh", // lang-ok
    "tháng sau anh trả hết thẻ rồi, thẻ về 0", // lang-ok
    "@review-all", // lang-ok
    "giờ anh đang ở đâu trong kế hoạch", // lang-ok
  ] },
  { id: 'a3-tail', category: 'core-audit', wallet: 1000, vault: 7500, profile: {"v": 2, "age": 35, "ageDeclined": false, "incomeStable": true, "dependents": 0, "soleEarner": null, "holdings": [{"id": "hu6xkxw", "type": "term_deposit", "name": "Term deposit", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "value": 14000, "currency": "USDC"}, {"id": "htf3oki", "type": "us_stock", "name": "VOO", "updatedAt": 1793702662058, "priceSource": "self", "rebalanceable": true, "symbol": "VOO", "value": 10000, "currency": "USDC"}, {"id": "hon6nye", "type": "btc", "name": "Bitcoin", "updatedAt": 1793702662059, "priceSource": "self", "rebalanceable": true, "symbol": "BTC", "value": 6500, "currency": "USDC"}], "debts": [], "debtsComplete": true, "incomes": [{"id": "iwps8sm", "name": "Salary", "monthly": 5000, "currency": "USDC", "kind": "active", "updatedAt": 1793702652758}], "expenses": [{"id": "ef08irk", "name": "Monthly spending", "monthly": 2500, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702652760}], "noNearGoal": true, "cryptoSplit": 30}, lines: [ // lang-ok
    "So what are the numbers now?", // lang-ok
    "Actually can I do 40 traditional 60 crypto instead?", // lang-ok
    "I bought my bitcoin for 9000 but you have 6500, which one counts?", // lang-ok
    "I got a 3000 bonus. How should I split it?", // lang-ok
    "I also keep 2 oz of gold as my Safety.", // lang-ok
    "@review-all", // lang-ok
    "I keep 5000 in my checking account. Do you need to know about that?", // lang-ok
    "Bitcoin fell 40% this week. Do I need to buy more to catch up?", // lang-ok
    "I am 36 now by the way. Does that change anything?", // lang-ok
  ] },
  { id: 'a4-tail', category: 'core-audit', wallet: 2000, vault: 0, profile: {"v": 2, "age": 58, "ageDeclined": false, "incomeStable": false, "dependents": 1, "soleEarner": null, "holdings": [{"id": "h13p08u", "type": "fund_bond", "name": "Pension fund (shares)", "updatedAt": 1793702669695, "priceSource": "self", "rebalanceable": true, "value": 40000, "currency": "USDC"}, {"id": "hpj1yp6", "type": "savings", "name": "Bank savings kept as Safety", "updatedAt": 1793702684744, "priceSource": "self", "rebalanceable": true, "value": 50000, "currency": "USDC", "category": "safe"}], "debts": [], "debtsComplete": true, "incomes": [{"id": "ialck2r", "name": "Contract work", "monthly": 4000, "currency": "USDC", "kind": "active", "updatedAt": 1793702660709}], "expenses": [{"id": "edxfmb3", "name": "Monthly spending", "monthly": 3000, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702660710}], "planningScope": "household"}, lines: [ // lang-ok
    "How much do I need in the fund?", // lang-ok
    "I only have 2000 in USDC. How do I get the rest onchain?", // lang-ok
    "Can you tell me how to split my money now?", // lang-ok
    "@deposit 24000", // lang-ok
    "I did it, the rest is in. What next?", // lang-ok
    "Do I need crypto at all at my age? I would rather have none.", // lang-ok
    "Set crypto to 0 then.", // lang-ok
    "Should I sell my pension shares and put it all in term deposits, I am scared?", // lang-ok
    "Which bond fund exactly should I buy, and is it guaranteed?", // lang-ok
  ] },
  { id: 'a5-tail', category: 'core-audit', wallet: 20, vault: 20, profile: {"v": 2, "age": null, "ageDeclined": true, "incomeStable": null, "dependents": null, "soleEarner": null, "holdings": [{"id": "h47xlax", "type": "eth", "name": "ETH", "updatedAt": 1793702663994, "priceSource": "market", "rebalanceable": true, "symbol": "ETH", "quantity": 0.1, "unit": "coins"}], "debts": [{"id": "dktlpnn", "name": "Payday loan", "type": "payday_loan", "balance": 400, "currency": "USDC", "ratePct": null, "monthlyPayment": null, "updatedAt": 1793702656949, "term": "short"}], "debtsComplete": false, "incomes": [], "expenses": [{"id": "ez8spy1", "name": "Food delivery", "monthly": 1100, "currency": "USDC", "kind": "variable", "updatedAt": 1793702656948}, {"id": "eusdu7u", "name": "Rent and food", "monthly": 950, "currency": "USDC", "kind": "fixed", "updatedAt": 1793702656948}]}, lines: [ // lang-ok
    "i just got an airdrop worth 2000!!! what do i do", // lang-ok
    "i paid off the loan with it. loan is gone.", // lang-ok
    "@review-all", // lang-ok
    "and i put the other 1600 in usdc here", // lang-ok
    "ok how much for the fund", // lang-ok
    "@deposit 1600", // lang-ok
    "ok is it full? am i rich yet lol", // lang-ok
    "im 22 btw", // lang-ok
    "@review-all", // lang-ok
    "how do i split from here, i have no investments", // lang-ok
    "i sold half my eth", // lang-ok
  ] },
]
