// D1 ledger (2026-10-30, functions/_lib/ledger.ts): runs the real SQL of migrations/0001_ledger.sql on bun:sqlite through a small
// D1 look-alike, then the allowance and purchase rules on top of it. No network: `bun scripts/ledger-check.ts`.

// @ts-expect-error bun's own module; tsc here has no bun types
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { claims, counters, type D1Like } from '../functions/_lib/ledger'
import { takeTurn, powerState } from '../functions/_lib/quota'

let bad = 0
const expect = (ok: boolean, what: string) => { if (!ok) { bad++; console.log('FAIL', what) } }

const sqlite = new Database(':memory:')
sqlite.exec(readFileSync(new URL('../migrations/0001_ledger.sql', import.meta.url), 'utf8'))
// D1 numbers its parameters ?1 ?2 like SQLite, so the statements run unchanged.
const db: D1Like = {
  prepare: (sql: string) => ({
    bind: (...v: unknown[]) => ({
      first: async <T>() => (sqlite.query(sql).get(...(v as never[])) as T) ?? null,
      run: async () => sqlite.query(sql).run(...(v as never[])),
    }),
  }),
}
class MemKv {
  m = new Map<string, string>()
  get = async (k: string) => this.m.get(k) ?? null
  put = async (k: string, v: string) => { this.m.set(k, v) }
  delete = async (k: string) => { this.m.delete(k) }
}

const c = counters({ DB: db })!
expect(await c.incrBelow('t', 2) && await c.incrBelow('t', 2) && !(await c.incrBelow('t', 2)) && (await c.get('t')) === 2, 'incrBelow stops at the limit')
expect(await c.decrIfPositive('t') && await c.decrIfPositive('t') && !(await c.decrIfPositive('t')), 'decrIfPositive stops at 0')
expect((await c.add('p', 100)) === 100 && (await c.add('p', -150)) === 0, 'add never goes below 0')
await c.del('p'); expect((await c.get('p')) === 0, 'del removes the counter')

const l = claims({ DB: db })!
expect(await l.claim('h1', 'alice') && await l.claim('h1', 'alice'), 'an account can resume its own pending claim')
expect(!(await l.claim('h1', 'bob')), 'another account cannot take a pending claim')
await l.release('h1', 'bob'); expect(!(await l.claim('h1', 'bob')), "bob cannot release alice's claim")
const fin = await Promise.all([l.finalize('h1', 'alice'), l.finalize('h1', 'alice')])
expect(fin.filter(Boolean).length === 1, `only one of two parallel finalizes wins (${fin})`)
expect(!(await l.claim('h1', 'alice')), 'a credited payment cannot be claimed again')
await l.release('h1', 'alice'); expect(!(await l.claim('h1', 'alice')), 'release never drops a credited payment')
expect(!(await l.finalize('h1', 'bob')), 'bob cannot finalize a payment credited to alice')
await l.claim('h2', 'alice'); await l.release('h2', 'alice'); expect(await l.claim('h2', 'bob'), 'a released claim is free again')

// The allowance on D1: 25 messages at once with a limit of 20 and 3 bought messages = 23 replies, never more.
const env = { USERDATA: new MemKv(), DB: db, FREE_TURNS_PER_DAY: '20' }
await c.add('power:did:privy:zoe', 3)
const turns = await Promise.all(Array.from({ length: 25 }, () => takeTurn(env, 'did:privy:zoe', 'message')))
const ok = turns.filter(t => t.ok).length
const st = await powerState(env, 'did:privy:zoe')
expect(ok === 23 && st?.used === 20 && st?.extra === 0, `25 parallel messages: 20 free + 3 bought pass (got ${ok}, used ${st?.used}, extra ${st?.extra})`)
const one = await Promise.all(Array.from({ length: 30 }, () => takeTurn(env, 'did:privy:zoe', 'event')))
expect(one.filter(t => t.ok).length === 20, 'hidden events stop at their own cap of 20')
const t = await takeTurn({ ...env, FREE_TURNS_PER_DAY: '21' }, 'did:privy:zoe', 'message')
if (t.ok) await t.refund()
expect((await powerState(env, 'did:privy:zoe'))?.used === 20, 'a refund gives the message back')

console.log(bad ? `${bad} FAILED` : 'ledger OK')
if (bad) process.exit(1)
