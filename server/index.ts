// Local dev server — handles /api/chat and /api/rates
// Mirrors Cloudflare Functions logic so dev == prod
import express from 'express'

const app = express()
app.use(express.json())

// ─── Types ──────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
}

// ─── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là chuyên gia tài chính cá nhân của MoonSafe — app giúp người dùng Web3 xây dựng quỹ dự phòng bằng USDC trước khi đầu tư.

Câu chốt: "Nên đầu tư nhưng phải có đường lui."

## Tính cách
- Chuyên gia thực sự: phân tích số liệu, đưa ra nhận xét cụ thể, không trả lời chung chung
- Thân thiện, nói tiếng Việt tự nhiên, thỉnh thoảng dùng emoji nhẹ
- Không bao giờ lặp lại cùng một câu trả lời
- Luôn dựa trên dữ liệu người dùng đã chia sẻ để đưa ra nhận xét cá nhân hoá

## Hành vi khi người dùng muốn cập nhật
- Khi người dùng nói "sửa", "cập nhật", "đổi", "thực ra là", "mình nhầm" — GHI NHẬN ngay, XUẤT profile mới, và xác nhận đã cập nhật
- KHÔNG hỏi lại những gì đã biết
- KHÔNG cảm ơn chung chung kiểu "Cảm ơn bạn đã chia sẻ"

## Thông tin cần thu thập (hỏi từng câu một)
1. Thu nhập hàng tháng (VND hoặc USD)
2. Chi tiêu thiết yếu/tháng (ăn, nhà, đi lại, điện nước)
3. Có nợ bên ngoài không? (vay ngân hàng, tín dụng — không tính vay trong app)
4. Tuổi
5. Thu nhập ổn định không? (lương = ổn định; freelance/kinh doanh = không)
6. Tài sản khác? (vàng, BĐS ngoài nhà ở, cổ phiếu — không bắt buộc)

## Luật tài chính (áp dụng khi phân tích)
- Thứ tự bắt buộc: hết nợ → quỹ dự phòng → đầu tư
- Sàn quỹ tối thiểu: 3 tháng chi tiêu (thu nhập ổn định), 6 tháng (không ổn định)
- Mốc an toàn: 12 tháng khi tài sản ngoài nhà ≥ 4× chi tiêu 12 tháng
- Tỷ lệ đầu tư tối đa: Normal = 110 − tuổi (%), Risky = 120 − tuổi (%)
- Chỉ USDC là "an toàn" trong context app này
- Chỉ được đầu tư khi: không nợ ngoài VÀ quỹ ≥ sàn

## Khi đủ thông tin hoặc người dùng cập nhật
Luôn xuất JSON profile trong thẻ <profile> (đơn vị VND, null nếu chưa biết):
<profile>{"monthlyIncome":X,"monthlyExpenses":X,"hasExternalDebt":true/false,"debtNote":"...","otherAssets":X,"age":X,"incomeStable":true/false}</profile>

Sau đó đưa ra phân tích cụ thể: sàn quỹ là bao nhiêu tháng, cần bao nhiêu VND/USDC, và bước tiếp theo cụ thể.

## Khi tư vấn về tài chính chung
- Dùng web_search để tra lãi suất, tỷ giá, giá vàng mới nhất khi cần
- Phân tích dựa trên số liệu thực tế của người dùng, không nói chung chung
- Chỉ tư vấn tham khảo, KHÔNG cam kết sinh lời, KHÔNG khuyến nghị sản phẩm cụ thể

## KHÔNG làm
- Lặp lại cùng một câu template
- Hỏi lại thông tin đã có
- Trả lời chung chung khi đã có data cụ thể
- Nói "Cảm ơn bạn đã chia sẻ đầy đủ thông tin" hay bất kỳ câu cảm ơn rập khuôn nào`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Tìm kiếm thông tin tài chính, lãi suất, tỷ giá VND/USD, giá vàng, thị trường mới nhất.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Câu tìm kiếm' },
        },
        required: ['query'],
      },
    },
  },
]

async function webSearch(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'MoonSafe/1.0' } })
    if (!res.ok) return `Không tìm được kết quả cho "${query}".`
    const data = await res.json() as {
      AbstractText?: string
      Answer?: string
      RelatedTopics?: Array<{ Text?: string }>
    }
    return data.AbstractText || data.Answer || data.RelatedTopics?.[0]?.Text || `Không tìm thấy thông tin cho "${query}".`
  } catch {
    return `Không thể tìm kiếm lúc này.`
  }
}

// ─── /api/chat ────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.json({ content: 'OPENAI_API_KEY chưa được cấu hình trong .env' })
    return
  }

  const { messages, profile } = req.body as {
    messages: ChatMessage[]
    profile: Record<string, unknown> | null
  }

  let systemContent = SYSTEM_PROMPT
  if (profile && Object.keys(profile).length > 0) {
    systemContent += `\n\n## Dữ liệu hiện tại của người dùng\n\`\`\`json\n${JSON.stringify(profile, null, 2)}\n\`\`\`\nDùng dữ liệu này để phân tích cụ thể, không hỏi lại những gì đã có.`
  }

  const allMessages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    ...messages,
  ]

  let rounds = 0
  while (rounds < 3) {
    rounds++
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
        max_tokens: 1200,
        temperature: 0.75,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI error:', err)
      res.json({ content: 'Mình đang gặp sự cố. Thử lại sau nhé!' })
      return
    }

    const completion = await response.json() as {
      choices: Array<{
        message: ChatMessage & { tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }
        finish_reason: string
      }>
    }

    const msg = completion.choices[0].message

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      res.json({ content: msg.content ?? '' })
      return
    }

    // Execute tools
    allMessages.push(msg)
    for (const call of msg.tool_calls) {
      let result = ''
      if (call.function.name === 'web_search') {
        try {
          const args = JSON.parse(call.function.arguments) as { query: string }
          result = await webSearch(args.query)
        } catch { result = 'Lỗi khi tìm kiếm.' }
      }
      allMessages.push({ role: 'tool', content: result, tool_call_id: call.id })
    }
  }

  res.json({ content: 'Mình cần thêm thời gian xử lý. Bạn thử hỏi lại nhé!' })
})

// ─── /api/rates ───────────────────────────────────────────────────────────────
let ratesCache: { rate: number; ts: number } | null = null

app.get('/api/rates', async (_req, res) => {
  if (ratesCache && Date.now() - ratesCache.ts < 24 * 60 * 60 * 1000) {
    res.json({ VND: ratesCache.rate })
    return
  }
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD')
    const data = await r.json() as { rates: Record<string, number> }
    const rate = data.rates['VND'] ?? 25000
    ratesCache = { rate, ts: Date.now() }
    res.json({ VND: rate })
  } catch {
    res.json({ VND: ratesCache?.rate ?? 25000 })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`MoonSafe API server running on http://localhost:${PORT}`)
})
