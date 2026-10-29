// Added after cycle 2. Fresh wording probes, not an independent blinded holdout.
export const CYCLE_FRESH_CASES = [
  { id: 'fresh-purchase-wording', category: 'recording', lines: [
    'I paid $935 for 0.011 BTC last spring. I also keep $275 cash. Those are two separate assets.',
    'Its resale value is $710 today. Does that revise the original money I invested, or only tell us about its market value?',
    'Show which numbers you know and which you cannot verify without a price feed.',
  ] },
  { id: 'fresh-interest-question', category: 'framework', lines: [
    'I owe a relative $1400 and repay $80 monthly. We have not discussed interest yet.',
    'Could it be an interest-free gift or optional repayment? I am asking, not confirming.',
    'I checked with the lender: 12% APR, repayment is mandatory, and $80 is the monthly payment. Update only those confirmed terms.',
  ] },
  { id: 'fresh-partial-expenses', category: 'recording', lines: [
    'Plan individually. I am 42, earn a stable $2600 monthly, have no dependents and no debts. Rent is $900 and food is $300. My spending is incomplete.',
    "I haven't listed utilities or transport yet. Is $1200 my complete monthly spending, or only the expenses we have listed?",
    'Can you finalize my emergency fund target already? Please do not fill the missing costs with zero.',
  ] },
] as const
