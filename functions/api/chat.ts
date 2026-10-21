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
  profile: Record<string, unknown> | null
}

const SYSTEM_PROMPT = `Bạn là agent tài chính cá nhân của MoonSafe — app giúp người dùng Web3 xây dựng quỹ dự phòng bằng USDC trước khi đầu tư.

Câu chốt: "Có đường lui thì mới dám liều."

## Nhiệm vụ
Dẫn người dùng khai báo thông tin tài chính qua hội thoại tự nhiên bằng tiếng Việt. Hỏi từng câu, không hỏi nhiều thứ một lúc. Khi đã đủ thông tin, xuất JSON.

## Thông tin cần thu thập
1. Thu nhập hàng tháng (VND)
2. Chi tiêu thiết yếu hàng tháng (ăn, nhà, đi lại, điện nước — VND)
3. Có nợ bên ngoài không? (vay ngân hàng, tín dụng, không tính vay trong app)
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

## Khi đủ thông tin
Xuất JSON trong thẻ <profile> (đơn vị VND, null nếu không biết):
<profile>{"monthlyIncome":X,"monthlyEssentials":X,"hasDebt":true/false,"debtNote":"...","otherAssets":X,"age":X,"incomeStable":true/false}</profile>

Sau khi xuất profile, tóm tắt ngắn: sàn quỹ của họ là bao nhiêu tháng, bao nhiêu VND, và bước tiếp theo.

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
  if (!apiKey) {
    return new Response(JSON.stringify({ content: 'Agent chưa được cấu hình. Vui lòng liên hệ admin.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: RequestBody
  try {
    body = await context.request.json() as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { messages, profile } = body

  // Build system message with current profile context
  let systemContent = SYSTEM_PROMPT
  if (profile && Object.keys(profile).length > 0) {
    systemContent += `\n\n## Dữ liệu đã khai báo của người dùng\n${JSON.stringify(profile, null, 2)}\n\nNếu người dùng đã có đủ thông tin, không hỏi lại. Thay vào đó hãy tư vấn dựa trên dữ liệu này.`
  }

  const systemMessage: Message = { role: 'system', content: systemContent }
  const allMessages: Message[] = [systemMessage, ...messages]

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
      console.error('OpenAI error:', err)
      return new Response(JSON.stringify({ content: 'Mình đang gặp sự cố kết nối. Hãy thử lại sau nhé!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
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
      return new Response(JSON.stringify({ content: msg.content ?? '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
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

  return new Response(JSON.stringify({ content: 'Mình cần thêm thời gian để xử lý. Bạn thử hỏi lại nhé!' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
