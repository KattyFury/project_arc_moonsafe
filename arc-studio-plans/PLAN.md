# Implementation Plan: SafeVault — App quỹ dự phòng Web3

## Summary
SafeVault là app quản lý tài chính cá nhân chạy trên Arc Testnet, ép người dùng lập quỹ dự phòng USDC trong smart contract riêng (vault) trước khi được đầu tư cirBTC. Agent AI dẫn đường toàn bộ luồng qua giao diện chat. Câu chốt: "Có đường lui thì mới dám liều."

## Architecture

- **Blockchain**: Arc Testnet (chain ID 5042002) — USDC là gas token, phí ổn định, không cần ETH
- **Contracts**:
  - `VaultFactory.sol` — deploy một `VaultProxy` minimal-clone cho mỗi người dùng, thu phí 1 USDC qua `createVault(permit)`
  - `VaultProxy.sol` — lưu giữ USDC quỹ dự phòng, chỉ ví chủ rút được; bất biến sau deploy
- **Frontend**: React + Vite + Tailwind, responsive 3 breakpoint (dọc/vuông/ngang) theo lưới SPEC; khung chat làm trung tâm
- **Wallet**: Privy (Email OTP + Google + ví web3), thay thế ConnectKit trong `config.ts`
- **AI Agent**: Gemini Flash 2.0 qua Google AI SDK, gọi từ Cloudflare Function (giữ API key server-side), fallback mock khi offline
- **Swap (cirBTC)**: `@circle-fin/swap-kit` + viem adapter — keyless permissionless swap USDC → cirBTC trên Arc Testnet
- **State**: localStorage (try/catch) cho khai báo tài chính và lịch sử chat; wagmi cho onchain state
- **Tỷ giá**: Cloudflare Function proxy `open.er-api.com`, cache 24 giờ trong KV

## Files to Create / Modify

### Contracts
1. `contracts/VaultProxy.sol` — vault cá nhân: deposit, withdraw (chỉ owner), getBalance; nhận USDC permit
2. `contracts/VaultFactory.sol` — clone factory: `createVault(permitDeadline, v, r, s)` thu 1 USDC phí, emit `VaultCreated(owner, vault)`

### Config / Wiring
3. `src/config.ts` — thay wagmi+ConnectKit bằng Privy config (arcTestnet, mainnet ENS)
4. `src/privyConfig.ts` — Privy app config: loginMethods (email, google, wallet), supported chains
5. `.env` — thêm `VITE_PRIVY_APP_ID`, `VITE_FACTORY_ADDRESS`; server-side `GOOGLE_AI_API_KEY`, `EXCHANGE_RATE_API_KEY`

### Core hooks / utils
6. `src/hooks/useVault.ts` — hook: factory address, createVault, deposit, withdraw, getBalance, vault address cho wallet hiện tại
7. `src/hooks/useFinancialProfile.ts` — đọc/ghi khai báo tài chính từ localStorage (thu nhập, chi tiêu, nợ, tài sản, tuổi); tính sàn quỹ, unlock đầu tư
8. `src/hooks/useExchangeRate.ts` — fetch tỷ giá VND/USD từ CF Function, cache 24h, fallback cache
9. `src/hooks/useCircBTC.ts` — swap USDC → cirBTC qua @circle-fin/swap-kit; DCA schedule trong localStorage

### Components
10. `src/components/layout/AppShell.tsx` — khung 3 breakpoint (dọc/vuông/ngang), hàng 1 nav bar, lưới 12×10
11. `src/components/layout/NavBar.tsx` — 4 tab: Quỹ / Đầu tư / Cân đối / Menu; lock state với icon 🔒 và popup
12. `src/components/screens/LoginScreen.tsx` — màn 1: logo, tên app, câu chốt, nút Đăng nhập Privy
13. `src/components/screens/WarningModal.tsx` — màn 3: popup cảnh báo mỗi lần đăng nhập
14. `src/components/screens/VaultSetup/` — màn 4, 4b, 5, 5b: chưa có vault / thiếu USDC / xác nhận / chờ ký (spinner, retry ≤5)
15. `src/components/screens/ChatScreen.tsx` — màn 6: khung chat khai báo, thẻ nhập liệu, lưu localStorage
16. `src/components/screens/FundScreen.tsx` — màn 7, 7b: Quỹ dự phòng, tab Nạp/Rút, thanh tiến độ, cảnh báo rút dưới sàn
17. `src/components/screens/BalanceSheet.tsx` — màn 8, 8b: 5 dòng cân đối, hiển thị "–" khi thiếu dữ liệu
18. `src/components/screens/InvestScreen.tsx` — màn 9, 9b: checklist mở khoá, trần % theo tuổi, ô mua cirBTC, DCA
19. `src/components/screens/SettingsScreen.tsx` — màn 10 (trong Menu): địa chỉ ví, số dư, đơn vị VND/USD, xoá khai báo, đăng xuất
20. `src/components/ui/ProgressBar.tsx` — thanh tiến độ tái dùng (quỹ, DCA, trần đầu tư)
21. `src/components/ui/AmountInput.tsx` — ô nhập số tiền + chip 25%/50%/Tối đa
22. `src/components/ui/LockPopup.tsx` — popup khi bấm nút bị khoá, giải thích điều kiện mở

### AI Agent
23. `functions/api/chat.ts` — Cloudflare Function: nhận history, gọi Gemini Flash, trả stream; giữ GOOGLE_AI_API_KEY server-side
24. `functions/api/rates.ts` — Cloudflare Function: proxy tỷ giá VND/USD, cache 24h trong CF KV
25. `src/hooks/useAgent.ts` — gọi `/api/chat`, stream response, parse tool-calls của agent (khai báo, gợi ý nạp, DCA)

### App entry
26. `src/App.tsx` — router: LoginScreen → WarningModal → VaultSetup/Chat → AppShell (tabs)
27. `src/main.tsx` — wrap PrivyProvider thay ConnectKitProvider

## Build Sequence

1. **Smart contracts** — viết `VaultProxy.sol` + `VaultFactory.sol`, chạy balanced security review, deploy lên Arc Testnet
2. **Privy + wagmi wiring** — cập nhật `config.ts`, `privyConfig.ts`, `main.tsx`; xác nhận kết nối Arc Testnet
3. **Core hooks** — `useVault.ts` (onchain), `useFinancialProfile.ts` (localStorage), `useExchangeRate.ts` (tỷ giá)
4. **AppShell + NavBar** — khung 3 breakpoint, lưới 12×10, responsive theo tỷ lệ cửa sổ
5. **Luồng Login → Vault setup** — màn 1 → 3 → 4/4b → 5/5b (spinner, retry logic)
6. **Chat + khai báo** — màn 6, `useAgent.ts`, gọi Cloudflare Function Gemini, parse khai báo vào localStorage
7. **Màn Quỹ (7/7b)** — nạp/rút vault, thanh tiến độ, cảnh báo dưới sàn
8. **Màn Cân đối (8/8b)** — 5 dòng số liệu, tỷ giá VND/USD, "–" khi thiếu
9. **Màn Đầu tư (9/9b)** — checklist unlock, `useCircBTC.ts`, swap USDC→cirBTC qua Swap Kit, DCA schedule
10. **Settings (màn 10)** — địa chỉ, số dư, đổi đơn vị, xoá dữ liệu, đăng xuất
11. **Polish** — xử lý toàn bộ bad states (SPEC mục 7), kiểm tra responsive 3 breakpoint, điện thoại xoay ngang

## Environment Variables cần cung cấp

| Biến | Nơi | Mô tả |
|---|---|---|
| `VITE_PRIVY_APP_ID` | `.env` | Privy App ID từ dashboard.privy.io |
| `GOOGLE_AI_API_KEY` | CF dashboard | Google AI Studio API key (Gemini Flash) |
| `EXCHANGE_RATE_API_KEY` | CF dashboard (optional) | open.er-api.com key |
| `VITE_FACTORY_ADDRESS` | `.env` | Địa chỉ VaultFactory sau khi deploy |

## Done When

- [ ] `VaultFactory` + `VaultProxy` deploy thành công trên Arc Testnet, địa chỉ trong `.env`
- [ ] Đăng nhập bằng email OTP / Google / MetaMask qua Privy
- [ ] Popup cảnh báo (màn 3) hiện mỗi lần đăng nhập
- [ ] Luồng 4 → 4b (thiếu USDC) → 5 → 5b → vault mở thành công, phí 1 USDC trừ đúng
- [ ] Chat agent (màn 6) gọi Gemini Flash, lưu khai báo vào localStorage
- [ ] Nạp/rút USDC vào vault (màn 7); rút dưới sàn hiện cảnh báo 7b, vẫn cho rút
- [ ] Bảng cân đối (màn 8) hiện đúng số hoặc "–" khi thiếu dữ liệu
- [ ] Màn đầu tư (9) khoá khi thiếu điều kiện; 9b mở khi quỹ đủ + không nợ
- [ ] Swap USDC → cirBTC chạy được trên Arc Testnet (dù test amount nhỏ)
- [ ] Responsive 3 breakpoint hoạt động đúng; điện thoại ngang hiện "Xoay dọc"
- [ ] Không có API key / secret nào nằm trong code hay bundle phía client

## Notes

- Preview hostname (Privy Allowed Origins): `irol80jxblfxew72yvd5m.preview.studio.arc.io`
- USDC trên Arc Testnet: `0x3600000000000000000000000000000000000000` (6 decimals ERC-20 view)
- Gas là USDC, không cần ETH — phí ~0.01 USDC mỗi tx
- Mọi số liệu trong wireframe (3.200, 6.000, tuổi 31…) là ví dụ, không hardcode
- Spec mục 10 (Vay/Earn/mốc 12 tháng) không làm bản đầu
