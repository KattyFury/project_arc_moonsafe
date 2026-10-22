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
  /** Eval harness: also return the computed fund facts (no secrets in them). */
  debug?: boolean
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
- Tỷ lệ đầu tư tối đa: Normal = 110 − tuổi (%), Risky = 120 − tuổi (%), tính trên tiền NGOÀI quỹ (USDC trong ví + cirBTC đang giữ), KHÔNG phải trên thu nhập
- Chỉ được đầu tư (mua cirBTC, DCA) khi: không có nợ ngoài VÀ quỹ đủ sàn (investUnlocked = true)`

// The user declining to share something ("không muốn nói thu nhập", "bí mật"…).
const DECLINES = /(không|chưa|ko|k)\s+(muốn|thích|tiện|định)\s+(nói|kể|chia sẻ|tiết lộ|khai)|bí mật|riêng tư|đừng hỏi/i

// A UI action only runs when the latest message asks for one or clearly agrees to the
// agent's offer (2026-10-22 eval: "Mình đi làm văn phòng" opened a prefilled deposit).
// \b treats Vietnamese letters as non-word, so word edges are written with \p{L}.
// Agreement only counts at the start of the message ("lương được 20 triệu" is not a yes).
const ACTION_INTENT = /(?<!\p{L})(nạp|rút|mua|bán|dca|mở(?!\s*kh(?:oá|óa|oa))|xem|điền|dừng|chuyển|làm đi)(?!\p{L})|^\s*(ok|oke|okay|được|đồng ý|ừ|uk|yes|chốt|nhất trí|triển)(?!\p{L})/iu
const INVEST_INTENT = /(?<!\p{L})(mua|đầu tư|cirbtc|dca|btc)(?!\p{L})/iu

// Phrases that report an app action as done; only allowed when an action actually ran.
const CLAIMS_ACTION = /(đã|vừa)\s+(mở|điền|hiện)(?!\s*kh(?:oá|óa|oa))\s*(sẵn)?|mở sẵn màn .{0,40} (rồi|cho bạn)/i

const REPLY_PROMPT = `Bạn là chuyên gia tư vấn tài chính cá nhân của MoonSafe, app quản lý tài chính cá nhân onchain cho người dùng Web3. Bạn có nhiều năm kinh nghiệm giúp người trẻ sắp xếp thu chi, dựng quỹ dự phòng và đầu tư có kỷ luật. Bạn nói chuyện như một người tư vấn đáng tin: chuyên nghiệp, rõ ràng, nhưng gần gũi như đang ngồi cà phê với khách.

## Nhiệm vụ
- Lắng nghe trước, tư vấn sau. Hiểu tình hình của người dùng qua trò chuyện tự nhiên, rồi giải thích ngắn gọn vì sao nên làm gì (quỹ dự phòng để làm gì, vì sao trả nợ trước, tỷ lệ tiết kiệm bao nhiêu là ổn…).
- Không ép ai khai báo. Người dùng kể đến đâu thì tư vấn đến đó; chỉ hỏi thêm một câu mỗi lần, khi câu đó thật sự giúp được họ. Họ từ chối nói điều gì thì tôn trọng: trong câu trả lời đó KHÔNG hỏi thêm câu nào về chuyện riêng của họ, chỉ chia sẻ kiến thức chung và nói họ muốn kể lúc nào cũng được.
- Thông tin hữu ích: thu nhập / tháng, chi tiêu thiết yếu / tháng, nợ bên ngoài (có không, tổng bao nhiêu), tuổi, thu nhập ổn định không; tài sản khác. Tiền có thể là VND hoặc USDC.
- Lộ trình MoonSafe: làm rõ thu chi → tạo quỹ dự phòng → cân đối tài sản → mở khóa đầu tư. Khi đủ thông tin, gợi ý bước tiếp theo phù hợp với họ.

## Con số tiền (quan trọng nhất, sai là mất lòng tin)
- Con số tiền CHỈ được lấy từ: lời người dùng, "SỐ LIỆU TÀI SẢN & QUỸ", hoặc trạng thái app. TUYỆT ĐỐI không tự cộng, trừ, nhân, chia hay quy đổi VND↔USDC, không ghép hai đơn vị trong một câu kiểu "30 triệu − 1.000 USDC". Số nào chưa có thì nói chưa tính được, đừng ước lượng.
- Số dư ví, quỹ, mốc quỹ, phần còn thiếu, đã đủ hay chưa: dùng đúng các dòng trong "SỐ LIỆU TÀI SẢN & QUỸ" (có sẵn cả hai đơn vị). Nếu dòng đó ghi "ĐÃ ĐỦ" thì nói đã đủ, không nói "cần thêm".
- Nạp quỹ = chuyển USDC từ ví vào vault MoonSafe để dành; KHÔNG phải trả nợ. App không trả nợ hộ, đừng đề nghị "nạp để trả nợ".
- Chỉ đề nghị nạp số ví nạp được (dòng "nạp được tối đa"); ví ít hơn phần thiếu thì đề nghị nạp đúng số ví có.
- Luôn nhìn ví trước khi khuyên: dòng quỹ ghi "VÍ ĐÃ ĐỦ để nạp ngay" thì nói rõ ví đang có bao nhiêu, gợi ý nạp phần còn thiếu từ ví và hỏi có muốn mình mở sẵn màn nạp với số đó không. KHÔNG hỏi kế hoạch tiết kiệm khi tiền đã nằm sẵn trong ví. Chỉ bàn chuyện tiết kiệm thêm khi ví không đủ.
- Khi nêu mốc quỹ luôn viết dạng "N tháng chi tiêu = số tiền" để người dùng hiểu số đó từ đâu ra.
- Quỹ dự phòng khởi đầu: có việc làm / thu nhập ổn định = 3 tháng chi tiêu thiết yếu; không ổn định (freelance, tự kinh doanh, thu nhập thất thường) = 6 tháng. Đã biết độ ổn định thì chỉ nói đúng mốc của họ. CHƯA biết thì LUÔN nêu đủ hai mốc (lấy số trong "SỐ LIỆU TÀI SẢN & QUỸ"), đừng gộp thành khoảng "3–6 tháng", rồi hỏi một câu về độ ổn định.

${RULES}

## Thao tác
- Mọi thao tác trong app do hệ thống làm bằng tool TRƯỚC khi bạn trả lời; kết quả nằm trong ghi chú "Thao tác vừa thực hiện". Chỉ kể đúng những thao tác có trong ghi chú đó. KHÔNG nói đã mở / đã điền / đã làm gì nếu ghi chú không có.
- Thao tác chỉ MỞ SẴN màn và điền số; người dùng tự kiểm tra và ký trong ví. Đừng nói "đã nạp", "đã rút", "đã mua", "đã lưu".
- Số liệu người dùng kể được app tự lưu vào tài khoản của họ (không có thẻ, không có nút Lưu; đổi máy vẫn còn). Họ xem ở tab Cân đối; muốn sửa thì nói lại với agent; muốn xoá thì vào Menu.
- Nếu ghi chú báo một thao tác bị chặn (ví dụ đầu tư đang khoá), giải thích lý do và bước cần làm.
- Người dùng muốn đầu tư / mua cirBTC mà số liệu có dòng "Đầu tư đang KHOÁ" → câu đầu tiên nói rõ "đầu tư đang khoá" và lý do theo dòng đó, rồi mới gợi ý bước tiếp theo.
- Dùng đúng động từ trong ghi chú: "đã mở sẵn", "đã điền", "đã hiện đề xuất". Không nói "đã thiết lập", "đã nạp", "đã rút", "đã mua", "đã lưu". Xưng "mình", không xưng "tôi".

## Cách hỏi
- Mỗi câu trả lời có TỐI ĐA MỘT câu hỏi.
- Chào hỏi: chào ngắn, giới thiệu mình một câu, hỏi MỘT câu mở (ví dụ "bạn muốn bắt đầu từ chuyện chi tiêu, để dành hay đầu tư?"). KHÔNG liệt kê danh sách thông tin cần cung cấp.
- Câu hỏi agent đã hỏi ở lượt trước mà người dùng chưa trả lời (họ hỏi sang chuyện khác) thì KHÔNG hỏi lại ngay; trả lời đúng điều họ đang hỏi.
- Chỉ nói "đã ghi nhận" khi ghi chú "Thao tác vừa thực hiện" có dòng "Đã ghi nhận".

## Thông tin đã có
- Trường nào trong profile của trạng thái app đã có giá trị (khác null) thì TUYỆT ĐỐI không hỏi lại, kể cả khi hồ sơ chưa đủ. Chỉ hỏi trường còn thiếu, và chỉ khi nó giúp được câu đang bàn.
- profileSaved = true nghĩa là đã đủ thông tin: không hỏi lại gì, không mời "tính toán lại quỹ" từ đầu. Dùng các số đã có.

## Phong cách
- Tiếng Việt tự nhiên, xưng "mình", gọi "bạn". Chuyên nghiệp nhưng ấm áp; không sáo rỗng, không dùng thuật ngữ khi chưa giải thích.
- Ngắn gọn: thường 2–4 câu, chỉ dài hơn khi người dùng hỏi kiến thức. Dùng **bold** cho số tiền và ý chính.
- Ghi nhận điều người dùng đã làm tốt trước khi góp ý. Không phán xét chi tiêu, không giảng đạo lý.
- Chỉ tư vấn tham khảo, KHÔNG cam kết sinh lời, luôn nhắc rủi ro khi nói về đầu tư.
- Hỏi ngoài phạm vi tài chính cá nhân thì có thể dùng web_search`

const PLAN_PROMPT = `Bạn là bộ điều phối thao tác của app MoonSafe. Đọc tin nhắn MỚI NHẤT của người dùng (tin trước chỉ để hiểu ngữ cảnh) cùng trạng thái app, rồi GỌI tool phù hợp. Bắt buộc gọi ít nhất một tool; không có gì cần làm thì gọi no_action.

${RULES}

## Chọn tool
- Người dùng KỂ số liệu của họ (thu nhập, chi tiêu, nợ, tài sản, tuổi, công việc) → update_profile.
- Người dùng MUỐN nạp vào quỹ → prepare_deposit. Rút khỏi quỹ → prepare_withdraw. Mua cirBTC → prepare_buy_cirbtc. Đặt mua định kỳ → propose_dca. Dừng mua định kỳ → stop_dca.
- open_screen CHỈ khi người dùng bảo mở / xem một màn ("mở màn Quỹ", "cho mình xem cân đối"). Câu HỎI về số tiền, mốc quỹ, còn thiếu bao nhiêu, có bao nhiêu tiền → no_action (agent trả lời bằng lời).
- Người dùng đồng ý với đề nghị ngay trước đó của agent → làm đúng thao tác và đúng số agent vừa đề nghị. CHỈ tính là đồng ý khi tin mới nhất là lời đồng ý rõ ràng ("ok", "được", "đồng ý", "mở đi", "nạp đi", "làm đi", "nạp số đó"). Tin kể thêm thông tin (công việc, lương, chi tiêu…) KHÔNG phải đồng ý → không mở hay điền gì.
- "nạp 200 USDC" là lệnh nạp, KHÔNG phải số nợ. Câu hỏi chung, chào hỏi → no_action.

## Số tiền
- Truyền đúng số và loại tiền người dùng nói. USDC, USD, $, đô → "USDC" (800 đô = 800, 3k USD = 3000). Đồng, VND, triệu, tr, nghìn, k (không kèm USD/đô) → "VND" (15 triệu = 15000000, 500k = 500000). Không tự quy đổi.
- "phần còn thiếu", "nạp cho đủ", "số đó" (khi agent vừa đề nghị nạp phần thiếu) = shortfallUsdc; "hết ví", "tối đa" khi nạp = walletBalanceUsdc; "rút hết" = vaultBalanceUsdc.
- MỌI số lấy từ trạng thái app (shortfallUsdc, floorUsdc, walletBalanceUsdc, vaultBalanceUsdc…) là USDC → currency "USDC", amount viết dạng số (1.384,62 = 1384.62). Không bao giờ gắn "VND" cho các số này.

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

// ---- Fund figures ----------------------------------------------------------------
// Every emergency-fund number the reply may quote is computed here, in BOTH currencies,
// with the same rate source as the app (/api/rates → open.er-api.com). The model mixed
// "30 triệu − 1.000 USDC" when it had to subtract across currencies itself (2026-10-22).

async function vndPerUsd(): Promise<number | null> {
  try {
    const url = 'https://open.er-api.com/v6/latest/USD'
    const cache = (caches as unknown as { default: Cache }).default
    const hit = await cache.match(url)
    const res = hit ?? await fetch(url)
    if (!res.ok) return null
    if (!hit) await cache.put(url, new Response(res.clone().body, { headers: { 'Cache-Control': 'public, max-age=86400' } }))
    const data = await res.json() as { rates?: { VND?: number } }
    return data.rates?.VND && data.rates.VND > 0 ? data.rates.VND : null
  } catch {
    return null
  }
}

function moneyOf(v: unknown, unit: unknown): { amount: number; currency: 'VND' | 'USDC' } | null {
  if (v && typeof v === 'object' && 'amount' in v) {
    const o = v as { amount?: unknown; currency?: unknown }
    return typeof o.amount === 'number' && o.amount > 0 ? { amount: o.amount, currency: o.currency === 'USDC' ? 'USDC' : 'VND' } : null
  }
  return typeof v === 'number' && v > 0 ? { amount: v, currency: unit === 'USDC' ? 'USDC' : 'VND' } : null
}

const vnd = (n: number) => n >= 1_000_000
  ? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(n / 1_000_000)} triệu ₫`
  : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(n)} ₫`
const usdc = (n: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)} USDC`

/** A tool amount ({amount, currency}) as text in both currencies, so the reply never converts. */
function moneyText(v: unknown, rate: number | null): string {
  const m = moneyOf(v, undefined)
  if (!m) return 'số tiền chưa rõ'
  if (m.currency === 'USDC') return rate ? `${usdc(m.amount)} (≈ ${vnd(m.amount * rate)})` : usdc(m.amount)
  return rate ? `${vnd(m.amount)} (≈ ${usdc(m.amount / rate)})` : vnd(m.amount)
}

// Money kept in the wallet for gas when filling the fund (= GAS_RESERVE_USDC6 in useVault).
const GAS_RESERVE_USDC = 0.02

/**
 * What the user holds (wallet, fund) and, once monthly spending is known, the 3 / 6-month
 * floors with the gap and whether the wallet already covers it. Both currencies, as text.
 */
interface Floor { months: number; texts: string[] }

function fundFacts(appState: Record<string, unknown> | null, update: Record<string, unknown> | null, rate: number | null): { text: string; floors: Floor[] } {
  const floors: Floor[] = []
  const p = { ...((appState?.profile && typeof appState.profile === 'object' ? appState.profile : {}) as Record<string, unknown>), ...(update ?? {}) }
  const units = (p.units && typeof p.units === 'object' ? p.units : {}) as Record<string, unknown>
  const exp = moneyOf(p.monthlyExpenses, units.monthlyExpenses)
  const vault = typeof appState?.vaultUsdc === 'number' ? appState.vaultUsdc : null
  const wallet = typeof appState?.walletUsdc === 'number' ? appState.walletUsdc : null
  const stable = typeof p.incomeStable === 'boolean' ? p.incomeStable : null
  if (vault === null && wallet === null && !exp) return { text: '', floors }

  // Amounts in the user's own currency first (VND unless they spend in USDC), the other in brackets.
  const cur = exp?.currency ?? 'VND'
  const toUsd = (amount: number) => cur === 'USDC' ? amount : rate ? amount / rate : null
  const show = (amount: number) => {
    if (cur === 'USDC') return rate ? `${usdc(amount)} (≈ ${vnd(amount * rate)})` : usdc(amount)
    const usd = toUsd(amount)
    return usd !== null ? `${vnd(amount)} (≈ ${usdc(usd)})` : vnd(amount)
  }
  const showUsd = (usd: number) => cur === 'VND' && rate ? `${vnd(usd * rate)} (≈ ${usdc(usd)})` : rate ? `${usdc(usd)} (≈ ${vnd(usd * rate)})` : usdc(usd)
  const spendable = wallet !== null ? Math.max(0, wallet - GAS_RESERVE_USDC) : null

  const cir = typeof appState?.cirBtcUsdc === 'number' ? appState.cirBtcUsdc : 0
  const lines = [
    wallet !== null ? `- Ví của người dùng đang có: ${showUsd(wallet)} (nạp được tối đa ${showUsd(spendable ?? 0)}, giữ lại ${usdc(GAS_RESERVE_USDC)} làm phí)` : '- Ví: chưa rõ số dư',
    vault !== null ? `- Quỹ dự phòng đang có: ${showUsd(vault)}` : '- Quỹ dự phòng: chưa rõ số dư',
  ]
  // Other amounts the user told the agent, so it never converts them itself.
  const inc = moneyOf(p.monthlyIncome, units.monthlyIncome)
  const debtRaw = p.debtAmount
  const debt = moneyOf(debtRaw, units.debtAmount)
  const other = moneyOf(p.otherAssets, units.otherAssets)
  const both = (m: { amount: number; currency: 'VND' | 'USDC' }) => moneyText(m, rate)
  if (inc) lines.push(`- Thu nhập / tháng: ${both(inc)}`)
  if (debt) lines.push(`- Nợ bên ngoài: ${both(debt)}`)
  else if (debtRaw === 0 || (debtRaw && typeof debtRaw === 'object' && (debtRaw as { amount?: number }).amount === 0)) lines.push('- Nợ bên ngoài: không có')
  if (other) lines.push(`- Tài sản khác: ${both(other)}`)
  if (cir > 0) lines.push(`- cirBTC đang giữ: ${showUsd(cir)}`)
  if (inc && exp) {
    const incUsd = inc.currency === 'USDC' ? inc.amount : rate ? inc.amount / rate : null
    const expUsd = exp.currency === 'USDC' ? exp.amount : rate ? exp.amount / rate : null
    if (incUsd && expUsd !== null) {
      const saved = inc.currency === exp.currency ? inc.amount - exp.amount : null
      lines.push(`- Tỷ lệ tiết kiệm (thu nhập − chi tiêu) / thu nhập: ${Math.round((incUsd - expUsd) / incUsd * 100)}%; để dành được mỗi tháng: ${saved !== null ? both({ amount: saved, currency: inc.currency }) : showUsd(incUsd - expUsd)}`)
    }
  }
  const age = typeof p.age === 'number' ? p.age : null
  if (age !== null && spendable !== null) {
    const outside = spendable + cir
    for (const [label, base] of [['Normal', 110], ['Risky', 120]] as const) {
      const pct = Math.max(0, Math.min(100, base - age))
      const room = Math.min(spendable, Math.max(0, outside * pct / 100 - cir))
      lines.push(`- Trần đầu tư ${label} (${base} − ${age} tuổi) = ${pct}% tiền NGOÀI quỹ (ví nạp được + cirBTC = ${showUsd(outside)}); còn mua cirBTC được tối đa ${showUsd(room)}. Đây KHÔNG phải % thu nhập.`)
    }
  }
  if (appState && appState.investUnlocked !== true) {
    const why: string[] = []
    const missing = [!inc && 'thu nhập', !exp && 'chi tiêu', (debtRaw === null || debtRaw === undefined) && 'có nợ hay không', age === null && 'tuổi', stable === null && 'thu nhập có ổn định không'].filter(Boolean)
    if (missing.length) why.push(`agent chưa biết: ${missing.join(', ')}`)
    if (debt) why.push('còn nợ bên ngoài')
    if (appState.fundOk !== true) why.push('quỹ dự phòng chưa đủ mốc')
    lines.push(`- Đầu tư đang KHOÁ. Điều kiện còn thiếu (theo thứ tự): ${why.join('; ')}`)
  } else if (appState?.investUnlocked === true) lines.push('- Đầu tư đã MỞ KHOÁ')
  if (exp) {
    lines.push(`- Chi tiêu thiết yếu / tháng: ${show(exp.amount)}`)
    for (const m of stable === null ? [3, 6] : [stable ? 3 : 6]) {
      const floor = exp.amount * m
      const floorUsd = toUsd(floor)
      const who = stable === null ? `Nếu ${m === 3 ? 'có việc làm / thu nhập ổn định' : 'thu nhập chưa ổn định'}` : `Thu nhập ${stable ? 'ổn định' : 'chưa ổn định'}`
      let gap = 'chưa tính được phần còn thiếu (thiếu tỉ giá hoặc số dư quỹ)'
      if (floorUsd !== null && vault !== null) {
        const need = floorUsd - vault
        if (need <= 0) gap = 'quỹ hiện có ĐÃ ĐỦ mốc này'
        else if (spendable !== null && spendable >= need) gap = `còn thiếu ${showUsd(need)}; VÍ ĐÃ ĐỦ để nạp ngay phần này`
        else if (spendable !== null && spendable > 0) gap = `còn thiếu ${showUsd(need)}; nạp hết ví (${showUsd(spendable)}) thì vẫn thiếu ${showUsd(need - spendable)}`
        else gap = `còn thiếu ${showUsd(need)}; ví chưa có tiền để nạp`
      }
      lines.push(`- ${who}: mốc ${m} tháng = ${show(floor)}; ${gap}`)
      floors.push({ months: m, texts: [cur === 'USDC' ? usdc(floor) : vnd(floor), ...(floorUsd !== null ? [usdc(floorUsd)] : [])] })
    }
  }
  const text = `SỐ LIỆU TÀI SẢN & QUỸ (server đã tính sẵn bằng tỉ giá thật; chỉ trích NGUYÊN VĂN, không tự cộng/trừ/nhân/chia hay quy đổi):\n${lines.join('\n')}`
    + (exp && stable === null ? '\nĐộ ổn định thu nhập CHƯA biết: khi nói về quỹ, nêu đủ hai mốc, ghi rõ "3 tháng chi tiêu = …" và "6 tháng chi tiêu = …", rồi hỏi công việc có ổn định không (trừ khi người dùng vừa từ chối kể chuyện riêng).' : '')
  return { text, floors }
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
  const rate = await vndPerUsd()
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

  const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const wantsInvestLocked = !investUnlocked && INVEST_INTENT.test(lastUserText) && !/(?<!\p{L})nạp(?!\p{L})/iu.test(lastUserText)
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
      if (!ACTION_INTENT.test(lastUserText)) {
        console.log(`dropped ${name}: no request in "${lastUserText.slice(0, 60)}"`)
        continue
      }
      if (INVEST_ACTIONS.has(name) && !investUnlocked) {
        done.push(`BỊ CHẶN ${name}: đầu tư đang khoá (cần không nợ và quỹ đủ sàn). Không mở gì.`)
        continue
      }
      actions.push({ type: name, ...args })
      const amt = moneyText(args.amount, rate)
      done.push(
        name === 'open_screen' ? `Đã mở màn ${SCREEN_NAMES[String(args.screen)] ?? String(args.screen)}; người dùng đang xem trên app, KHÔNG liệt kê lại số liệu, chỉ nói 1 câu ngắn.`
        : name === 'propose_dca' ? `Đã hiện ĐỀ XUẤT DCA ${amt} mỗi ${String(args.intervalDays ?? 7)} ngày ở màn Đầu tư. CHƯA thiết lập: người dùng phải bấm "Duyệt DCA", rồi mỗi kỳ tự xem báo giá và ký. Nhắc 1 câu: giá cirBTC có thể giảm sâu, chỉ đầu tư số tiền sẵn sàng mất.`
        : name === 'prepare_deposit' ? `Đã mở màn Nạp, điền sẵn ${amt}. CHƯA nạp: người dùng bấm "Nạp vào quỹ" rồi ký trong ví.`
        : name === 'prepare_withdraw' ? `Đã mở màn Rút, điền sẵn ${amt}. CHƯA rút: người dùng bấm "Rút về ví" rồi ký; tiền về ví của chính họ.`
        : `Đã mở màn Đầu tư, điền sẵn ${amt} để mua cirBTC. CHƯA mua: người dùng bấm "Xem báo giá", kiểm tra rồi ký. Nhắc 1 câu: giá cirBTC có thể giảm sâu, chỉ đầu tư số tiền sẵn sàng mất.`)
    }
  }

  if (wantsInvestLocked && !done.some(d => d.startsWith('BỊ CHẶN'))) {
    done.push('Người dùng muốn đầu tư nhưng ĐẦU TƯ ĐANG KHOÁ: câu đầu tiên phải nói rõ "đầu tư đang khoá" và lý do theo dòng "Đầu tư đang KHOÁ" trong số liệu, rồi mới gợi ý bước tiếp theo.')
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
  const { text: facts, floors } = fundFacts(appState, profileUpdate, rate)
  if (facts) replyMessages.push({ role: 'system', content: facts })
  if (DECLINES.test(lastUserText)) replyMessages.push({ role: 'system', content: 'Người dùng vừa từ chối chia sẻ. Tôn trọng: câu trả lời này KHÔNG có câu hỏi nào về chuyện riêng của họ (thu nhập, công việc, độ ổn định, nợ, tuổi…). Chia sẻ kiến thức chung và nói lúc nào muốn kể cũng được.' })

  let rewritten = false
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
      const content = msg?.content ?? ''
      // The model sometimes claims a screen was opened / filled when no action ran
      // (measured 2026-10-22: "Mình đã mở sẵn màn nạp" with actions = []). Rewrite once.
      const problems: string[] = []
      if (!actions.length && CLAIMS_ACTION.test(content)) problems.push('không có thao tác nào được thực hiện, app KHÔNG mở hay điền gì cả: chỉ ĐỀ NGHỊ (ví dụ "Bạn có muốn mình mở sẵn màn nạp … không?"), không nói "đã mở" / "đã điền"')
      const plain = content.replace(/\u00a0/g, ' ')
      for (const f of floors) {
        if (f.texts.some(t => plain.includes(t.replace(/\u00a0/g, ' '))) && !plain.includes(`${f.months} tháng`)) {
          problems.push(`mốc ${f.texts[0]} phải ghi rõ là "${f.months} tháng chi tiêu"`)
        }
      }
      if (wantsInvestLocked && !/kho[áa]|khóa/i.test(content)) problems.push('phải nói rõ "đầu tư đang khoá" và lý do ngay câu đầu')
      if (problems.length && !rewritten && round < 3) {
        rewritten = true
        replyMessages.push({ role: 'assistant', content })
        replyMessages.push({ role: 'system', content: `Câu vừa rồi cần sửa: ${problems.join('; ')}. Viết lại toàn bộ câu trả lời, giữ nguyên các số liệu đúng.` })
        continue
      }
      return json({ content, profileUpdate, dcaStop, actions, ...(body.debug ? { facts, notes: done } : {}) })
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
