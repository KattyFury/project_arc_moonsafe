# MoonSafe — HANDOFF

App quỹ dự phòng web3 trên Arc Testnet. Live: https://moonsafe.app (Cloudflare Pages project `moonsafe`, deploy tay — push GitHub KHÔNG tự deploy).

## Deploy
User muốn sửa thẳng trên `main` + deploy production moonsafe.app, KHÔNG tách nhánh/preview riêng (chốt 2026-10-22).
```
bunx vite build
npx wrangler pages deploy dist --project-name moonsafe --branch main      # production
npx wrangler pages deploy dist --project-name moonsafe --branch <nhánh>   # preview: <nhánh>.moonsafe.pages.dev
```
Cần `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (file secret chung). `OPENAI_API_KEY` là secret của Pages project, không nằm trong repo.
Origin mới (tên miền, preview) phải thêm vào Privy dashboard → Allowed origins, nếu không sẽ không đăng nhập được.

## Agent chat (functions/api/chat.ts)
Luật chi phí & độ tin cậy bắt buộc: `D:\Files\Claude\guide_personal_HF-agents-course\AGENTS.md` — **Part 3**.
- Hiện dùng OpenAI `gpt-4o-mini` (Arc Studio chọn). Luật chung muốn Claude qua SDK Anthropic — chưa đổi, chờ user quyết.
- Hết credit / sai key → function trả lỗi rõ (502 + lý do), app hiện lỗi trong chat, không im lặng.
- Mọi thao tác của agent là TOOL. Mỗi tin nhắn = 2 lượt gọi:
  1. PLAN (**gpt-4o**, `tool_choice: "required"`): bắt buộc chọn tool — `update_profile`, `prepare_deposit`, `prepare_withdraw`, `prepare_buy_cirbtc`, `propose_dca`, `stop_dca`, `open_screen`, `no_action`. Server chặn mua/DCA khi `investUnlocked` = false.
  2. REPLY (**gpt-4o-mini**, chỉ có `web_search`): chỉ được kể đúng thao tác bước 1 đã làm.
  App nhận `actions` → mở màn, điền sẵn số tiền (VND được app quy đổi). User LUÔN tự ký trong ví; agent không ký, không chuyển tiền.
  Đo 2026-10-22: để gpt-4o-mini tự gọi tool → 0/8 thao tác, còn ghi "nạp 200 USDC" thành nợ; PLAN ép tool trên gpt-4o → 10/10 đúng tool + số tiền.
- Số liệu trích ra chỉ điền vào thẻ khai báo, user tự bấm "Lưu khai báo". Tiền lưu theo đúng loại user nói (VND hoặc USDC, `profile.units`), app quy đổi khi hiển thị.
- Trạng thái app (khai báo, số tiền đã tính sẵn) gửi trong `context`, đặt SAU lịch sử chat; agent trích nguyên văn số app tính, không tự quy đổi.
- Token mỗi câu được log ra Cloudflare function logs (`chat tokens in=… out=…`).
- Chi phí ước tính mỗi tin nhắn: PLAN ~1.500 token vào gpt-4o (≈ $0,004) + REPLY gpt-4o-mini (≈ $0,0005). Token từng lượt có trong function logs (`plan tokens`, `reply tokens`).

## Việc đang mở
- Factory hiện tại (`0x358e…576f`) có phí 1e12 wei = 0,000001 USDC (Arc Studio đặt nhầm theo 6 decimals) và phí về ví `0x5B12…Ef42` của Arc Studio. User đã chọn deploy Factory mới với phí 1 USDC (1e18 wei) và người nhận phí là ví của user — chờ user cung cấp ví nhận phí + cách ký deploy.
