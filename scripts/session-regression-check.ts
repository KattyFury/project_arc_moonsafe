// Deterministic regressions for failures discovered in the 2026-10-31 live session.
// No external fetches, provider charges, wallet actions or changes to old reports.
import assert from 'node:assert/strict'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { scopeChoice } from '../src/lib/planningScope'
import { turnPolicy } from '../functions/_lib/agentGuards'
import { investedBasis } from '../functions/_lib/mutationEvidence'
import { salaryRemainder } from '../functions/_lib/educationFigures'
import { confirmationStatus } from '../functions/_lib/confirmationStatus'
import { normalizeProfile } from '../src/lib/profile'
const tests: Array<{ name:string; pass:boolean; error?:string }> = []
const check = async (name:string, fn:()=>unknown | Promise<unknown>) => {
  try { await fn(); tests.push({name,pass:true}) }
  catch(e) { tests.push({name,pass:false,error:(e as Error).message}) }
}
await check('Vietnamese embedded individual choice overrides marriage', () => assert.equal(scopeChoice('Tôi đã kết hôn nhưng chỉ lập kế hoạch cho riêng tôi. Lương tôi 20 triệu/tháng, của vợ 15 triệu. Không cộng tiền vợ.'), 'individual'))
await check('English embedded personal choice', () => assert.equal(scopeChoice('I am married, but plan for just me. My salary is $2000.'), 'individual'))
await check('scope question is not a scope command', () => assert.equal(scopeChoice('Should I plan for just me?'), null))
await check('negated household choice is not consent', () => assert.notEqual(scopeChoice('Đừng đổi thành kế hoạch gia đình.'), 'household'))
await check('quoted individual choice is not consent', () => assert.equal(scopeChoice('My friend said "plan for just me".'), null))
await check('ambiguous competing scope choices require clarification', () => assert.equal(scopeChoice('Plan for just me or plan for my household.'), null))
await check('Vietnamese listening preference persists on follow-up', () => assert.equal(turnPolicy(['Mình vừa thua coin. Chỉ nghe mình nói, không lập kế hoạch.', 'Mình sợ nói với gia đình. Đừng đề nghị mua BTC, điền form hay hỏi thu nhập.']).conversationOnly, true))
await check('Vietnamese no-form request persists', () => assert.equal(turnPolicy(['Không mở form. Giải thích quỹ dự phòng.', 'Còn chi tiêu thì sao?']).conversationOnly, true))
await check('Vietnamese quantity purchase has VND cost',()=>assert.deepEqual(investedBasis('Tôi mua 0.015 BTC hết 28 triệu VND.', 'BTC'),{amount:28e6,currency:'VND'}))
await check('Vietnamese cost correction has VND cost',()=>assert.deepEqual(investedBasis('Đính chính: vốn mua là 29 triệu VND, số BTC vẫn 0.015.', 'BTC'),{amount:29e6,currency:'VND'}))
await check('market value is not a cost correction',()=>assert.equal(investedBasis('Giá trị thị trường của BTC là 20 triệu VND.', 'BTC'),null))
await check('salary subtraction is computed without claiming bank balance',()=>assert.match(salaryRemainder(['Một người góp 3 triệu.', 'Nếu lương người đó là 12 triệu mỗi tháng thì phần lương không chuyển là gì?'])??'',/9,000,000 VND/))
await check('salary subtraction refuses mixed currencies',()=>assert.equal(salaryRemainder(['Someone contributes $300.', 'If salary is 12 triệu VND, what is the remaining salary?']),null))
await check('salary subtraction does not invent a contribution',()=>assert.equal(salaryRemainder(['If salary is $1000, what is the remaining salary?']),null))
await check('salary subtraction ignores a denied contribution',()=>assert.equal(salaryRemainder(['Người đó không góp 3 triệu.', 'Nếu lương người đó là 12 triệu thì phần lương không chuyển là gì?']),null))
await check('salary subtraction ignores a quoted contribution',()=>assert.equal(salaryRemainder(['A friend said "Someone contributes $300."', 'If salary is $1000, what is the remaining salary?']),null))
const savedFixture=normalizeProfile({v:2,age:38,incomeStable:false,dependents:3,soleEarner:true,incomes:[{id:'i',name:'Freelance income',monthly:3000,currency:'USDC',kind:'irregular'}],expenses:[{id:'e',name:'Household spending',monthly:1800,currency:'USDC',kind:'fixed'}]})
await check('saved status never infers economic gap from zero vault',()=>{
  const s=confirmationStatus('Do not claim I deposited anything or my emergency fund is full. What is confirmed and what still needs confirmation?',savedFixture,false,0)??''
  assert.match(s,/3,000 USD/);assert.match(s,/1,800 USD/);assert.match(s,/not establish your emergency reserves/)
  assert.doesNotMatch(s,/not full|still to go|nothing is confirmed/)
})
await check('status route does not swallow compound transaction request',()=>assert.equal(confirmationStatus('What is saved now? Deposit for me.',savedFixture,false,0),null))
const {publicKey,privateKey} = await generateKeyPair('ES256')
const jwk = {...await exportJWK(publicKey),kid:'session-regression',alg:'ES256',use:'sig'}
const token = await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:jwk.kid}).setIssuer('privy.io').setAudience('cmvhlli8900mk0gjmwdeypxh2').setSubject('did:privy:session-regression').setIssuedAt().setExpirationTime('1h').sign(privateKey)
const realFetch = globalThis.fetch
let reply = 'No. Saying sounds good does not sign a transaction or move money.'
let providerCalls = 0
globalThis.fetch = (async (url:string | URL | Request, init?:RequestInit) => {
  const u=String(url)
  if(u.includes('auth.privy.io')) return Response.json({keys:[jwk]})
  if(u.startsWith('https://api.openai.com/')) {
    providerCalls++
    const b=JSON.parse(String(init?.body))
    return Response.json({choices:[{message:b.tool_choice==='required' ? {role:'assistant',content:null,tool_calls:[{id:'none',type:'function',function:{name:'no_action',arguments:'{}'}}]} : {role:'assistant',content:reply}}]})
  }
  return Response.json({result:'success',rates:{VND:25000},usd:{},goldUsdPerOz:null})
}) as typeof fetch
;(globalThis as {caches?:unknown}).caches={default:{match:async()=>undefined,put:async()=>undefined}}
const store=new Map<string,string>()
const env={OPENAI_API_KEY:'offline-only',USERDATA:{get:async(k:string)=>store.get(k)??null,put:async(k:string,v:string)=>{store.set(k,v)}},FREE_TURNS_PER_DAY:'10000',USER_DAILY_TOKEN_BUDGET:'100000',DAILY_TOKEN_BUDGET:'100000'}
try {
  const {onRequestPost}=await import('../functions/api/chat') as {onRequestPost:(ctx:{env:typeof env;request:Request})=>Promise<Response>}
  async function ask(lines:string[], profile:unknown={v:2}) {
    const res=await onRequestPost({env,request:new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({messages:lines.map(content=>({role:'user',content})),context:{profile,hasVault:true,walletUsdc:50,vaultUsdc:0}})})})
    assert.equal(res.status,200)
    return await res.json() as {content:string;actions:Array<{type:string}>;ops:unknown[]}
  }
  await check('deposit consent question reaches requested explanation',async()=>{
    const r=await ask(['I only want to understand deposits, no forms.', 'If I say "sounds good" to that explanation, does it mean a deposit was signed or money moved?'])
    assert.equal(r.content,reply);assert.deepEqual(r.actions,[]);assert.deepEqual(r.ops,[])
  })
  await check('deposit refusal does not swallow testnet question',async()=>{
    reply='Testnet tokens are for testing. Rent requires real money you can access.'
    const r=await ask(['Explain only, no forms.', 'No deposit today. Explain testnet money versus money I can actually use for rent in one short paragraph.'])
    assert.equal(r.content,reply);assert.deepEqual(r.actions,[])
  })
  await check('Vietnamese listening follow-up never starts intake',async()=>{
    reply='Mình nghe bạn. Bạn không cần chia sẻ thêm lúc này.'
    const r=await ask(['Mình vừa thua coin. Chỉ nghe mình nói, không lập kế hoạch.', 'Mình sợ nói với gia đình. Đừng đề nghị mua BTC, điền form hay hỏi thu nhập.'])
    assert.ok(!r.actions.some(a=>a.type==='intake_form')); assert.equal(r.content,reply)
  })
  await check('real handler status reply uses zero model calls',async()=>{
    const before=providerCalls
    const r=await ask(['Do not claim I deposited anything or my emergency fund is full. What is confirmed and what still needs confirmation?'],savedFixture)
    assert.equal(providerCalls,before);assert.match(r.content,/3,000 USD/);assert.deepEqual(r.actions,[]);assert.deepEqual(r.ops,[])
  })
} finally {globalThis.fetch=realFetch}
console.log(JSON.stringify({checks:tests.length,passed:tests.filter(t=>t.pass).length,paidCalls:0,mockedProviderCalls:providerCalls,tests},null,2))
if(tests.some(t=>!t.pass)) process.exitCode=1
