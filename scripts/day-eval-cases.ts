// Fresh synthetic probes for the next improvement cycle; not a blinded holdout.
export const DAY_EVAL_CASES = [
  { id: 'day-small-savings', category: 'education', lines: [
    'Education only, no forms. Suppose someone starts with no savings and can save 200000 VND per month. How does that help with a surprise 1000000 VND bill? Give an everyday example.',
    'But the bill is due today, before they saved anything. Can that plan pay it today? Explain the timing without suggesting an investment return.',
    'What one private habit can they try this month? Do not save the example amounts as my finances.',
  ] },
  { id: 'day-pooling-choice', category: 'household', lines: [
    'Just explain, do not start a plan. Does being married mean we should combine every bank account and can spend all of each other\'s savings?',
    'Suppose one partner contributes $650 toward shared bills but keeps the rest private. Is $650 their entire salary? Is the private balance zero?',
    'Explain one way to agree on shared expenses while keeping separate accounts. This is a made-up household, not mine.',
  ] },
  { id: 'day-purchase-pause', category: 'education', lines: [
    'Teach me without onboarding. I want to buy a fancy phone because my friends upgraded. Explain needs versus wants using this example.',
    'If I wait two days, is it guaranteed I will no longer want it? What is the point of waiting if the urge remains?',
    'Give me one private check before buying, no income questionnaire and no coin offer.',
  ] },
] as const
