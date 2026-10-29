import assert from 'node:assert/strict'
import { dependentEvidence, incomeUpdate, profileAgeAllowed, scopeBrief, scopeChoice, scopeQuestion } from '../src/lib/planningScope'
import { normalizeProfile, applyOps, readOps } from '../src/lib/profile'
import { EMPTY_FORM, formToItems } from '../src/lib/intakeForm'
import { computeBalance } from '../src/lib/allocation'
import { buildPlan, buildStanding } from '../functions/_lib/plan'
import type { Income } from '../src/types'

export function householdChecks(): number {
  let checks = 0
  assert.equal(profileAgeAllowed('My wife is 28 years old', 28), false)
  assert.equal(profileAgeAllowed("I am 34 and my wife is 28", 34), true)
  assert.equal(profileAgeAllowed("I am 34 and my wife is 28", 28), false)
  assert.equal(profileAgeAllowed('Mình 34 tuổi, vợ 28 tuổi', 34), true) // lang-ok
  assert.equal(dependentEvidence('My wife earns $1500', ''), false)
  assert.equal(dependentEvidence('I support two dependents', ''), true)
  assert.equal(dependentEvidence('2', 'How many dependents?'), true)
  checks += 7
  assert.equal(scopeQuestion('Gộp lương vợ chồng được không'), true) // lang-ok
  assert.equal(scopeChoice('Gộp lương vợ chồng được không'), null) // lang-ok
  assert.equal(scopeQuestion('My wife earns $1500'), false)
  checks += 3
  for (const [text, want] of [
    ['Plan for my household', 'household'], ['Use a household budget', 'household'],
    ['Lập kế hoạch cho gia đình', 'household'], ['Tính cho riêng mình', 'individual'], // lang-ok
    ['Can I plan for my household?', null], ['My wife earns $1500', null],
    ['I am married', null], ['If I use a household budget', null],
    ['Plan for my household. Buy BTC', null], ['I do not want a household plan', null],
  ] as const) { assert.equal(scopeChoice(text), want); checks++ }
  for (const scope of [undefined, 'individual', 'household', 'invalid', null]) {
    const p = normalizeProfile({ v: 2, planningScope: scope, age: 34 })
    assert.equal(p.age, 34)
    assert.equal(p.planningScope, scope === 'household' || scope === 'individual' ? scope : undefined)
    checks++
  }
  const salary = (id: string, name: string, monthly: number): Income => ({ id, name, monthly, currency: 'USDC', kind: 'active', updatedAt: 1 })
  const self = salary('self', 'Income', 2000)
  assert.equal(incomeUpdate([self], { name: "Wife's salary", kind: 'active' }, 'My wife earns $1500', 'household').old, undefined)
  assert.ok(incomeUpdate([self], { name: "Wife's salary", kind: 'active' }, 'My wife earns $1500', 'individual').error)
  assert.ok(incomeUpdate([self], { id: 'self', name: "Wife's salary", kind: 'active' }, 'My wife earns $1500').error)
  assert.equal(incomeUpdate([self], { name: 'Salary', kind: 'active' }, 'My salary is now $2500').old?.id, 'self')
  assert.equal(incomeUpdate([self], { name: 'Salary', kind: 'active' }, 'My salary is $2500').old?.id, 'self')
  assert.equal(incomeUpdate([self], { name: 'Side job', kind: 'active' }, 'I also earn $500').old, undefined)
  assert.ok(incomeUpdate([self], { name: 'Income', kind: 'active' }, 'I also earn $500').error)
  assert.equal(incomeUpdate([self], { name: 'Income', kind: 'passive' }, 'I earn $500 in rent').old, undefined)
  const both = [self, salary('wife', "Wife's salary", 1500)]
  assert.ok(incomeUpdate(both, { name: 'Combined household salary', kind: 'active' }, 'Our combined salary is $3500', 'household').error)
  const combined = salary('both', 'Combined household salary', 3500)
  assert.ok(incomeUpdate([combined], { name: "Wife's salary", kind: 'active' }, 'My wife earns $1500').error)
  assert.equal(incomeUpdate([combined], { name: 'Side job', kind: 'active' }, 'I also earn $500 from a new side job', 'household').error, undefined)
  assert.equal(incomeUpdate([combined], { id: 'both', name: combined.name, kind: 'active' }, 'Our combined salary is now $4000').old?.id, 'both')
  assert.ok(incomeUpdate([{ ...combined, kind: 'passive' }], { name: "Wife's rental income", kind: 'passive' }, 'My wife receives $500 in rent', 'household').error)
  checks += 13
  const base = normalizeProfile({ v: 2, age: 34, incomeStable: true, dependents: 2, soleEarner: false, debtsComplete: true, noNearGoal: true,
    incomes: both, expenses: [{ id: 'spend', name: 'Household spending', monthly: 1200, currency: 'USDC', kind: 'fixed' }],
    holdings: [{ id: 'bank', name: 'Shared bank savings', type: 'savings', value: 10000, currency: 'USDC', priceSource: 'self' }],
    debts: [{ id: 'd', name: 'Family loan', type: 'family_no_interest', balance: 1000, currency: 'USDC', ratePct: 0, monthlyPayment: 100 }],
  })
  const family = applyOps(base, readOps([{ op: 'update_profile', fields: { planningScope: 'household' } }]))
  assert.deepEqual(family.incomes, base.incomes)
  assert.deepEqual(family.holdings, base.holdings)
  assert.deepEqual(family.debts, base.debts)
  assert.equal(normalizeProfile(JSON.parse(JSON.stringify(family))).planningScope, 'household')
  const balance = (p = family) => computeBalance({ profile: p, walletUsd: 0, vaultUsd: 7800, cirBtcUsd: 0, prices: null, vndPerUsd: 25000 })
  const b = balance()
  assert.equal(b.cashflow.income, 3500)
  assert.equal(b.cashflow.spending, 1300) // shared spending + debt payment once
  assert.equal(b.fund.floorUsd, 7800)
  assert.deepEqual(b.target, balance(base).target) // scope changes the basis label, not the age formula
  assert.equal(balance({ ...family, incomeStable: false, soleEarner: true }).fund.floorMonths, 12)
  assert.equal(balance({ ...family, incomeStable: false, soleEarner: false }).fund.floorMonths, 9)
  assert.match(scopeBrief('household'), /not extra household income/)
  checks += 11
  const form = { ...EMPTY_FORM, planningScope: 'household' as const, age: '34', salary: '3500', spending: '1200', steady: 'yes' as const, reliers: 'yes' as const, reliersCount: '2', onlyEarner: 'no' as const }
  const p = applyOps(normalizeProfile({ v: 2 }), formToItems(form, null).flatMap(i => i.ops))
  assert.equal(p.planningScope, 'household')
  assert.equal(p.incomes.length, 1)
  assert.equal(p.incomes[0].monthly, 3500)
  assert.match(p.incomes[0].name, /Combined household/)
  assert.equal(p.age, 34)
  assert.equal(p.dependents, 2)
  assert.equal(p.soleEarner, false)
  assert.match(buildPlan({ p: family, b, shares: [34, 33, 33], cover: null, vi: false }) ?? '', /Household plan/)
  assert.match(buildStanding({ p: family, b, vi: true }) ?? '', /gia đình/) // lang-ok
  checks += 9
  return checks
}
