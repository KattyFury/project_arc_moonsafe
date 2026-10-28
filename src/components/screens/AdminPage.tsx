// /admin — the control page for the people who run MoonSafe (Hieu, 2026-10-28): how the agent is doing, every account, the settings
// that change without a deploy, the state of the AI keys, and a log of everything changed here.
//
// Who may use it is decided by the server (functions/_lib/admin.ts): a signed-in account plus a message signed by an admin wallet,
// valid 30 minutes. This page only collects the signature. Secrets are never shown; keys are changed in Cloudflare.

import { useCallback, useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import type { ComponentProps } from 'react'
import { Btn, GlassCard, Notice, Spinner } from '@/components/ui/kit'

// Buttons in the admin page size to their text (the kit's Btn is full width).
const AB = ({ className, ...p }: ComponentProps<typeof Btn>) => <Btn {...p} className={`!w-auto ${className ?? ''}`} />

const PROOF_KEY = 'moonsafe_admin_proof_v1'
const PROOF_MAX_MS = 29 * 60 * 1000

interface Proof { message: string; signature: string; at: number; address: string }
const readProof = (): Proof | null => {
  try { const p = JSON.parse(sessionStorage.getItem(PROOF_KEY) ?? 'null') as Proof | null; return p && Date.now() - p.at < PROOF_MAX_MS ? p : null } catch { return null }
}

interface Day { day: string; turns: number; events: number; failed: number; modelCalls: number; planSteps: number; rewrites: number; promptTokens: number; completionTokens: number; cachedTokens: number; standbyTurns: number; [k: string]: unknown }
interface Config { chatEnabled: boolean; cardsEnabled: boolean; notice: string; freeTurnsPerDay: number | null; ownerTurnsPerDay: number | null; userTokenBudget: number | null; dailyTokenBudget: number | null; primaryProvider: 'openai' | 'claude' }
interface Overview {
  admin: string; stats: Day[]; config: Config; adminWallets: string[]; tokensToday: number
  providers: { openai: boolean; claude: boolean; claudeModel: string }
  limits: { freeTurnsPerDay: number; ownerTurnsPerDay: number; userTokenBudget: number; dailyTokenBudget: number }
}
interface UserRow { id: string; updatedAt: number; holdings: number; debts: number; messages: number; age: number | null }
interface UserDetail { id: string; turnsToday: number; eventsToday: number; extraPower: number; ownerWallet: string | null; tokensToday: number; blocked: boolean }

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n))
const when = (ms: number) => ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '–'
const short = (id: string) => id.length > 26 ? `${id.slice(0, 14)}…${id.slice(-8)}` : id

type LinkedWallet = ReturnType<typeof useWallets>['wallets'][number]

/** Asks the server for the challenge, has the wallet sign it, and checks the proof at once so a wrong wallet is told right away. */
async function requestProof(w: LinkedWallet, token: string): Promise<Proof> {
  const c = await (await fetch('/api/admin?op=challenge', { headers: { Authorization: `Bearer ${token}` } })).json() as { message?: string; error?: string }
  if (!c.message) throw new Error(c.error ?? 'Could not start the sign-in')
  const provider = await w.getEthereumProvider()
  const signature = await provider.request({ method: 'personal_sign', params: [c.message, w.address] }) as string
  const p: Proof = { message: c.message, signature, at: Date.now(), address: w.address }
  const res = await fetch('/api/admin?op=overview', { headers: { Authorization: `Bearer ${token}`, 'x-admin-proof': JSON.stringify({ message: p.message, signature: p.signature }) } })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Not allowed')
  return p
}

const TABS = ['Overview', 'Users', 'Settings', 'AI keys', 'Log'] as const
type Tab = (typeof TABS)[number]

export function AdminPage() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const [proof, setProof] = useState<Proof | null>(readProof)
  const [tab, setTab] = useState<Tab>('Overview')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const api = useCallback(async <T,>(query: string, init?: { body: unknown }): Promise<T> => {
    const token = await getAccessToken()
    const res = await fetch(`/api/admin${query}`, {
      method: init ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json', ...(proof ? { 'x-admin-proof': JSON.stringify({ message: proof.message, signature: proof.signature }) } : {}) },
      body: init ? JSON.stringify(init.body) : undefined,
    })
    const data = await res.json().catch(() => ({})) as T & { error?: string }
    if (!res.ok) {
      if (res.status === 403) { sessionStorage.removeItem(PROOF_KEY); setProof(null) }
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }
    return data
  }, [getAccessToken, proof])

  // Sign in as admin: ask for the challenge, have one of the user's wallets sign it, keep the proof for this tab only.
  const signIn = async (index: number) => {
    setBusy(true); setError(null)
    try {
      const p = await requestProof(wallets[index], (await getAccessToken()) ?? '')
      sessionStorage.setItem(PROOF_KEY, JSON.stringify(p)); setProof(p)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh" style={{ background: 'var(--bg, #F4F6FB)' }}>
      <div className="mx-auto w-full max-w-[1100px] p-4 lg:p-8 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-[24px] leading-8 font-semibold" style={{ color: 'var(--ink)' }}>MoonSafe admin</h1>
          {proof && <span className="mono text-[14px]" style={{ color: 'var(--subtle)' }}>{short(proof.address)}</span>}
          <div className="ml-auto flex gap-2">
            {proof && <AB variant="outline" onClick={() => { sessionStorage.removeItem(PROOF_KEY); setProof(null) }}>Lock</AB>}
            {authenticated && <AB variant="outline" onClick={() => { void logout() }}>Log out</AB>}
          </div>
        </div>
        {children}
      </div>
    </div>
  )

  if (!ready) return shell(<Spinner label="Loading…" />)
  if (!authenticated) return shell(<GlassCard className="p-6 flex flex-col gap-4 items-start"><p className="text-[16px]" style={{ color: 'var(--subtle)' }}>Sign in with an admin account.</p><AB onClick={() => login()}>Sign in</AB></GlassCard>)
  if (!proof) {
    return shell(
      <GlassCard className="p-6 flex flex-col gap-4">
        <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>Prove you hold an admin wallet: choose one of your linked wallets and sign the message. Nothing is sent onchain and it costs nothing. The proof lasts 30 minutes in this tab.</p>
        {error && <Notice tone="danger" title="Could not sign in">{error}</Notice>}
        {wallets.length === 0 && <Notice tone="warning">No wallet is linked to this account.</Notice>}
        {wallets.map((w, i) => (
          <div key={w.address} className="flex items-center gap-4">
            <span className="mono text-[14px] break-all" style={{ color: 'var(--ink)' }}>{w.address}</span>
            <AB className="ml-auto" loading={busy} onClick={() => { void signIn(i) }}>Sign in as admin</AB>
          </div>
        ))}
      </GlassCard>,
    )
  }

  return shell(
    <>
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className="h-12 px-6 rounded-full text-[16px] font-semibold"
            style={{ background: tab === t ? 'var(--accent)' : 'white', color: tab === t ? 'white' : 'var(--ink)', border: '1px solid var(--border)' }}>{t}</button>
        ))}
      </div>
      {tab === 'Overview' && <OverviewTab api={api} />}
      {tab === 'Users' && <UsersTab api={api} />}
      {tab === 'Settings' && <SettingsTab api={api} />}
      {tab === 'AI keys' && <KeysTab api={api} />}
      {tab === 'Log' && <LogTab api={api} />}
    </>,
  )
}

type Api = <T>(query: string, init?: { body: unknown }) => Promise<T>

function useLoad<T>(api: Api, query: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    api<T>(query).then(d => { if (live) { setData(d); setError(null) } }).catch(e => { if (live) setError(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
  }, [api, query, tick])
  return { data, error, reload: () => setTick(t => t + 1) }
}

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <GlassCard className="p-4 flex flex-col gap-1">
    <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{label}</span>
    <span className="text-[24px] leading-8 font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{value}</span>
    {sub && <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{sub}</span>}
  </GlassCard>
)

export function OverviewTab({ api }: { api: Api }) {
  const { data, error } = useLoad<Overview>(api, '?op=overview')
  if (error) return <Notice tone="danger" title="Could not load">{error}</Notice>
  if (!data) return <Spinner label="Loading…" />
  const today = data.stats[0]
  const per = (n: number) => today && today.turns ? fmt(n / today.turns) : '–'
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Chat turns today" value={fmt(today?.turns ?? 0)} sub={`${fmt(today?.events ?? 0)} app events · ${fmt(today?.failed ?? 0)} failed`} />
        <Stat label="Tokens today (everyone)" value={fmt(data.tokensToday)} sub={`limit ${fmt(data.limits.dailyTokenBudget)}`} />
        <Stat label="Model calls per turn" value={today && today.turns ? (today.modelCalls / today.turns).toFixed(1) : '–'} sub={`${fmt(today?.rewrites ?? 0)} rewrites · ${per(today?.planSteps ?? 0)} plan steps/turn`} />
        <Stat label="Cached input" value={today && today.promptTokens ? `${Math.round((today.cachedTokens / today.promptTokens) * 100)}%` : '–'} sub={`${fmt(today?.standbyTurns ?? 0)} turns on the standby AI`} />
      </div>
      <GlassCard className="p-4 overflow-x-auto">
        <table className="w-full text-[14px] leading-5 tabular-nums" style={{ color: 'var(--ink)' }}>
          <thead><tr style={{ color: 'var(--subtle)' }} className="text-left"><th className="py-2 pr-4">Day (UTC)</th><th className="pr-4">Turns</th><th className="pr-4">Calls</th><th className="pr-4">Rewrites</th><th className="pr-4">Input tokens</th><th className="pr-4">Output</th><th className="pr-4">Cached</th><th>Standby</th></tr></thead>
          <tbody>{data.stats.map(d => (
            <tr key={d.day} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="py-2 pr-4">{d.day}</td><td className="pr-4">{fmt(d.turns)}</td><td className="pr-4">{fmt(d.modelCalls)}</td><td className="pr-4">{fmt(d.rewrites)}</td>
              <td className="pr-4">{fmt(d.promptTokens)}</td><td className="pr-4">{fmt(d.completionTokens)}</td><td className="pr-4">{fmt(d.cachedTokens)}</td><td>{fmt(d.standbyTurns)}</td>
            </tr>))}</tbody>
        </table>
      </GlassCard>
      <GlassCard className="p-4 flex flex-col gap-2">
        <span className="text-[16px] font-semibold" style={{ color: 'var(--ink)' }}>Admin wallets</span>
        {data.adminWallets.map(a => <span key={a} className="mono text-[14px] break-all" style={{ color: 'var(--subtle)' }}>{a}</span>)}
      </GlassCard>
    </>
  )
}

export function UsersTab({ api }: { api: Api }) {
  const [rows, setRows] = useState<UserRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async (c?: string | null) => {
    try {
      const d = await api<{ users: UserRow[]; cursor: string | null }>(`?op=users${c ? `&cursor=${encodeURIComponent(c)}` : ''}`)
      setRows(r => c ? [...r, ...d.users] : d.users); setCursor(d.cursor); setLoaded(true); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [api])
  useEffect(() => { void load(null) }, [load])

  if (error) return <Notice tone="danger" title="Could not load">{error}</Notice>
  if (!loaded) return <Spinner label="Loading…" />
  return (
    <GlassCard className="p-4 flex flex-col gap-2">
      {rows.length === 0 && <p className="text-[16px]" style={{ color: 'var(--subtle)' }}>No accounts have saved data yet.</p>}
      {rows.map(u => (
        <div key={u.id} className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <button className="w-full flex items-center gap-4 text-left min-h-12" onClick={() => setOpen(open === u.id ? null : u.id)}>
            <span className="mono text-[14px]" style={{ color: 'var(--ink)' }}>{short(u.id)}</span>
            <span className="text-[14px] ml-auto" style={{ color: 'var(--subtle)' }}>{u.holdings} holdings · {u.debts} debts · {u.messages} msgs · {when(u.updatedAt)}</span>
          </button>
          {open === u.id && <UserDetailPanel api={api} id={u.id} onDeleted={() => { setOpen(null); void load(null) }} />}
        </div>
      ))}
      {cursor && <AB variant="outline" onClick={() => { void load(cursor) }}>Load more</AB>}
    </GlassCard>
  )
}

function UserDetailPanel({ api, id, onDeleted }: { api: Api; id: string; onDeleted: () => void }) {
  const { data, error, reload } = useLoad<UserDetail>(api, `?op=user&id=${encodeURIComponent(id)}`)
  const [grant, setGrant] = useState('30')
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const act = async (body: Record<string, unknown>, done: string) => {
    try { await api('', { body: { op: 'user', id, ...body } }); setMsg(done); reload() } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }
  if (error) return <Notice tone="danger">{error}</Notice>
  if (!data) return <Spinner label="Loading…" />
  return (
    <div className="py-4 flex flex-col gap-4">
      <p className="mono text-[14px] break-all" style={{ color: 'var(--subtle)' }}>{data.id}</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Messages today" value={fmt(data.turnsToday)} sub={`${fmt(data.eventsToday)} app events`} />
        <Stat label="Bought power" value={fmt(data.extraPower)} />
        <Stat label="Tokens today" value={fmt(data.tokensToday)} />
        <Stat label="Status" value={data.blocked ? 'Blocked' : data.ownerWallet ? 'Owner' : 'Active'} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={grant} onChange={e => setGrant(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="h-12 w-28 px-4 rounded-2xl border text-[16px]" style={{ borderColor: 'var(--border)' }} aria-label="Messages to grant" />
        <AB variant="outline" onClick={() => { void act({ action: 'grant_power', messages: Number(grant) }, `Granted ${grant} messages`) }}>Grant messages</AB>
        <AB variant="outline" onClick={() => { void act({ action: 'reset_today' }, 'Today reset') }}>Reset today</AB>
        <AB variant="outline" onClick={() => { void act({ action: data.blocked ? 'unblock' : 'block' }, data.blocked ? 'Unblocked' : 'Blocked') }}>{data.blocked ? 'Unblock' : 'Block'}</AB>
        {confirmDelete
          ? <><AB variant="danger" onClick={() => { void api('', { body: { op: 'user', id, action: 'delete_data', confirm: true } }).then(onDeleted).catch(e => setMsg(String(e))) }}>Yes, delete this account's data</AB><AB variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</AB></>
          : <AB variant="outline" onClick={() => setConfirmDelete(true)}>Delete data</AB>}
      </div>
      {msg && <p className="text-[14px]" style={{ color: 'var(--subtle)' }}>{msg}</p>}
    </div>
  )
}

export function SettingsTab({ api }: { api: Api }) {
  const { data, error } = useLoad<Overview>(api, '?op=overview')
  const [draft, setDraft] = useState<Config | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => { if (data) setDraft(data.config) }, [data])
  if (error) return <Notice tone="danger" title="Could not load">{error}</Notice>
  if (!data || !draft) return <Spinner label="Loading…" />
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setDraft({ ...draft, [k]: v })
  const num = (k: 'freeTurnsPerDay' | 'ownerTurnsPerDay' | 'userTokenBudget' | 'dailyTokenBudget', label: string, def: number) => (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      <input value={draft[k] ?? ''} placeholder={`default ${fmt(def)}`} inputMode="numeric" onChange={e => set(k, e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : null)}
        className="h-12 px-4 rounded-2xl border text-[16px]" style={{ borderColor: 'var(--border)' }} />
    </label>
  )
  const toggle = (k: 'chatEnabled' | 'cardsEnabled', label: string, hint: string) => (
    <div className="flex items-center gap-4">
      <div className="flex flex-col"><span className="text-[16px] font-semibold" style={{ color: 'var(--ink)' }}>{label}</span><span className="text-[14px]" style={{ color: 'var(--subtle)' }}>{hint}</span></div>
      <AB className="ml-auto" variant={draft[k] ? 'primary' : 'danger'} onClick={() => set(k, !draft[k])}>{draft[k] ? 'On' : 'Paused'}</AB>
    </div>
  )
  return (
    <GlassCard className="p-6 flex flex-col gap-6">
      {toggle('chatEnabled', 'Agent', 'Paused: the agent answers nothing and shows the notice below.')}
      {toggle('cardsEnabled', 'Transaction cards', 'Paused: the agent offers no deposit, withdrawal or purchase. It cannot stop people using the app screens or the contract.')}
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold" style={{ color: 'var(--subtle)' }}>Notice for everyone (max 240 characters)</span>
        <textarea value={draft.notice} maxLength={240} rows={2} onChange={e => set('notice', e.target.value)} className="px-4 py-3 rounded-2xl border text-[16px] leading-6" style={{ borderColor: 'var(--border)' }} />
      </label>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {num('freeTurnsPerDay', 'Free messages per day', data.limits.freeTurnsPerDay)}
        {num('ownerTurnsPerDay', 'Owner messages per day', data.limits.ownerTurnsPerDay)}
        {num('userTokenBudget', 'Tokens per account per day', data.limits.userTokenBudget)}
        {num('dailyTokenBudget', 'Tokens for everyone per day', data.limits.dailyTokenBudget)}
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold" style={{ color: 'var(--subtle)' }}>Which AI answers first</span>
        <select value={draft.primaryProvider} onChange={e => set('primaryProvider', e.target.value as Config['primaryProvider'])} className="h-12 px-4 rounded-2xl border text-[16px] bg-white" style={{ borderColor: 'var(--border)' }}>
          <option value="openai">OpenAI (Claude is the standby)</option><option value="claude">Claude (needs the Claude key)</option>
        </select>
      </label>
      <div className="flex items-center gap-4">
        <AB onClick={() => { void api<{ config: Config }>('', { body: { op: 'config', patch: draft } }).then(r => { setDraft(r.config); setSaved('Saved') }).catch(e => setSaved(e instanceof Error ? e.message : String(e))) }}>Save settings</AB>
        {saved && <span className="text-[14px]" style={{ color: 'var(--subtle)' }}>{saved}</span>}
      </div>
      <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Empty number = the default from the environment. Changes apply within seconds. Creating vaults can only be paused onchain, by the factory owner (the multisig).</p>
    </GlassCard>
  )
}

export function KeysTab({ api }: { api: Api }) {
  const { data, error } = useLoad<Overview>(api, '?op=overview')
  const [test, setTest] = useState<{ openai: { ok: boolean; status: number } | null; claude: { ok: boolean; status: number } | null } | null>(null)
  const [testing, setTesting] = useState(false)
  if (error) return <Notice tone="danger" title="Could not load">{error}</Notice>
  if (!data) return <Spinner label="Loading…" />
  const line = (name: string, has: boolean, res: { ok: boolean; status: number } | null | undefined) => (
    <div className="flex items-center gap-4 min-h-12">
      <span className="text-[16px] font-semibold" style={{ color: 'var(--ink)' }}>{name}</span>
      <span className="text-[14px]" style={{ color: has ? 'var(--ink)' : 'var(--danger)' }}>{has ? 'Key is set' : 'No key'}</span>
      {res !== undefined && has && <span className="ml-auto text-[14px] font-semibold" style={{ color: res?.ok ? 'var(--ink)' : 'var(--danger)' }}>{res?.ok ? 'Connection OK' : `Failed (${res?.status || 'no connection'})`}</span>}
    </div>
  )
  return (
    <GlassCard className="p-6 flex flex-col gap-4">
      {line('OpenAI', data.providers.openai, test?.openai)}
      {line(`Claude (${data.providers.claudeModel})`, data.providers.claude, test?.claude)}
      <div><AB variant="outline" loading={testing} onClick={() => { setTesting(true); void api<NonNullable<typeof test>>('', { body: { op: 'test-providers' } }).then(setTest).catch(() => setTest(null)).finally(() => setTesting(false)) }}>Test connections</AB></div>
      <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>The test asks each provider to list its models, which costs no tokens. Keys are never shown here. To change one: Cloudflare, Workers and Pages, moonsafe, Settings, Variables and Secrets (OPENAI_API_KEY, ANTHROPIC_API_KEY), then deploy again.</p>
    </GlassCard>
  )
}

export function LogTab({ api }: { api: Api }) {
  const { data, error } = useLoad<{ log: Array<{ ts: number; who: string; action: string; detail: Record<string, unknown> }> }>(api, '?op=log')
  if (error) return <Notice tone="danger" title="Could not load">{error}</Notice>
  if (!data) return <Spinner label="Loading…" />
  return (
    <GlassCard className="p-4 flex flex-col gap-2">
      {data.log.length === 0 && <p className="text-[16px]" style={{ color: 'var(--subtle)' }}>Nothing has been changed yet.</p>}
      {data.log.map((l, i) => (
        <div key={i} className="border-t pt-2 text-[14px] leading-5" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
          <span className="font-semibold">{l.action}</span> · {when(l.ts)} · <span className="mono">{short(l.who)}</span>
          <div className="mono break-all" style={{ color: 'var(--subtle)' }}>{JSON.stringify(l.detail)}</div>
        </div>
      ))}
    </GlassCard>
  )
}
