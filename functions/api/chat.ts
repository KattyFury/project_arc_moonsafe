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
//
// Personal-finance framework (docs/FRAMEWORK-TAI-CHINH.md, 2026-10-24): fund first, then the
// money outside the fund is split safe / invest / idle, target safe = age %, invest = 100 − age %.
// Allocation numbers come from src/lib/allocation.ts, the same code the app's chart uses.

import { getPrices } from './prices'
import { allocate, mergeHoldings, toHolding, type Allocation } from '../../src/lib/allocation'
import type { Holding } from '../../src/types'

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

const RULES = `## Khung MoonSafe
1. Quỹ dự phòng trước: 3 tháng chi tiêu thiết yếu nếu thu nhập ổn định, 6 tháng nếu không. Giữ bằng USDC trong vault, đứng riêng, không tính vào phân bổ.
2. Mua cirBTC / DCA trong app chỉ mở khi: không còn nợ bên ngoài VÀ quỹ đủ mốc (investUnlocked = true).
3. Tiền NGOÀI quỹ chia 3 phần: An toàn = gửi tiết kiệm ngân hàng (được bảo hiểm tiền gửi). Đầu tư = vàng, cổ phiếu Mỹ, coin, cirBTC. Nhàn rỗi = tiền chưa phân bổ (USDC trong ví, tiền mặt, stablecoin).
4. Mục tiêu theo tuổi: an toàn = tuổi %, đầu tư = 100 − tuổi % (31 tuổi: 31% an toàn, 69% đầu tư). Nhàn rỗi là tiền người dùng còn phải chia.
5. Đầu tư vào gì, bao nhiêu là quyền của người dùng; MoonSafe không chỉ định tài sản, không dự đoán thị trường. Crypto ở MoonSafe được nhiều hơn mức các tổ chức tài chính truyền thống khuyên (0–5%). Lệch mục tiêu thì nói rõ lệch bao nhiêu, không ép, không chặn.`

// The user declining to share something ("không muốn nói thu nhập", "bí mật"…).
const DECLINES = /(không|chưa|ko|k)\s+(muốn|thích|tiện|định)\s+(nói|kể|chia sẻ|tiết lộ|khai)|bí mật|riêng tư|đừng hỏi/i

// A UI action only runs when the latest message asks for one or clearly agrees to the
// agent's offer (2026-10-22 eval: "Mình đi làm văn phòng" opened a prefilled deposit).
// \b treats Vietnamese letters as non-word, so word edges are written with \p{L}.
// Agreement only counts at the start of the message ("lương được 20 triệu" is not a yes).
const ACTION_INTENT = /(?<!\p{L})(nạp|rút|mua|bán|dca|mở(?!\s*kh(?:oá|óa|oa))|xem|điền|dừng|chuyển|làm đi)(?!\p{L})|^\s*(ok|oke|okay|được|đồng ý|ừ|uk|yes|chốt|nhất trí|triển)(?!\p{L})/iu
const INVEST_INTENT = /(?<!\p{L})(mua|đầu tư|cirbtc|dca|btc)(?!\p{L})/iu
// Each card needs its own verb (or a plain yes): "mua 100 USDC cirBTC" while locked once
// came back as a deposit card (eval 2026-10-24).
const AGREES = /^\s*(ok|oke|okay|được|đồng ý|ừ|uk|yes|chốt|nhất trí|triển)(?!\p{L})/iu
const ACTION_VERB: Record<string, RegExp> = {
  prepare_deposit: /(?<!\p{L})(nạp|bỏ vào quỹ|cho vào quỹ)(?!\p{L})/iu,
  prepare_withdraw: /(?<!\p{L})rút(?!\p{L})/iu,
  prepare_buy_cirbtc: /(?<!\p{L})mua(?!\p{L})/iu,
  propose_dca: /(?<!\p{L})(dca|mua đều|định kỳ|mỗi tuần|mỗi tháng)(?!\p{L})/iu,
}
// Questions where the reply must state the target split by age.
const ASKS_TARGET = /(bao nhiêu (phần trăm|%)|tỷ lệ|tỉ lệ|phân bổ|chia (tiền|thế nào|sao)|mua[^.?!\n]{0,25}bao nhiêu)/iu

/**
 * Last resort after the rewrites: remove a repeated "ổn định?" question, then keep only the
 * last question if several remain (one question per reply).
 */
function tidyQuestions(text: string, dropStable: boolean): string {
  const lines = text.split('\n').map(line => line.split(/(?<=[.!?])\s+/))
  if (dropStable) for (const parts of lines) for (let i = parts.length - 1; i >= 0; i--) if (/ổn định[^.!?]*\?$/i.test(parts[i].trim())) parts.splice(i, 1)
  const questions = lines.flatMap((parts, li) => parts.map((p, pi) => ({ li, pi, q: p.trim().endsWith('?') }))).filter(x => x.q)
  for (const x of questions.slice(0, -1)) lines[x.li][x.pi] = ''
  return lines.map(parts => parts.filter(Boolean).join(' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Phrases that report an app action as done; only allowed when an action actually ran.
const CLAIMS_ACTION = /(đã|vừa)\s+(mở|điền|hiện|tạo)(?!\s*kh(?:oá|óa|oa))\s*(sẵn)?|mở sẵn màn .{0,40} (rồi|cho bạn)/i

const REPLY_PROMPT = `Bạn là chuyên gia tư vấn tài chính cá nhân của MoonSafe (quản lý tài chính cá nhân onchain cho dân Web3). Xưng "mình", gọi "bạn", không bao giờ xưng "tôi".

## Cách nói
- Vào thẳng trọng tâm: trả lời đúng điều được hỏi trong 2–4 câu; số tiền và ý chính in **đậm**. Chỉ dài hơn khi người dùng hỏi kiến thức.
- KHÔNG mở đầu bằng "cảm ơn bạn đã chia sẻ", KHÔNG kể lại điều người dùng vừa nói, KHÔNG liệt kê lại số dư khi câu trả lời không cần.
- Không sáo rỗng, không giảng đạo lý, không phán xét chi tiêu. Thuật ngữ thì giải thích bằng nửa câu.
- Nói về đầu tư thì kèm nửa câu: đây là tham khảo, có rủi ro, không cam kết lời.
- Vì sao cần quỹ (1 câu, khi hợp): gặp chuyện bất ngờ mà không có quỹ thì phải bán tài sản đầu tư, nhiều khi đúng lúc giá giảm nên bán lỗ, hoặc phải đi vay.

${RULES}

## Con số (sai là mất lòng tin)
- Chỉ dùng số trong "SỐ LIỆU TÀI SẢN & QUỸ", trạng thái app, hoặc lời người dùng. KHÔNG tự cộng / trừ / nhân / chia / quy đổi VND↔USDC, không ghép hai đơn vị kiểu "30 triệu − 1.000 USDC". Số nào chưa có thì nói chưa tính được.
- Mốc quỹ luôn viết "N tháng chi tiêu = số tiền". Dòng ghi "ĐÃ ĐỦ" thì nói đã đủ. Chưa biết thu nhập ổn định không thì nêu đủ hai mốc 3 và 6 tháng (đừng gộp "3–6 tháng") rồi hỏi.
- Nạp quỹ là để dành, KHÔNG phải trả nợ. Chỉ đề nghị nạp số ví nạp được. Dòng quỹ ghi "VÍ ĐÃ ĐỦ để nạp ngay" thì đề nghị tạo lệnh nạp phần thiếu; ví không đủ thì đề nghị nạp số ví có và khuyên để dành đều mỗi tháng (nêu "cần khoảng N tháng" nếu số liệu có).

## Phân bổ
- Nói mục tiêu thì LUÔN nêu đủ hai phần dạng "an toàn X%, đầu tư Y%" (theo dòng "Mục tiêu theo tuổi").
- Trích dòng "PHÂN BỔ", "Mục tiêu theo tuổi", "Gợi ý chia tiền nhàn rỗi". % mục tiêu tính trên TỔNG tiền ngoài quỹ, KHÔNG phải trên tiền nhàn rỗi; số tiền nên chia thì lấy đúng dòng "Gợi ý chia".
- Phần an toàn = gửi tiết kiệm ở ngân hàng, người dùng tự gửi ngoài app. Quỹ dự phòng (vault) KHÁC phần an toàn: KHÔNG đề nghị nạp quỹ hay "tạo lệnh" để tăng phần an toàn.
- Trong app chỉ mua được cirBTC (khi đầu tư đã mở khoá). Vàng, cổ phiếu, coin khác người dùng tự mua ở nơi khác rồi kể cho agent để theo dõi.
- KHÔNG có trần mua. Hỏi "mua được bao nhiêu" → mua bao nhiêu là quyền của bạn (tối đa số USDC trong ví), rồi nêu mục tiêu đầu tư và số trong dòng "Gợi ý chia".
- Hỏi về việc giữ nhiều crypto hơn mức các tổ chức khuyên → nói đúng quan điểm MoonSafe: chấp nhận crypto cao hơn 0–5%, miễn quỹ dự phòng đủ và tổng đầu tư quanh mục tiêu theo tuổi; kèm rủi ro, không khuyên bán.

## Thao tác
- Chỉ kể đúng thao tác trong ghi chú "Thao tác vừa thực hiện"; không có thì KHÔNG nói đã mở / đã điền / đã tạo / đã hiện. Muốn đề nghị thì hỏi: "Bạn có muốn mình tạo lệnh … để bạn ký không?".
- Nạp / rút / mua / DCA hiện THẺ XÁC NHẬN dưới câu trả lời; người dùng tự bấm và ký trong ví. Không nói "đã nạp / rút / mua / lưu / thiết lập".
- Ghi chú có "Đã ghi nhận" thì nói "Đã ghi nhận." một lần, KHÔNG kể lại từng số hay từng tài sản họ vừa nói; dành câu còn lại cho một nhận xét có ích. Người dùng xem lại ở tab Cân đối, sửa bằng cách nói lại với agent.
- Ghi chú có "Đã hiện biểu đồ phân bổ" thì chỉ nhận xét 1–2 câu (lệch mục tiêu bao nhiêu, tiền nhàn rỗi nên chia thế nào), không đọc lại cả bảng.
- Thao tác bị chặn, hoặc người dùng muốn mua mà số liệu ghi "Đầu tư đang KHOÁ": câu đầu nói rõ "đầu tư đang khoá" và lý do theo dòng đó, rồi mới nói bước tiếp theo.

## Hỏi
- Tối đa MỘT câu hỏi mỗi lượt, và chỉ hỏi khi nó giúp câu đang bàn. Không ép khai báo.
- Trường đã có giá trị trong profile thì không hỏi lại. Câu lượt trước đã hỏi mà người dùng lờ đi thì không hỏi lại ngay.
- Người dùng từ chối kể thì không hỏi chuyện riêng, nói lúc nào muốn kể cũng được.
- Không tự nhắc chuyện khoá đầu tư hay thông tin còn thiếu khi người dùng không hỏi về mua / đầu tư.
- Chào hỏi: một câu chào, một câu hỏi mở (ví dụ "bạn muốn bắt đầu từ chi tiêu, để dành hay đầu tư?"). KHÔNG nhắc khoá đầu tư, KHÔNG liệt kê thông tin còn thiếu, KHÔNG mời "cung cấp thông tin".
- Ngoài phạm vi tài chính cá nhân thì có thể dùng web_search.`

const PLAN_PROMPT = `Bạn là bộ điều phối thao tác của app MoonSafe. Đọc tin nhắn MỚI NHẤT của người dùng (tin trước chỉ để hiểu ngữ cảnh) cùng trạng thái app, rồi GỌI tool phù hợp. Bắt buộc gọi ít nhất một tool; không có gì cần làm thì gọi no_action.

${RULES}

## Chọn tool
- Người dùng KỂ số liệu của họ (thu nhập, chi tiêu, nợ, tuổi, công việc, nhà đất) → update_profile.
- Người dùng KỂ tài sản đang có: gửi tiết kiệm ngân hàng, tiền mặt / tài khoản thanh toán, vàng, cổ phiếu Mỹ, coin trên sàn hoặc ví khác → record_asset, mỗi khoản một mục. Bán hết / không còn → quantity 0. Có thể gọi cùng update_profile.
- Hỏi về phân bổ, tỷ lệ an toàn / đầu tư, "tiền mình đang chia thế nào", "nên chia tiền nhàn rỗi ra sao", hoặc bảo xem biểu đồ → show_allocation. Chỉ nói "muốn đầu tư" / "mua …" mà không hỏi tỷ lệ → KHÔNG show_allocation.
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
- Mỗi con số gắn với khoản đứng cạnh nó: nợ / vay / trả góp / thẻ tín dụng → debtAmount; lương / thu nhập → monthlyIncome; chi tiêu / tiền nhà / ăn uống / sinh hoạt → monthlyExpenses; nhà, đất, xe, cổ phiếu Việt Nam, tài sản không có trong record_asset → otherAssets (cộng dồn nếu nhiều loại).
- "không nợ" → debtAmount {amount: 0, currency: "VND"}. Nhân viên / lương cố định → incomeStable true; freelance / tự kinh doanh / thất thường → false.
Ví dụ: "nợ thẻ tín dụng 20 triệu" → debtAmount 20000000 VND. "có căn chung cư 2 tỷ" → otherAssets 2000000000 VND.

## record_asset
- savings = gửi tiết kiệm (quantity = số tiền, currency, symbol = tên ngân hàng nếu có). cash = tiền mặt / tài khoản thanh toán (quantity = số tiền, currency).
- gold = vàng (quantity = số lượng, unit "luong" hoặc "chi"; 1 cây = 1 lượng = 10 chỉ). Người dùng chỉ nói giá trị vàng mà không nói số lượng → không ghi.
- stock = cổ phiếu / ETF niêm yết ở Mỹ (symbol = mã: SPY, VOO, AAPL; quantity = số cổ). Cổ phiếu Việt Nam (FPT, VNM…) KHÔNG dùng stock: ghi vào update_profile.otherAssets theo giá trị họ nói.
- crypto = coin ngoài Arc (symbol: BTC, ETH, SOL, USDT…; quantity = số coin). cirBTC trong ví Arc app tự đọc, không ghi.
- Chỉ ghi số lượng người dùng nói, không đoán. Ví dụ: "gửi Vietcombank 100 triệu, có 2 cây vàng và 0,5 ETH trên Binance" → savings 100000000 VND symbol "Vietcombank"; gold 2 luong; crypto ETH 0.5.`

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
    otherAssets: { ...MONEY, description: 'Tài sản không theo dõi giá: nhà, đất, xe, cổ phiếu Việt Nam…' },
    age: { type: 'integer' },
    incomeStable: { type: 'boolean', description: 'Lương cố định = true; freelance / kinh doanh = false' },
  }),
  fn('record_asset', 'Ghi nhận tài sản người dùng đang có (app tự lấy giá và vẽ biểu đồ phân bổ). Mỗi khoản một mục; quantity 0 = không còn khoản đó.', {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['savings', 'cash', 'gold', 'stock', 'crypto'], description: 'savings = gửi tiết kiệm, cash = tiền mặt / tài khoản thanh toán, gold = vàng, stock = cổ phiếu / ETF Mỹ, crypto = coin ngoài Arc' },
          quantity: { type: 'number', description: 'savings / cash: số tiền; gold: số lượng vàng theo unit; stock: số cổ; crypto: số coin' },
          symbol: { type: 'string', description: 'stock: mã Mỹ (SPY); crypto: ký hiệu (ETH); savings / cash: tên ngân hàng nếu có' },
          unit: { type: 'string', enum: ['luong', 'chi'], description: 'Chỉ cho gold' },
          currency: { type: 'string', enum: ['VND', 'USDC'], description: 'Chỉ cho savings / cash' },
        },
        required: ['kind', 'quantity'],
      },
    },
  }, ['items']),
  fn('show_allocation', 'Hiện biểu đồ phân bổ (mục tiêu theo tuổi và hiện tại) ngay trong chat.'),
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

function fundFacts(appState: Record<string, unknown> | null, update: Record<string, unknown> | null, rate: number | null, alloc: Allocation): { text: string; floors: Floor[] } {
  const floors: Floor[] = []
  const p = { ...((appState?.profile && typeof appState.profile === 'object' ? appState.profile : {}) as Record<string, unknown>), ...(update ?? {}) }
  const units = (p.units && typeof p.units === 'object' ? p.units : {}) as Record<string, unknown>
  const exp = moneyOf(p.monthlyExpenses, units.monthlyExpenses)
  const vault = typeof appState?.vaultUsdc === 'number' ? appState.vaultUsdc : null
  const wallet = typeof appState?.walletUsdc === 'number' ? appState.walletUsdc : null
  const stable = typeof p.incomeStable === 'boolean' ? p.incomeStable : null
  if (vault === null && wallet === null && !exp && !alloc.parts.length && !alloc.unpriced.length) return { text: '', floors }

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
  let savedUsd: number | null = null
  if (inc && exp) {
    const incUsd = inc.currency === 'USDC' ? inc.amount : rate ? inc.amount / rate : null
    const expUsd = exp.currency === 'USDC' ? exp.amount : rate ? exp.amount / rate : null
    if (incUsd && expUsd !== null) {
      savedUsd = incUsd - expUsd
      const saved = inc.currency === exp.currency ? inc.amount - exp.amount : null
      lines.push(`- Tỷ lệ tiết kiệm (thu nhập − chi tiêu) / thu nhập: ${Math.round((incUsd - expUsd) / incUsd * 100)}%; để dành được mỗi tháng: ${saved !== null ? both({ amount: saved, currency: inc.currency }) : showUsd(incUsd - expUsd)}`)
    }
  }
  const age = typeof p.age === 'number' ? p.age : null
  // Allocation of the money outside the fund (same numbers as the app's chart).
  const pctOf = (v: number) => alloc.total > 0 ? Math.round(v / alloc.total * 100) : 0
  if (alloc.total > 0) {
    lines.push(`- PHÂN BỔ tiền ngoài quỹ (tổng ${showUsd(alloc.total)}): An toàn ${showUsd(alloc.safe)} (${pctOf(alloc.safe)}%) · Đầu tư ${showUsd(alloc.invest)} (${pctOf(alloc.invest)}%) · Nhàn rỗi ${showUsd(alloc.idle)} (${pctOf(alloc.idle)}%)`)
    lines.push(`- Chi tiết theo giá thị trường hiện tại: ${alloc.parts.map(x => `${x.label} ${showUsd(x.usd)} (${x.bucket === 'safe' ? 'an toàn' : x.bucket === 'invest' ? 'đầu tư' : 'nhàn rỗi'})`).join('; ')}`)
  }
  if (alloc.unpriced.length) lines.push(`- Chưa lấy được giá, tạm chưa tính: ${alloc.unpriced.map(h => h.symbol ?? h.kind).join(', ')}`)
  if (alloc.target) {
    const { safePct, investPct } = alloc.target
    let gap = ''
    if (alloc.total > 0) {
      const d = pctOf(alloc.invest) - investPct
      gap = d === 0 ? '; đầu tư đang đúng mục tiêu' : `; đầu tư đang ${d > 0 ? 'cao hơn' : 'thấp hơn'} mục tiêu ${Math.abs(d)} điểm %`
    }
    lines.push(`- Mục tiêu theo tuổi ${age}: an toàn ${safePct}%, đầu tư ${investPct}%${alloc.total > 0 ? ` (= ${showUsd(alloc.total * safePct / 100)} an toàn, ${showUsd(alloc.total * investPct / 100)} đầu tư)` : ''}${gap}`)
    if (alloc.suggest && alloc.idle > 0) lines.push(`- Gợi ý chia tiền nhàn rỗi ${showUsd(alloc.idle)} để về gần mục tiêu: ${showUsd(alloc.suggest.toSafe)} vào an toàn (người dùng tự gửi tiết kiệm ngân hàng, KHÔNG phải nạp quỹ), ${showUsd(alloc.suggest.toInvest)} vào đầu tư (người dùng tự chọn tài sản; trong app chỉ có cirBTC)`)
  } else if (alloc.total > 0) lines.push('- Chưa biết tuổi nên chưa có mục tiêu phân bổ')
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
        const rest = need - (spendable ?? 0)
        if (rest > 0 && savedUsd !== null) {
          gap += savedUsd > 0
            ? `; nếu để dành ${showUsd(savedUsd)} mỗi tháng và nạp vào quỹ thì cần khoảng ${Math.ceil(rest / savedUsd)} tháng nữa`
            : '; thu nhập hiện chưa dư để để dành (chi tiêu ≥ thu nhập)'
        }
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
  const assetUpdates: Holding[] = []
  let dcaStop = false
  const actions: Array<Record<string, unknown>> = []
  const done: string[] = []
  const investUnlocked = appState?.investUnlocked === true

  const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  // "sao không đầu tư luôn mà phải để quỹ…" asks why, it is not a request to invest.
  const asksWhy = /(?<!\p{L})(sao|tại sao|vì sao|làm gì|là gì)(?!\p{L})/iu.test(lastUserText)
  const wantsInvestLocked = !investUnlocked && INVEST_INTENT.test(lastUserText) && !asksWhy && !/(?<!\p{L})nạp(?!\p{L})/iu.test(lastUserText)
  for (const call of plan.choices[0]?.message.tool_calls ?? []) {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown> } catch { continue }
    const name = call.function.name
    if (name === 'update_profile' && Object.keys(args).length) {
      profileUpdate = { ...(profileUpdate ?? {}), ...args }
      done.push(`Đã ghi nhận số MỚI: ${JSON.stringify(args)}. App đã lưu, có hiệu lực ngay${appState?.profileSaved ? ' (thay số cũ, đừng nói ngược lại bằng số cũ)' : ''}. Chỉ cần "Đã ghi nhận." một lần, KHÔNG kể lại từng số.`)
    } else if (name === 'record_asset') {
      const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : []
      // Gold is stored in lượng (1 lượng = 10 chỉ).
      const found = items.map(i => toHolding(i.kind === 'gold' && i.unit === 'chi' && typeof i.quantity === 'number' ? { ...i, quantity: i.quantity / 10 } : i))
        .filter((h): h is Holding => h !== null)
      if (found.length) {
        assetUpdates.push(...found)
        done.push(`Đã ghi nhận tài sản: ${found.map(h => h.quantity === 0 ? `bỏ ${h.symbol ?? h.kind}` : `${h.kind}${h.symbol ? ` ${h.symbol}` : ''} ${h.quantity}${h.kind === 'gold' ? ' lượng' : h.currency ? ` ${h.currency}` : ''}`).join('; ')}. App tự lấy giá thị trường và tính vào phân bổ (dòng "PHÂN BỔ"). Chỉ cần "Đã ghi nhận." một lần.`)
      }
    } else if (name === 'show_allocation') {
      actions.push({ type: name })
      done.push('Đã hiện biểu đồ phân bổ (mục tiêu theo tuổi và hiện tại) ngay dưới câu trả lời này.')
    } else if (name === 'stop_dca') {
      dcaStop = true
      done.push('Đã dừng DCA trong app.')
    } else if (UI_ACTIONS.has(name)) {
      if (!ACTION_INTENT.test(lastUserText) || (ACTION_VERB[name] && !ACTION_VERB[name].test(lastUserText) && !AGREES.test(lastUserText))) {
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
        : name === 'propose_dca' ? `Đã hiện thẻ ĐỀ XUẤT DCA ${amt} mỗi ${String(args.intervalDays ?? 7)} ngày ngay dưới câu trả lời này trong chat. CHƯA thiết lập: người dùng bấm "Duyệt DCA" trên thẻ, rồi mỗi kỳ tự xem báo giá và ký. Nhắc 1 câu: giá cirBTC có thể giảm sâu, chỉ đầu tư số tiền sẵn sàng mất.`
        : name === 'prepare_deposit' ? `Đã hiện thẻ xác nhận NẠP ${amt} vào quỹ ngay dưới câu trả lời này trong chat. CHƯA nạp: người dùng bấm "Ký giao dịch" trên thẻ rồi xác nhận trong ví.`
        : name === 'prepare_withdraw' ? `Đã hiện thẻ xác nhận RÚT ${amt} về ví ngay dưới câu trả lời này trong chat. CHƯA rút: người dùng bấm "Ký giao dịch" trên thẻ rồi xác nhận trong ví; tiền về ví của chính họ.`
        : `Đã hiện thẻ MUA cirBTC ${amt} ngay dưới câu trả lời này trong chat. CHƯA mua: người dùng bấm "Xem báo giá" trên thẻ, kiểm tra rồi "Ký mua". Nhắc 1 câu: giá cirBTC có thể giảm sâu, chỉ đầu tư số tiền sẵn sàng mất.`)
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
  // Holdings after this turn's updates, valued at live prices (functions/api/prices.ts).
  const savedProfile = (appState?.profile && typeof appState.profile === 'object' ? appState.profile : {}) as Record<string, unknown>
  const held = (Array.isArray(savedProfile.holdings) ? savedProfile.holdings : []).map(toHolding).filter((h): h is Holding => h !== null)
  const holdings = mergeHoldings(held, assetUpdates)
  const syms = (k: Holding['kind']) => holdings.filter(h => h.kind === k && h.symbol).map(h => h.symbol!)
  const prices = holdings.some(h => h.kind === 'gold' || h.kind === 'stock' || h.kind === 'crypto') ? await getPrices(syms('stock'), syms('crypto')) : null
  const ageNow = typeof profileUpdate?.age === 'number' ? profileUpdate.age : typeof savedProfile.age === 'number' ? savedProfile.age : null
  const alloc = allocate({
    holdings,
    walletUsd: typeof appState?.walletUsdc === 'number' ? appState.walletUsdc : null,
    cirBtcUsd: typeof appState?.cirBtcUsdc === 'number' ? appState.cirBtcUsdc : null,
    age: ageNow,
    prices,
    vndPerUsd: rate,
  })
  const { text: facts, floors } = fundFacts(appState, profileUpdate, rate, alloc)
  if (facts) replyMessages.push({ role: 'system', content: facts })
  if (DECLINES.test(lastUserText)) replyMessages.push({ role: 'system', content: 'Người dùng vừa từ chối chia sẻ. Tôn trọng: câu trả lời này KHÔNG có câu hỏi nào về chuyện riêng của họ (thu nhập, công việc, độ ổn định, nợ, tuổi…). Chia sẻ kiến thức chung và nói lúc nào muốn kể cũng được.' })

  let rewrites = 0
  for (let round = 1; round <= 4; round++) {
    const reply = await openai(apiKey, {
      model: 'gpt-4o-mini',
      messages: replyMessages,
      tools: REPLY_TOOLS,
      tool_choice: round >= 3 ? 'none' : 'auto',
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
      if (!actions.length && CLAIMS_ACTION.test(content)) problems.push('không có thao tác nào được thực hiện, app KHÔNG mở hay điền gì cả: chỉ ĐỀ NGHỊ (ví dụ "Bạn có muốn mình tạo lệnh nạp … để bạn ký không?"), không nói "đã mở" / "đã điền" / "đã tạo" / "đã hiện"')
      const plain = content.replace(/\u00a0/g, ' ')
      for (const f of floors) {
        if (f.texts.some(t => plain.includes(t.replace(/\u00a0/g, ' '))) && !plain.includes(`${f.months} tháng`)) {
          problems.push(`mốc ${f.texts[0]} phải ghi rõ là "${f.months} tháng chi tiêu"`)
        }
      }
      if ((content.match(/\?/g) ?? []).length > 1) problems.push('chỉ được có MỘT câu hỏi, bỏ bớt các câu hỏi còn lại')
      const prevAssistant = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''
      // Asked about job stability: in the question itself, or the line before it ("…có ổn định không. Bạn chia sẻ thêm được không?").
      const asksStable = (t: string) => /ổn định[^.!?\n]*\?|ổn định[^.!?\n]*(không|chưa)\.\s*[^.!?\n]{0,80}\?/i.test(t)
      if (asksStable(prevAssistant) && asksStable(content) && profileUpdate?.incomeStable === undefined) problems.push('lượt trước đã hỏi công việc có ổn định không mà người dùng chưa trả lời; KHÔNG hỏi lại câu đó, trả lời đúng điều họ đang hỏi')
      if (wantsInvestLocked && !/kho[áa]|khóa/i.test(content)) problems.push('phải nói rõ "đầu tư đang khoá" và lý do ngay câu đầu')
      if (!profileUpdate && !assetUpdates.length && /đã ghi nhận/i.test(content)) problems.push('lượt này KHÔNG ghi nhận gì, bỏ chữ "Đã ghi nhận"')
      // The chart under the reply already shows every share; a reply that reads it back buries the point.
      if (actions.some(a => a.type === 'show_allocation') && content.length > 380) problems.push('biểu đồ ngay dưới đã có đủ số: viết lại tối đa 2–3 câu, chỉ nói lệch mục tiêu bao nhiêu và tiền nhàn rỗi nên chia thế nào, không đọc lại từng phần')
      if (alloc.target) {
        const { safePct, investPct } = alloc.target
        const has = (n: number) => new RegExp(`(?<!\\d)${n}\\s*%`).test(plain)
        if (has(investPct) !== has(safePct) || (ASKS_TARGET.test(lastUserText) && !has(investPct))) problems.push(`nêu mục tiêu theo tuổi đủ hai phần: "an toàn ${safePct}%, đầu tư ${investPct}%" (trên tổng tiền ngoài quỹ)`)
      }
      if (/quỹ an toàn|nạp[^.?!\n]{0,40}(vào |phần )an toàn/i.test(content)) problems.push('phần an toàn là gửi tiết kiệm ngân hàng người dùng tự làm, KHÔNG phải quỹ dự phòng và không nạp được trong app')
      if (problems.length && rewrites < 2 && round < 4) {
        rewrites++
        replyMessages.push({ role: 'assistant', content })
        replyMessages.push({ role: 'system', content: `Câu vừa rồi cần sửa: ${problems.join('; ')}. Viết lại toàn bộ câu trả lời, giữ nguyên các số liệu đúng.` })
        continue
      }
      // Still asking twice after the rewrites: drop the extra questions rather than send them.
      const tidy = tidyQuestions(content, asksStable(prevAssistant) && profileUpdate?.incomeStable === undefined)
      return json({ content: tidy, profileUpdate, assetUpdates: assetUpdates.length ? assetUpdates : null, dcaStop, actions, ...(body.debug ? { facts, notes: done } : {}) })
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
