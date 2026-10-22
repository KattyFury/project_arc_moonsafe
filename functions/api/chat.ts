// Cloudflare Pages Function — server-side OpenAI chat with tool-calling
// OPENAI_API_KEY is in Cloudflare environment variables (never in client bundle)

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const SYSTEM_PROMPT = `Bạn là agent tài chính cá nhân của MoonSafe — app giúp người dùng Web3 xây dựng quỹ dự phòng bằng USDC trước khi đầu tư.

Câu chốt: "Nên đầu tư nhưng phải có đường lui."

## Nhiệm vụ
Dẫn người dùng khai báo thông tin tài chính qua hội thoại tự nhiên bằng tiếng Việt. Hỏi từng câu, không hỏi nhiều thứ một lúc. Khi đã đủ thông tin, xuất JSON.

## Thông tin cần thu thập
1. Thu nhập hàng tháng (VND hoặc USDC)
2. Chi tiêu thiết yếu hàng tháng (ăn, nhà, đi lại, điện nước — VND hoặc USDC)
3. Nợ bên ngoài: có không, tổng bao nhiêu (vay ngân hàng, thẻ tín dụng, trả góp, vay người quen)
4. Tuổi
5. Thu nhập có ổn định không? (lương cố định = ổn định; freelance/kinh doanh = không)
6. Tài sản khác (vàng, BĐS ngoài nhà ở, cổ phiếu — VND, bỏ qua nếu không có)

## Luật tài chính (áp dụng khi tư vấn)
- Thứ tự bắt buộc: hết nợ → quỹ dự phòng → đầu tư
- Sàn quỹ: 3 tháng chi tiêu nếu thu nhập ổn định, 6 tháng nếu không ổn định
- Mốc an toàn: 12 tháng (khi tài sản ngoài nhà ≥ 4× chi tiêu 12 tháng)
- Chỉ USDC là "an toàn" trong context của app này
- Tỷ lệ đầu tư tối đa: Normal = 110 − tuổi (%), Risky = 120 − tuổi (%)
- Chỉ được đầu tư khi: không có nợ ngoài VÀ quỹ đủ sàn

## Ghi nhận khai báo
- Số liệu người dùng nói ra được app tự trích bằng tool update_profile trước khi bạn trả lời; kết quả nằm trong ghi chú hệ thống "Vừa điền vào thẻ khai báo". Dựa vào đó xác nhận ngắn và hỏi trường còn thiếu.
- Tiền: ghi đúng loại tiền người dùng nói. Nói USDC / USD / $ → currency "USDC"; nói đồng / triệu / nghìn / k → currency "VND" (15 triệu = 15000000). Không tự quy đổi giữa hai loại tiền, không tự đoán số.
- debtAmount: không có nợ → amount 0.
- Tool chỉ điền vào thẻ khai báo; người dùng tự kiểm tra rồi bấm "Lưu khai báo". Đừng nói "đã lưu" hay "sẽ lưu", hãy nói "mình đã điền vào thẻ khai báo".
- Trong trạng thái app, profile.units cho biết khoản nào đang tính bằng USDC (không có = VND).
Khi đủ 5 trường bắt buộc (thu nhập, chi tiêu, nợ, tuổi, độ ổn định), tóm tắt ngắn: sàn quỹ bao nhiêu tháng và nhắc bấm "Lưu khai báo".

## DCA
Bản đầu chỉ đầu tư cirBTC theo DCA, người dùng tự duyệt và tự ký từng lần mua. Nếu người dùng muốn dừng DCA, gọi tool stop_dca rồi xác nhận ngắn.

## Phong cách
- Tiếng Việt, thân thiện, ngắn gọn
- Chỉ tư vấn tham khảo, KHÔNG cam kết sinh lời
- Không phán xét thói quen chi tiêu
- Dùng **bold** cho số tiền và thuật ngữ quan trọng
- Nếu người dùng hỏi ngoài phạm vi tài chính cá nhân, hãy dùng web_search để tìm thông tin hữu ích

## Tools
- stop_dca: dừng kế hoạch DCA khi người dùng yêu cầu
- web_search: tìm thông tin thị trường, lãi suất, tỷ giá, tin tức tài chính mới nhất để trả lời chính xác hơn`

const MONEY = {
  type: 'object',
  properties: {
    amount: { type: 'number', description: 'Số tiền đúng như người dùng nói (15 triệu = 15000000)' },
    currency: { type: 'string', enum: ['VND', 'USDC'] },
  },
  required: ['amount', 'currency'],
}

const PROFILE_TOOL = {
    type: 'function',
    function: {
      name: 'update_profile',
      description: 'Điền số liệu tài chính người dùng vừa nói vào thẻ khai báo của app. Chỉ truyền các trường vừa biết.',
      parameters: {
        type: 'object',
        properties: {
          monthlyIncome: { ...MONEY, description: 'Thu nhập mỗi tháng' },
          monthlyExpenses: { ...MONEY, description: 'Chi tiêu thiết yếu mỗi tháng' },
          debtAmount: { ...MONEY, description: 'Tổng nợ bên ngoài; không có nợ thì amount 0' },
          otherAssets: { ...MONEY, description: 'Tài sản khác (vàng, BĐS ngoài nhà ở, cổ phiếu…)' },
          age: { type: 'integer' },
          incomeStable: { type: 'boolean', description: 'Lương cố định = true; freelance / kinh doanh = false' },
        },
      },
    },
  }

const EXTRACT_PROMPT = `Bạn trích số liệu tài chính từ tin nhắn MỚI NHẤT của người dùng app MoonSafe và gọi update_profile.
- Chỉ truyền trường người dùng vừa nói rõ trong tin nhắn mới nhất (dùng tin trước đó chỉ để hiểu ngữ cảnh câu trả lời). Không có số liệu mới → gọi update_profile với object rỗng {}.
- Loại tiền: USDC, USD, $, đô, đô la → "USDC" (800 đô = 800 USDC; 3k USD = 3000 USDC). Đồng, VND, triệu, tr, nghìn, ngàn, k (khi không kèm USD/đô) → "VND" (15 triệu = 15000000, 500k = 500000).
- Không tự quy đổi giữa hai loại tiền. Không đoán số người dùng chưa nói.
- debtAmount CHỈ khi người dùng nói rõ về nợ ("không nợ" → {amount: 0, currency: "VND"}). incomeStable CHỈ khi người dùng nói rõ loại công việc hoặc độ ổn định (nhân viên, lương cố định → true; freelance, tự kinh doanh, thất thường → false). Chữ "lương" một mình KHÔNG đủ để suy ra. Không nói tới → không truyền trường đó.
- Mỗi con số gắn với đúng khoản mà người dùng nói ngay cạnh nó: "nợ", "vay", "trả góp", "thẻ tín dụng" → debtAmount; "lương", "thu nhập", "kiếm được" → monthlyIncome; "chi tiêu", "tiền nhà", "ăn uống", "sinh hoạt" → monthlyExpenses; "vàng", "nhà đất", "cổ phiếu", "tài sản" → otherAssets.

Ví dụ:
"nợ thẻ tín dụng 20 triệu" → {"debtAmount":{"amount":20000000,"currency":"VND"}}
"mình là nhân viên văn phòng, nợ thẻ 20 triệu" → {"incomeStable":true,"debtAmount":{"amount":20000000,"currency":"VND"}}
"lương 2.500 USDC, tiêu khoảng 15 triệu" → {"monthlyIncome":{"amount":2500,"currency":"USDC"},"monthlyExpenses":{"amount":15000000,"currency":"VND"}}
"có ít vàng tầm 50 triệu" → {"otherAssets":{"amount":50000000,"currency":"VND"}}`

/** Forced tool call: always returns the fields the user just stated (maybe none). */
async function extractProfile(apiKey: string, messages: Message[]): Promise<{ update: Record<string, unknown> | null; error?: Response }> {
  const recent = messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-4)
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      // Money fields must be exact: gpt-4o scored 12/12 on our test set vs 10/12 for the mini models (2026-10-22).
      model: 'gpt-4o',
      messages: [{ role: 'system', content: EXTRACT_PROMPT }, ...recent],
      tools: [PROFILE_TOOL],
      tool_choice: { type: 'function', function: { name: 'update_profile' } },
      temperature: 0,
      max_tokens: 300,
    }),
  })
  if (!res.ok) return { update: null, error: await openAiError(res) }
  const data = await res.json() as {
    choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  if (data.usage) console.log(`extract tokens in=${data.usage.prompt_tokens} out=${data.usage.completion_tokens}`)
  try {
    const args = JSON.parse(data.choices[0]?.message.tool_calls?.[0]?.function.arguments ?? '{}') as Record<string, unknown>
    return { update: Object.keys(args).length ? args : null }
  } catch {
    return { update: null }
  }
}

/** Map OpenAI failures to a clear message (AGENTS.md Part 3, rule 4: fail loudly). */
async function openAiError(res: Response): Promise<Response> {
  const err = await res.text()
  console.error('OpenAI error:', res.status, err)
  if (res.status === 401) return json({ error: 'khoá OpenAI không hợp lệ' }, 502)
  if (res.status === 429 && /insufficient_quota/.test(err)) return json({ error: 'tài khoản OpenAI hết credit' }, 502)
  if (res.status === 429) return json({ error: 'OpenAI đang giới hạn tốc độ, thử lại sau ít phút' }, 502)
  return json({ error: `OpenAI lỗi ${res.status}` }, 502)
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'stop_dca',
      description: 'Dừng kế hoạch mua cirBTC định kỳ (DCA) khi người dùng yêu cầu.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Tìm kiếm thông tin tài chính, thị trường, lãi suất, tỷ giá VND/USD, tin tức mới nhất. Dùng khi người dùng hỏi về thông tin cần cập nhật.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Câu tìm kiếm bằng tiếng Việt hoặc tiếng Anh',
          },
        },
        required: ['query'],
      },
    },
  },
]

async function webSearch(query: string): Promise<string> {
  // Use DuckDuckGo Instant Answer API (no key needed)
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'MoonSafe/1.0' } })
    if (!res.ok) return `Không tìm được kết quả cho "${query}".`
    const data = await res.json() as {
      AbstractText?: string
      Answer?: string
      RelatedTopics?: Array<{ Text?: string }>
    }
    const result = data.AbstractText || data.Answer || data.RelatedTopics?.[0]?.Text || ''
    return result || `Không tìm thấy thông tin cụ thể cho "${query}". Hãy thử câu hỏi khác.`
  } catch {
    return `Không thể tìm kiếm lúc này. Hãy thử lại sau.`
  }
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const apiKey = context.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'Agent chưa được cấu hình khoá AI' }, 503)

  let body: RequestBody
  try {
    body = await context.request.json() as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : []
  const appState = body.context ?? (body.profile ? { profile: body.profile } : null)

  // Fixed prompt first; the user's current app state goes AFTER the chat history so the
  // model weighs it over old turns (it kept re-asking income it already had).
  const allMessages: Message[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
  if (appState && Object.keys(appState).length > 0) {
    const p = (appState.profile ?? null) as Record<string, unknown> | null
    const known = p ? Object.entries(p).filter(([k, v]) => k !== 'savedAt' && v !== null && v !== undefined).map(([k]) => k) : []
    allMessages.push({
      role: 'system',
      content: `Trạng thái hiện tại của người dùng trong app (dữ liệu thật, mới nhất):\n${JSON.stringify(appState)}\n\n`
        + 'Các số tiền USDC, số còn thiếu (shortfallUsdc), % đạt sàn và số tháng do app tính sẵn theo tỉ giá thật: trích đúng các số đó, KHÔNG tự quy đổi VND↔USDC hay tự tính lại.\n'
        + (appState.profileSaved
          ? 'Người dùng ĐÃ LƯU khai báo. TUYỆT ĐỐI không hỏi lại thu nhập, chi tiêu, nợ, tuổi, độ ổn định thu nhập, và không nhắc bấm "Lưu khai báo". Hướng dẫn bước tiếp theo (nạp quỹ cho đủ sàn, hoặc đầu tư khi đã mở khoá). Người dùng muốn đổi số thì nhắc họ sửa ở tab Cân đối → Sửa khai báo.'
          : known.length
            ? `Đã biết: ${known.join(', ')}. Không hỏi lại các trường này; chỉ hỏi trường còn thiếu.`
            : 'Chưa có khai báo nào.'),
    })
  }

  const extracted = await extractProfile(apiKey, messages)
  if (extracted.error) return extracted.error
  let profileUpdate: Record<string, unknown> | null = extracted.update
  if (profileUpdate) {
    allMessages.push({ role: 'system', content: `Vừa điền vào thẻ khai báo (người dùng sẽ tự kiểm tra và bấm "Lưu khai báo"): ${JSON.stringify(profileUpdate)}` })
  }

  // Agentic loop with tool-calling (max 3 rounds)
  let dcaStop = false
  let rounds = 0
  const MAX_ROUNDS = 3

  while (rounds < MAX_ROUNDS) {
    rounds++

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: allMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 1024,
        temperature: 0.7,
      }),
    })

    if (!res.ok) return openAiError(res)

    const completion = await res.json() as {
      choices: Array<{
        message: {
          role: string
          content: string | null
          tool_calls?: Array<{
            id: string
            function: { name: string; arguments: string }
          }>
        }
        finish_reason: string
      }>
    }

    const choice = completion.choices[0]
    const msg = choice.message

    // No tool calls — return final response
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const u = (completion as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage
      if (u) console.log(`chat tokens in=${u.prompt_tokens} out=${u.completion_tokens} rounds=${rounds}`)
      return json({ content: msg.content ?? '', profileUpdate, dcaStop })
    }

    // Execute tool calls
    allMessages.push({
      role: 'assistant',
      content: msg.content ?? '',
      ...{ tool_calls: msg.tool_calls }, // keep for OpenAI API
    } as Message)

    for (const toolCall of msg.tool_calls) {
      let toolResult = ''
      if (toolCall.function.name === 'update_profile') {
        try {
          profileUpdate = { ...(profileUpdate ?? {}), ...(JSON.parse(toolCall.function.arguments) as Record<string, unknown>) }
          toolResult = 'Đã điền vào thẻ khai báo. Người dùng sẽ tự kiểm tra và bấm "Lưu khai báo".'
        } catch {
          toolResult = 'Dữ liệu không hợp lệ.'
        }
      } else if (toolCall.function.name === 'stop_dca') {
        dcaStop = true
        toolResult = 'Đã dừng DCA trong app.'
      } else if (toolCall.function.name === 'web_search') {
        try {
          const args = JSON.parse(toolCall.function.arguments) as { query: string }
          toolResult = await webSearch(args.query)
        } catch {
          toolResult = 'Lỗi khi tìm kiếm.'
        }
      }
      allMessages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
      })
    }
    // Loop back to get final response after tool results
  }

  return json({ error: 'agent cần quá nhiều bước, hãy hỏi lại ngắn hơn' }, 502)
}
