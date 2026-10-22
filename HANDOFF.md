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
- Agent KHÔNG tự lưu khai báo: số liệu nằm trong `<profile>…</profile>` → điền vào thẻ khai báo, user bấm "Lưu khai báo".
- Token mỗi câu được log ra Cloudflare function logs (`chat tokens in=… out=…`).
- Chi phí đo thật mỗi câu hỏi: **chưa đo** (cần chạy vài câu thật rồi ghi vào đây).

## Việc đang mở
- Factory hiện tại (`0x358e…576f`) có phí 1e12 wei = 0,000001 USDC (Arc Studio đặt nhầm theo 6 decimals) và phí về ví `0x5B12…Ef42` của Arc Studio. User đã chọn deploy Factory mới với phí 1 USDC (1e18 wei) và người nhận phí là ví của user — chờ user cung cấp ví nhận phí + cách ký deploy.
