// Held-out wording: written before this reevaluation, not used to implement the previous repairs.
export const REEVAL_CASES = [
  { id: 'new-cost-vi', category: 'recording', lines: [
    'Mình bỏ 60 triệu VND mua Bitcoin, giờ giá trị còn 42 triệu. Đó là vốn đã mua, không phải mình có 60 BTC.', // lang-ok
    'Giải thích giúp phân biệt vốn bỏ vào, số BTC và giá trị hiện tại. Đừng tự đoán số BTC khi chưa biết giá mua.', // lang-ok
    'Giá giảm có làm mình phải mua thêm để lấp phần Crypto không?', // lang-ok
  ] },
  { id: 'new-family-partial', category: 'household', lines: [
    "I'm married. We keep some money separate. My pay is $2400 and my partner contributes $800 monthly to our shared budget, but I don't know their full salary. Shared bills are $1900.",
    'Do not count the $800 contribution as an extra salary on top of a salary you have not been told. What income basis can we actually use?',
    'We have not listed all our savings or debts. Can you give a complete investment allocation yet?',
  ] },
  { id: 'new-no-form', category: 'education', lines: [
    'Skip the questionnaire for now. Teach me one practical way to stop impulse spending.',
    'My friends keep showing gains from coins. I am asking about my habits, not buying anything.',
    'What could I do before the next payday? Keep it to one small task.',
  ] },
  { id: 'new-unit-mixture', category: 'recording', lines: [
    'I own 0.02 BTC bought for $1600, plus $300 cash. Please keep the BTC quantity and dollars distinct.',
    'The BTC is worth $1200 today. Does that change the money I originally invested?',
    'Show which numbers you know and which you cannot value without a price feed.',
  ] },
  { id: 'new-family-negative', category: 'household', lines: [
    'My colleague is married and her husband makes $4000. I am single and only asking about how a family budget differs from mine.',
    'Suppose I get married next year. Would you immediately include an imaginary spouse salary in my current plan?',
    'Now my actual income is $1700 and monthly spending is $1000. Keep the hypothetical money out of my profile.',
  ] },
  { id: 'new-debt-uncertainty', category: 'framework', lines: [
    'I owe $900 to a relative. I have not asked whether they charge interest. Monthly repayment is $75. I also spend $650 on living costs.',
    'Can you assume it is an interest-free gift because it is family? Explain what we need to confirm.',
    'I checked: zero interest, and I still must repay it. Keep the $75 repayment counted once.',
  ] },
] as const
