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
1. Thu nhập hàng tháng (VND)
2. Chi tiêu thiết yếu hàng tháng (ăn, nhà, đi lại, điện nước — VND)
3. Nợ bên ngoài: có không, tổng bao nhiêu VND (vay ngân hàng, thẻ tín dụng, trả góp, vay người quen)
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
Mỗi khi người dùng cho thêm số liệu, cuối câu trả lời xuất JSON trong thẻ <profile> với các trường đã biết (đơn vị VND, null nếu chưa biết):
<profile>{"monthlyIncome":X,"monthlyExpenses":X,"debtAmount":X,"otherAssets":X,"age":X,"incomeStable":true/false}</profile>
- debtAmount = tổng nợ bên ngoài (VND). Không có nợ → 0. Chưa hỏi → null.
- Không tự đoán số. Người dùng nói khoảng/ước chừng thì ghi đúng con số họ nói.
- App hiện số liệu này lên thẻ khai báo để người dùng kiểm tra rồi tự bấm "Lưu khai báo". Đừng nói là đã lưu.
Khi đủ 5 trường bắt buộc (thu nhập, chi tiêu, nợ, tuổi, độ ổn định), tóm tắt ngắn: sàn quỹ bao nhiêu tháng, bao nhiêu tiền, và nhắc bấm "Lưu khai báo".

## DCA
Bản đầu chỉ đầu tư cirBTC theo DCA, người dùng tự duyệt và tự ký từng lần mua. Nếu người dùng muốn dừng DCA, xác nhận ngắn và thêm thẻ <dca action="stop"/> vào cuối câu trả lời.

## Phong cách
- Tiếng Việt, thân thiện, ngắn gọn
- Chỉ tư vấn tham khảo, KHÔNG cam kết sinh lời
- Không phán xét thói quen chi tiêu
- Dùng **bold** cho số tiền và thuật ngữ quan trọng
- Nếu người dùng hỏi ngoài phạm vi tài chính cá nhân, hãy dùng web_search để tìm thông tin hữu ích

## Tools
- web_search: tìm thông tin thị trường, lãi suất, tỷ giá, tin tức tài chính mới nhất để trả lời chính xác hơn`

const TOOLS = [
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

  // Agentic loop with tool-calling (max 3 rounds)
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

    if (!res.ok) {
      const err = await res.text()
      console.error('OpenAI error:', res.status, err)
      // Fail loudly on billing / key problems so the owner can top up (AGENTS.md Part 3, rule 4).
      if (res.status === 401) return json({ error: 'khoá OpenAI không hợp lệ' }, 502)
      if (res.status === 429 && /insufficient_quota/.test(err)) return json({ error: 'tài khoản OpenAI hết credit' }, 502)
      if (res.status === 429) return json({ error: 'OpenAI đang giới hạn tốc độ, thử lại sau ít phút' }, 502)
      return json({ error: `OpenAI lỗi ${res.status}` }, 502)
    }

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
      return json({ content: msg.content ?? '' })
    }

    // Execute tool calls
    allMessages.push({
      role: 'assistant',
      content: msg.content ?? '',
      ...{ tool_calls: msg.tool_calls }, // keep for OpenAI API
    } as Message)

    for (const toolCall of msg.tool_calls) {
      let toolResult = ''
      if (toolCall.function.name === 'web_search') {
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
