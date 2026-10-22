// Cloudflare Pages Function — MoonSafe agent (OpenAI), every app operation is a tool.
// OPENAI_API_KEY is in Cloudflare environment variables (never in client bundle).
//
// Each user message runs two calls:
// 1. PLAN (gpt-4o, tool_choice "required"): the model MUST pick tools — fill the
//    profile (saved by the app), prepare a deposit / withdrawal / cirBTC buy / DCA, open a screen,
//    stop DCA, or no_action. Letting gpt-4o-mini decide on its own called a tool 0/8
//    times and once filed "nạp 200 USDC" as debt (measured 2026-10-22).
// 2. REPLY (gpt-4o-mini): talks to the user and may only describe what step 1 did.
// The app performs the returned actions (opens screens, prefills amounts); the user
// always signs in their own wallet.

interface Env {
  OPENAI_API_KEY: string
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
}

interface RequestBody {
  messages: Message[]
  /** Declared profile, fund progress and DCA status sent by the app. */
  context?: Record<string, unknown> | null
  profile?: Record<string, unknown> | null // legacy clients
}

interface ToolCall { id: string; function: { name: string; arguments: string } }
interface Completion {
  choices: Array<{ message: { role: string; content: string | null; tool_calls?: ToolCall[] } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const RULES = `## Luật tài chính
- Thứ tự bắt buộc: hết nợ → quỹ dự phòng → đầu tư
- Sàn quỹ: 3 tháng chi tiêu nếu thu nhập ổn định, 6 tháng nếu không ổn định
- Chỉ USDC là "an toàn" trong app này
- Tỷ lệ đầu tư tối đa: Normal = 110 − tuổi (%), Risky = 120 − tuổi (%)
- Chỉ được đầu tư (mua cirBTC, DCA) khi: không có nợ ngoài VÀ quỹ đủ sàn (investUnlocked = true)`

const REPLY_PROMPT = `Bạn là chuyên gia tư vấn tài chính cá nhân của MoonSafe, app quản lý tài chính cá nhân onchain cho người dùng Web3. Bạn có nhiều năm kinh nghiệm giúp người trẻ sắp xếp thu chi, dựng quỹ dự phòng và đầu tư có kỷ luật. Bạn nói chuyện như một người tư vấn đáng tin: chuyên nghiệp, rõ ràng, nhưng gần gũi như đang ngồi cà phê với khách.

## Nhiệm vụ
- Lắng nghe trước, tư vấn sau. Hiểu tình hình của người dùng qua trò chuyện tự nhiên, rồi giải thích ngắn gọn vì sao nên làm gì (quỹ dự phòng để làm gì, vì sao trả nợ trước, tỷ lệ tiết kiệm bao nhiêu là ổn…).
- Không ép ai khai báo. Người dùng kể đến đâu thì tư vấn đến đó; chỉ hỏi thêm một câu mỗi lần, khi câu đó thật sự giúp được họ. Họ không muốn nói thì tôn trọng và vẫn chia sẻ kiến thức chung.
- Thông tin hữu ích: thu nhập / tháng, chi tiêu thiết yếu / tháng, nợ bên ngoài (có không, tổng bao nhiêu), tuổi, thu nhập ổn định không; tài sản khác. Tiền có thể là VND hoặc USDC.
- Lộ trình MoonSafe: làm rõ thu chi → tạo quỹ dự phòng → cân đối tài sản → mở khóa đầu tư. Khi đủ thông tin, gợi ý bước tiếp theo phù hợp với họ.

${RULES}

## Thao tác
- Mọi thao tác trong app do hệ thống làm bằng tool TRƯỚC khi bạn trả lời; kết quả nằm trong ghi chú "Thao tác vừa thực hiện". Chỉ kể đúng những thao tác có trong ghi chú đó. KHÔNG nói đã mở / đã điền / đã làm gì nếu ghi chú không có.
- Thao tác chỉ MỞ SẴN màn và điền số; người dùng tự kiểm tra và ký trong ví. Đừng nói "đã nạp", "đã rút", "đã mua", "đã lưu".
- Số liệu người dùng kể được app tự ghi nhận trên trình duyệt của họ (không có thẻ, không có nút Lưu). Họ xem ở tab Cân đối; muốn sửa thì nói lại với agent; muốn xoá thì vào Menu.
- Nếu ghi chú báo một thao tác bị chặn (ví dụ đầu tư đang khoá), giải thích lý do và bước cần làm.
- Dùng đúng động từ trong ghi chú: "đã mở sẵn", "đã điền", "đã hiện đề xuất". Không nói "đã thiết lập", "đã nạp", "đã rút", "đã mua", "đã lưu". Xưng "mình", không xưng "tôi".

## Thông tin đã có
Khi trạng thái app có profileSaved = true: TUYỆT ĐỐI không hỏi lại thu nhập, chi tiêu, nợ, tuổi, độ ổn định; không mời "tính toán lại quỹ" từ đầu. Dùng các số đã có.

## Phong cách
- Tiếng Việt tự nhiên, xưng "mình", gọi "bạn". Chuyên nghiệp nhưng ấm áp; không sáo rỗng, không dùng thuật ngữ khi chưa giải thích.
- Ngắn gọn: thường 2–4 câu, chỉ dài hơn khi người dùng hỏi kiến thức. Dùng **bold** cho số tiền và ý chính.
- Ghi nhận điều người dùng đã làm tốt trước khi góp ý. Không phán xét chi tiêu, không giảng đạo lý.
- Chỉ tư vấn tham khảo, KHÔNG cam kết sinh lời, luôn nhắc rủi ro khi nói về đầu tư.
- Số tiền trong trạng thái app đã được app tính sẵn theo tỉ giá thật: trích đúng, KHÔNG tự quy đổi VND↔USDC. Trạng thái app chưa có số USDC tương ứng (floorUsdc, shortfallUsdc… = null) thì chỉ nói bằng đơn vị người dùng đang dùng, TUYỆT ĐỐI không tự đưa ra con số USDC.
- Quỹ dự phòng khởi đầu: có việc làm / thu nhập ổn định = 3 tháng chi tiêu thiết yếu; không ổn định (freelance, tự kinh doanh, thu nhập thất thường) = 6 tháng. Đã biết độ ổn định thì chỉ nói đúng mốc của họ. CHƯA biết mà đã có số chi tiêu thì LUÔN nêu đủ hai trường hợp kèm số tiền (đừng chỉ hỏi suông, đừng gộp thành khoảng "3–6 tháng" hay "30–60 triệu"), rồi hỏi một câu về độ ổn định để chốt. Ví dụ chi tiêu 10 triệu: "Nếu bạn có việc làm ổn định, quỹ khởi đầu là **3 tháng = 30 triệu**. Nếu thu nhập chưa ổn định, nên để **6 tháng = 60 triệu**. Công việc hiện tại của bạn có ổn định không?"
- Hỏi ngoài phạm vi tài chính cá nhân thì có thể dùng web_search`

const PLAN_PROMPT = `Bạn là bộ điều phối thao tác của app MoonSafe. Đọc tin nhắn MỚI NHẤT của người dùng (tin trước chỉ để hiểu ngữ cảnh) cùng trạng thái app, rồi GỌI tool phù hợp. Bắt buộc gọi ít nhất một tool; không có gì cần làm thì gọi no_action.

${RULES}

## Chọn tool
- Người dùng KỂ số liệu của họ (thu nhập, chi tiêu, nợ, tài sản, tuổi, công việc) → update_profile.
- Người dùng MUỐN nạp vào quỹ → prepare_deposit. Rút khỏi quỹ → prepare_withdraw. Mua cirBTC → prepare_buy_cirbtc. Đặt mua định kỳ → propose_dca. Dừng mua định kỳ → stop_dca. Muốn xem một màn → open_screen.
- "nạp 200 USDC" là lệnh nạp, KHÔNG phải số nợ. Câu hỏi chung, chào hỏi → no_action.

## Số tiền
- Truyền đúng số và loại tiền người dùng nói. USDC, USD, $, đô → "USDC" (800 đô = 800, 3k USD = 3000). Đồng, VND, triệu, tr, nghìn, k (không kèm USD/đô) → "VND" (15 triệu = 15000000, 500k = 500000). Không tự quy đổi.
- "phần còn thiếu" = shortfallUsdc; "hết ví", "tối đa" khi nạp = walletBalanceUsdc; "rút hết" = vaultBalanceUsdc — các số này tính bằng USDC (dạng 1.384,62 = 1384.62).

## update_profile
- Chỉ truyền trường người dùng vừa nói rõ. Không đoán: chữ "lương" một mình không cho biết ổn định hay nợ.
- Mỗi con số gắn với khoản đứng cạnh nó: nợ / vay / trả góp / thẻ tín dụng → debtAmount; lương / thu nhập → monthlyIncome; chi tiêu / tiền nhà / ăn uống / sinh hoạt → monthlyExpenses; vàng / nhà đất / cổ phiếu / tài sản → otherAssets (cộng dồn nếu nhiều loại).
- "không nợ" → debtAmount {amount: 0, currency: "VND"}. Nhân viên / lương cố định → incomeStable true; freelance / tự kinh doanh / thất thường → false.
Ví dụ: "nợ thẻ tín dụng 20 triệu" → debtAmount 20000000 VND. "có 2 cây vàng 160 triệu với cổ phiếu 30 triệu" → otherAssets 190000000 VND.`

const MONEY = {
  type: 'object',
  properties: {
    amount: { type: 'number', description: 'Số tiền đúng như người dùng nói (15 triệu = 15000000)' },
    currency: { type: 'string', enum: ['VND', 'USDC'] },
  },
  required: ['amount', 'currency'],
}

const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })

const PLAN_TOOLS = [
  fn('update_profile', 'Ghi nhận số liệu tài chính người dùng vừa kể (app tự lưu). Chỉ truyền các trường vừa biết.', {
    monthlyIncome: { ...MONEY, description: 'Thu nhập mỗi tháng' },
    monthlyExpenses: { ...MONEY, description: 'Chi tiêu thiết yếu mỗi tháng' },
    debtAmount: { ...MONEY, description: 'Tổng nợ bên ngoài; không có nợ thì amount 0' },
    otherAssets: { ...MONEY, description: 'Tài sản khác (vàng, BĐS ngoài nhà ở, cổ phiếu…)' },
    age: { type: 'integer' },
    incomeStable: { type: 'boolean', description: 'Lương cố định = true; freelance / kinh doanh = false' },
  }),
  fn('prepare_deposit', 'Mở màn Quỹ, tab Nạp, điền sẵn số tiền để người dùng tự ký nạp vào vault.', { amount: MONEY }, ['amount']),
  fn('prepare_withdraw', 'Mở màn Quỹ, tab Rút, điền sẵn số tiền để người dùng tự ký rút về ví của họ.', { amount: MONEY }, ['amount']),
  fn('prepare_buy_cirbtc', 'Mở màn Đầu tư, điền sẵn số tiền mua cirBTC; người dùng xem báo giá rồi tự ký.', { amount: MONEY }, ['amount']),
  fn('propose_dca', 'Đề xuất mua cirBTC định kỳ (DCA); người dùng bấm Duyệt.', {
    amount: { ...MONEY, description: 'Số tiền mỗi kỳ' },
    intervalDays: { type: 'integer', description: 'Số ngày giữa 2 lần mua, mặc định 7' },
  }, ['amount']),
  fn('stop_dca', 'Dừng kế hoạch mua cirBTC định kỳ (DCA).'),
  fn('open_screen', 'Mở một màn trong app cho người dùng xem.', {
    screen: { type: 'string', enum: ['fund', 'invest', 'balance', 'menu'], description: 'fund = Quỹ, invest = Đầu tư, balance = Cân đối, menu = Ví & cài đặt' },
  }, ['screen']),
  fn('no_action', 'Không cần thao tác nào trong app (câu hỏi, chào hỏi, trò chuyện).'),
]

const REPLY_TOOLS = [
  fn('web_search', 'Tìm thông tin tài chính, thị trường, lãi suất, tỷ giá, tin tức mới nhất.', {
    query: { type: 'string', description: 'Câu tìm kiếm bằng tiếng Việt hoặc tiếng Anh' },
  }, ['query']),
]

const SCREEN_NAMES: Record<string, string> = { fund: 'Quỹ', invest: 'Đầu tư', balance: 'Cân đối', menu: 'Ví & cài đặt' }

const UI_ACTIONS = new Set(['prepare_deposit', 'prepare_withdraw', 'prepare_buy_cirbtc', 'propose_dca', 'open_screen'])
const INVEST_ACTIONS = new Set(['prepare_buy_cirbtc', 'propose_dca'])

/** Map OpenAI failures to a clear message (AGENTS.md Part 3, rule 4: fail loudly). */
async function openAiError(res: Response): Promise<Response> {
  const err = await res.text()
  console.error('OpenAI error:', res.status, err)
  if (res.status === 401) return json({ error: 'khoá OpenAI không hợp lệ' }, 502)
  if (res.status === 429 && /insufficient_quota/.test(err)) return json({ error: 'tài khoản OpenAI hết credit' }, 502)
  if (res.status === 429) return json({ error: 'OpenAI đang giới hạn tốc độ, thử lại sau ít phút' }, 502)
  return json({ error: `OpenAI lỗi ${res.status}` }, 502)
}

async function openai(apiKey: string, body: Record<string, unknown>): Promise<Completion | Response> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) return openAiError(res)
  return await res.json() as Completion
}

async function webSearch(query: string): Promise<string> {
  // DuckDuckGo Instant Answer API (no key needed)
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'MoonSafe/1.0' } })
    if (!res.ok) return `Không tìm được kết quả cho "${query}".`
    const data = await res.json() as { AbstractText?: string; Answer?: string; RelatedTopics?: Array<{ Text?: string }> }
    const result = data.AbstractText || data.Answer || data.RelatedTopics?.[0]?.Text || ''
    return (result || `Không tìm thấy thông tin cụ thể cho "${query}".`).slice(0, 4000)
  } catch {
    return 'Không thể tìm kiếm lúc này.'
  }
}

// Emergency-fund floor worked out here, in the user's own currency, so the model only
// quotes it (it multiplied and converted wrongly when left to do it).
function moneyOf(v: unknown, unit: unknown): { amount: number; currency: 'VND' | 'USDC' } | null {
  if (v && typeof v === 'object' && 'amount' in v) {
    const o = v as { amount?: unknown; currency?: unknown }
    return typeof o.amount === 'number' && o.amount > 0 ? { amount: o.amount, currency: o.currency === 'USDC' ? 'USDC' : 'VND' } : null
  }
  return typeof v === 'number' && v > 0 ? { amount: v, currency: unit === 'USDC' ? 'USDC' : 'VND' } : null
}

function floorNote(profile: unknown, update: Record<string, unknown> | null): string {
  const p = { ...((profile && typeof profile === 'object' ? profile : {}) as Record<string, unknown>), ...(update ?? {}) }
  const units = (p.units && typeof p.units === 'object' ? p.units : {}) as Record<string, unknown>
  const exp = moneyOf(p.monthlyExpenses, units.monthlyExpenses)
  if (!exp) return ''
  const fmt = (n: number) => exp.currency === 'USDC'
    ? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n)} USDC`
    : n >= 1_000_000 ? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(n / 1_000_000)} triệu` : `${new Intl.NumberFormat('vi-VN').format(n)} ₫`
  const stable = typeof p.incomeStable === 'boolean' ? p.incomeStable : null
  if (stable === null) {
    return `Mốc quỹ dự phòng (app đã tính, trích đúng số này): có việc làm ổn định → 3 tháng = ${fmt(exp.amount * 3)}; thu nhập chưa ổn định → 6 tháng = ${fmt(exp.amount * 6)}. Độ ổn định CHƯA biết: khi nói về quỹ, nêu đủ hai mốc rồi hỏi công việc có ổn định không.`
  }
  return `Mốc quỹ dự phòng (app đã tính, trích đúng số này): ${stable ? 'thu nhập ổn định → 3 tháng' : 'thu nhập không ổn định → 6 tháng'} = ${fmt(exp.amount * (stable ? 3 : 6))}.`
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const apiKey = context.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'Agent chưa được cấu hình khoá AI' }, 503)

  let body: RequestBody
  try {
    body = await context.request.json() as RequestBody
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-30)
  const appState = body.context ?? (body.profile ? { profile: body.profile } : null)
  const stateText = `Trạng thái hiện tại của người dùng trong app (dữ liệu thật, mới nhất): ${JSON.stringify(appState ?? {})}`

  // ---- 1. PLAN: forced tool call --------------------------------------------------
  const plan = await openai(apiKey, {
    model: 'gpt-4o',
    messages: [{ role: 'system', content: PLAN_PROMPT }, ...messages.slice(-4), { role: 'system', content: stateText }],
    tools: PLAN_TOOLS,
    tool_choice: 'required',
    temperature: 0,
    max_tokens: 400,
  })
  if (plan instanceof Response) return plan
  if (plan.usage) console.log(`plan tokens in=${plan.usage.prompt_tokens} out=${plan.usage.completion_tokens}`)

  let profileUpdate: Record<string, unknown> | null = null
  let dcaStop = false
  const actions: Array<Record<string, unknown>> = []
  const done: string[] = []
  const investUnlocked = appState?.investUnlocked === true

  for (const call of plan.choices[0]?.message.tool_calls ?? []) {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown> } catch { continue }
    const name = call.function.name
    if (name === 'update_profile' && Object.keys(args).length) {
      profileUpdate = { ...(profileUpdate ?? {}), ...args }
      done.push(`Đã ghi nhận số MỚI: ${JSON.stringify(args)}. App đã lưu, có hiệu lực ngay${appState?.profileSaved ? ' (thay số cũ, đừng nói ngược lại bằng số cũ)' : ''}; người dùng xem lại ở tab Cân đối. Dùng động từ "đã ghi nhận".`)
    } else if (name === 'stop_dca') {
      dcaStop = true
      done.push('Đã dừng DCA trong app.')
    } else if (UI_ACTIONS.has(name)) {
      if (INVEST_ACTIONS.has(name) && !investUnlocked) {
        done.push(`BỊ CHẶN ${name}: đầu tư đang khoá (cần không nợ và quỹ đủ sàn). Không mở gì.`)
        continue
      }
      actions.push({ type: name, ...args })
      const amt = JSON.stringify(args.amount)
      done.push(
        name === 'open_screen' ? `Đã mở màn ${SCREEN_NAMES[String(args.screen)] ?? String(args.screen)}; người dùng đang xem trên app, KHÔNG liệt kê lại số liệu, chỉ nói 1 câu ngắn.`
        : name === 'propose_dca' ? `Đã hiện ĐỀ XUẤT DCA ${amt} mỗi ${String(args.intervalDays ?? 7)} ngày ở màn Đầu tư. CHƯA thiết lập: người dùng phải bấm "Duyệt DCA", rồi mỗi kỳ tự xem báo giá và ký.`
        : name === 'prepare_deposit' ? `Đã mở màn Nạp, điền sẵn ${amt}. CHƯA nạp: người dùng bấm "Nạp vào quỹ" rồi ký trong ví.`
        : name === 'prepare_withdraw' ? `Đã mở màn Rút, điền sẵn ${amt}. CHƯA rút: người dùng bấm "Rút về ví" rồi ký; tiền về ví của chính họ.`
        : `Đã mở màn Đầu tư, điền sẵn ${amt} để mua cirBTC. CHƯA mua: người dùng bấm "Xem báo giá", kiểm tra rồi ký.`)
    }
  }

  // ---- 2. REPLY ---------------------------------------------------------------------
  const replyMessages: Message[] = [
    { role: 'system', content: REPLY_PROMPT },
    ...messages,
    { role: 'system', content: stateText + (appState?.profileSaved
      ? '\nAgent đã có đủ thông tin tài chính của người dùng: không hỏi lại các trường đã có. Muốn đổi số thì người dùng chỉ cần nói lại với agent.'
      : '') },
    { role: 'system', content: `Thao tác vừa thực hiện: ${done.length ? done.join(' | ') : 'không có thao tác nào.'}` },
  ]
  const floor = floorNote(appState?.profile, profileUpdate)
  if (floor) replyMessages.push({ role: 'system', content: floor })

  for (let round = 1; round <= 3; round++) {
    const reply = await openai(apiKey, {
      model: 'gpt-4o-mini',
      messages: replyMessages,
      tools: REPLY_TOOLS,
      tool_choice: round === 3 ? 'none' : 'auto',
      max_tokens: 800,
      temperature: 0.5,
    })
    if (reply instanceof Response) return reply
    const msg = reply.choices[0]?.message
    if (reply.usage) console.log(`reply tokens in=${reply.usage.prompt_tokens} out=${reply.usage.completion_tokens} round=${round}`)
    if (!msg?.tool_calls?.length) {
      return json({ content: msg?.content ?? '', profileUpdate, dcaStop, actions })
    }
    replyMessages.push({ role: 'assistant', content: msg.content ?? '', ...{ tool_calls: msg.tool_calls } } as Message)
    for (const call of msg.tool_calls) {
      let result = 'Tool không hỗ trợ.'
      if (call.function.name === 'web_search') {
        try { result = await webSearch((JSON.parse(call.function.arguments) as { query: string }).query) } catch { result = 'Lỗi khi tìm kiếm.' }
      }
      replyMessages.push({ role: 'tool', content: result, tool_call_id: call.id })
    }
  }
  return json({ error: 'agent cần quá nhiều bước, hãy hỏi lại ngắn hơn' }, 502)
}
