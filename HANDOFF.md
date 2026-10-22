# MoonSafe — HANDOFF

App quỹ dự phòng web3 trên Arc Testnet. Live: https://moonsafe.app (Cloudflare Pages project `moonsafe`, deploy tay — push GitHub KHÔNG tự deploy).
Spec gốc: user dán trong chat (SPEC.md, 10 mục, màn 1–10). Cập nhật lần cuối: 2026-10-22.

## ▶ Làm tiếp từ đây (mới nhất ở trên)

1. **Deploy Factory mới bằng ví của user — đang chờ user ký.**
   - User muốn ví `0xEb2D222d28F35fE7BeB5387f8Bc4eBF65f2652F6` (Rabby) vừa là ví deploy, vừa là owner, vừa nhận phí. Chỉ user giữ khoá → user phải tự ký 1 lần.
   - Trang deploy: `scripts/deploy-factory/index.html` (có sẵn bytecode `contracts/VaultFactory.sol` + constructor args: implementation `0xd0d5ca56381079d83d43b5da73940bd958b868d8`, feeRecipient `0xEb2D…52F6`, fee `1e18`). Chạy:
     `cd scripts/deploy-factory && python -m http.server 8787 --bind 127.0.0.1` → user mở http://localhost:8787 trong Chrome có Rabby, chọn ví 0xEb2D, bấm deploy, ký (~0,016 USDC gas). Trang kiểm tra đúng ví + đúng mạng trước khi gửi, rồi in địa chỉ contract.
   - Đã mô phỏng (eth_call / estimateGas từ 0xEb2D): deploy được, runtime code giống hệt từng byte Factory `0x506c…982a` mà Arc Studio deploy.
   - Khi user gửi địa chỉ: đọc onchain `owner()` == `fee()` == 1e18 == `feeRecipient()` == 0xEb2D… == `implementation()`; đổi `VITE_FACTORY_ADDRESS` trong `.env` (file .env không có trong git — nhớ sửa ở cả 2 máy), build, deploy, kiểm tra vault cũ của user vẫn hiện.
   - **Không dùng** Factory `0x506c344e0e5cc367e9ee16607eb1ff9f891c982a` (Arc Studio deploy 2026-10-22: phí + người nhận đúng nhưng owner là ví Arc Studio `0xa303…0Cf6`; chưa có vault nào). Arc Studio đòi tạo Circle API key toàn quyền để chuyển owner → KHÔNG duyệt.
   - Factory cũ `0x358e…576f` (phí 1e12 = 0,000001 USDC, owner Arc Studio) vẫn được app đọc qua `LEGACY_FACTORIES` trong `src/hooks/useVault.ts`: vault cũ vẫn hiện + nạp/rút bình thường. Vault 1.000 USDC của user: `0x5c38985218980664bf2d592c7a896449b6e57c72` (ví 0xEb2D) nằm ở factory cũ.

2. **Chưa test bằng đăng nhập thật** (Claude không đăng nhập Privy được — nhờ user test):
   - Mục "Ví đang dùng" (Menu) + app ưu tiên ví Rabby hơn ví nhúng Privy.
   - Tự chuyển ví sang Arc Testnet trước nạp/rút/mua (lỗi cũ: "chain id 1 does not match 5042002").
   - Agent mở sẵn màn + điền số (thử "nạp 10 USDC vào quỹ").
   - Thẻ khai báo với nút ₫ / USDC.

3. **Chờ user quyết:** não agent đang là OpenAI (gpt-4o + gpt-4o-mini, Arc Studio chọn); luật chung muốn Claude qua SDK Anthropic.

4. Lỗi typecheck có sẵn từ Arc Studio, không liên quan: `scripts/compass-deploy.ts` thiếu module `@circlefin/compass-chains`.

## Luật làm việc với user ở dự án này
- **Hỏi trước** mọi thay đổi code/spec (user sợ phá code). Sửa lỗi user đã yêu cầu thì làm luôn.
- Sửa thẳng trên `main` + deploy production moonsafe.app, KHÔNG tách nhánh/preview (chốt 2026-10-22).
- **Giữ giao diện Arc Studio** (kính mờ, gradient xanh, DM Sans, 5 tab trên). Đã thử áp design system nguyen0xhieu → user chê "loạn", đã trả về. Đổi UI lớn thì gửi ảnh cho user duyệt TRƯỚC khi deploy. Không dùng opacity cho trạng thái khoá.
- Slogan: "Nên đầu tư nhưng phải có đường lui." · Tab title: "MoonSafe" · Logo: Figma `WcPHEwY8xh33OvCFrxgLcQ` node `32:310` → `public/logo.svg`.
- Mọi thao tác của agent phải là TOOL.

## Deploy
```
bunx vite build
npx wrangler pages deploy dist --project-name moonsafe --branch main
```
Cần `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (file secret chung `D:\Files\Claude\.secrets\keys.env`). `OPENAI_API_KEY` là secret của Pages project, không nằm trong repo.
Origin mới phải thêm vào Privy dashboard → Allowed origins (đang có moonsafe.app, www, redesign.moonsafe.pages.dev — cái cuối không dùng nữa).
Máy cần `bun` (`npm i -g bun`) và Foundry (`forge`, `cast`).

## Kiến trúc chính
- `src/state/AppState.tsx`: 1 instance dùng chung cho vault / khai báo / tỉ giá / cirBTC / đơn vị hiển thị + số đã tính (`math`: sàn, % đạt, còn thiếu, mở khoá đầu tư).
- `src/state/WalletPref.tsx`: chọn ví cho wagmi — ví user chọn > ví ngoài (Rabby…) > ví nhúng Privy. Dùng `@privy-io/wagmi` **1.0.6** (khớp `@privy-io/react-auth` 2.x; bản 4.x đòi react-auth 3).
- `src/lib/chain.ts`: hỏi thẳng ví đang ở mạng nào và chuyển sang Arc trước mỗi tx (chainId của wagmi sai khi ví ở mạng lạ).
- Arc: USDC native 18 decimals; app làm việc bằng đơn vị 6 decimals (`src/lib/format.ts`). Phí factory đọc từ contract ngay trước khi ký.
- Khai báo (`types.ts` `FinancialProfile`): mỗi khoản tiền lưu đúng loại user nhập (`units`: VND mặc định / USDC); màn hình quy về đơn vị chọn ở Menu.
- cirBTC testnet `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` (8 decimals, docs Arc). Swap USDC→cirBTC qua Circle App Kit keyless. Giá BTC: `/api/price` (Coinbase, CoinGecko dự phòng — CoinGecko trả 403 từ Workers). Tỉ giá: `/api/rates` (open.er-api), lỗi thì dùng cache, không đoán.
- Không bịa số: thiếu dữ liệu hiện "–".

## Agent chat (`functions/api/chat.ts`)
Luật chi phí & độ tin cậy bắt buộc: `D:\Files\Claude\guide_personal_HF-agents-course\AGENTS.md` — **Part 3**.
- Mọi thao tác của agent là TOOL. Mỗi tin nhắn = 2 lượt gọi:
  1. PLAN (**gpt-4o**, `tool_choice: "required"`): bắt buộc chọn tool — `update_profile`, `prepare_deposit`, `prepare_withdraw`, `prepare_buy_cirbtc`, `propose_dca`, `stop_dca`, `open_screen`, `no_action`. Server chặn mua/DCA khi `investUnlocked` = false.
  2. REPLY (**gpt-4o-mini**, chỉ có `web_search`): chỉ được kể đúng thao tác bước 1 đã làm ("đã mở sẵn", không "đã nạp").
  App nhận `actions` → mở màn, điền sẵn số tiền (VND được app quy đổi). User LUÔN tự ký; agent không ký, không chuyển tiền.
- Đo 2026-10-22: để gpt-4o-mini tự gọi tool → 0/8 thao tác, còn ghi "nạp 200 USDC" thành nợ; PLAN ép tool trên gpt-4o → 10/10 đúng tool + số tiền. Trích khai báo: gpt-4o 12/12, các bản mini 10/12.
- Số liệu trích ra chỉ điền vào thẻ khai báo, user tự bấm "Lưu khai báo".
- Trạng thái app gửi trong `context`, đặt SAU lịch sử chat; câu chào cố định chỉ hiển thị, không gửi cho model (từng làm agent hỏi lại thu nhập).
- Hết credit / sai key → trả lỗi rõ (502 + lý do), app hiện trong chat.
- Chi phí ước tính mỗi tin nhắn: PLAN ~1.500 token vào gpt-4o (≈ $0,004) + REPLY gpt-4o-mini (≈ $0,0005). Log: `plan tokens`, `reply tokens` trong Cloudflare function logs.

## Rà bảo mật contract (Arc Studio, 2026-10-22) — không có lỗi high/critical
- Medium: gửi dư phí → `createVault` revert (`RefundFailed`), vì factory chuyển hết `msg.value` cho người nhận rồi mới hoàn. App luôn gửi đúng `fee()` nên hiện không ảnh hưởng; nếu owner hạ phí lúc user đang ký thì tx đó revert.
- Low: `setFee` không giới hạn trên; `Ownable` 1 bước (gõ nhầm `transferOwnership` là mất quyền).
- Info: implementation `0xd0d5…` chưa initialize (vô hại, không delegatecall/selfdestruct); mỗi ví 1 vault, không migrate.
