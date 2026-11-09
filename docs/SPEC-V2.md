# ▶ SPEC V2 — MoonSafe (viết 2026-11-07, theo CORE V2) — ĐỌC TRƯỚC KHI BUILD V2

> Spec nằm trong HANDOFF (Hiếu 2026-11-07: không tách file). `docs/CORE.md` nói **làm gì**; mục này nói **làm thế nào**. Mâu thuẫn → CORE đúng. Spec cũ (`vault-recovery-spec.md`, `plan-backup-and-circle.md`) đã chuyển vào `docs/archive/` vì viết cho thiết kế guardian + email đã bỏ.

## S0. Hiện trạng code V1 so với V2 (sửa, không viết lại từ đầu)

| Chỗ | V1 đang có | V2 phải thành |
|---|---|---|
| `src/lib/allocation.ts` | 6 nhóm `safe / traditional / btc / large_cap / altcoin / idle` | 3 phần Safety / Traditional / **Crypto (1 thanh)**; bỏ `idle` khỏi bảng (CORE 3: không theo dõi tiền nhàn rỗi) |
| `functions/_lib/plan.ts:52-53` | "cứ 10 đô thì ~7 đô vào BTC" | xoá (CORE 1) |
| `src/kb/moonsafe-kb.json:181` | "BTC is a long-term reserve asset… Buy steadily" | xoá câu cổ vũ; giữ "Emergency fund first. No leverage" |
| `functions/_lib/plan.ts:140` | nêu ví dụ "VOO" | agent không tự nêu tên tài sản cụ thể |
| `src/types.ts` `Currency = 'VND' / 'USDC'` | 2 tiền | tiền theo ngôn ngữ người dùng (S4.4) |
| `src/lib/features.ts` `CURRENCY_CHOICES = false` | khoá USD | bật lại, mặc định theo ngôn ngữ |
| `VaultProxy` + `src/hooks/useVault.ts` | vault V1 | `VaultV2` + `VaultFactoryV2` (đã viết, 0 lỗi nặng) |
| `/api/userdata` | GET/PUT, lưu thô trong KV | + DELETE, mã hoá (S5) |
| `src/privyConfig.ts` | `['email','google','wallet']`, ví nhúng tạo khi chưa có ví | giữ; **bật xuất khoá** cho ví nhúng |
| `package.json` | `@circle-fin/developer-controlled-wallets` không dùng | gỡ |

## S1. Màn hình và luồng

Giao diện **chỉ tiếng Anh**. Mọi chữ hiện cho người dùng phải bàn với Hiếu trước khi chốt (CLAUDE.md repo); chữ dưới đây là bản nháp.

1. **Đăng nhập**: ví web3 / email / Google (Privy). Nút **"!"** nhỏ → menu *Need help?*: Contact support (email + Telegram, làm sau, tạm ẩn) · Lost your wallet? · Lost your vault password? · Terms & Privacy.
   - *Lost your wallet?* → "Sign in with another wallet → Vault → Import vault → use your passkey or vault password."
   - *Lost your vault password?* → "MoonSafe can't recover it. Without your passkey or vault password, the vault can't be withdrawn from, even with your wallet."
2. **Đồng ý dữ liệu** (lần đầu, trước chat): 2 ô không tích sẵn (lưu hồ sơ; gửi tin nhắn tới nhà cung cấp AI), xác nhận 18+, link Terms/Privacy. Lưu thời điểm đồng ý trong hồ sơ.
3. **Chat (agent)**: 3 nút tắt `Update split` · `Edit cash flow` · `Edit information`; thẻ Confirm cho mọi thay đổi (giữ V1). Nhãn "AI".
4. **Bảng cân đối**: 3 thanh Safety / Traditional / Crypto theo luật mốc (CORE 4). Chưa chọn tỷ lệ Traditional–Crypto → 2 thanh đó chưa hiện, agent hỏi 1 câu. Chọn Crypto > 50% phần còn lại → không cho, hiện lý do.
5. **Vault**: chưa có vault → 2 nút **Open vault** / **Import vault**. Có vault → số dư (`getBalance`), mức quỹ cần, Deposit, Withdraw.
6. **Invest**: danh sách tài sản onchain; nút mua cirBTC khoá tới khi quỹ đầy + hết nợ lãi cao; thẻ mua để trống; nhãn "verified onchain" / "self-declared".
7. **Menu**: tiền tệ, xuất khoá (ví Privy), xoá dữ liệu (xoá hẳn).

## S2. Vault: khoá mật khẩu (phía app)

**Một cách sinh khoá cho cả 2 lựa chọn**, đóng băng từ lần deploy đầu (đổi về sau = vault cũ không mở được):

```
password    = 24 ký tự từ bảng ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (120 bit), hiện ABCD-EFGH-…-WXYZ
passwordKey = keccak256(utf8("MoonSafe vault password v1") || utf8(password bỏ gạch)) mod n   (n = bậc secp256k1)
```
Không KDF chậm (Hiếu chốt 1a). Phải có test vector cố định trong repo.

**A. Passkey** (laptop, iPhone, Samsung/Android):
- Mở vault: tạo passkey có extension `prf`; đánh giá PRF với salt cố định `keccak256("MoonSafe vault passkey v1")`. 32 byte PRF → 120 bit đầu → 24 ký tự của bảng trên = **password** → `passwordKey` như trên.
- Vì password rút ra từ passkey, nút **"Show backup password"** chỉ hiện lại chuỗi đó để chép ra giấy (tuỳ chọn). Giấy đó dùng được trên PC không có passkey.
- Lưu `credentialId` trong hồ sơ để gợi ý đúng passkey; không lưu PRF, không lưu password.
- **RP ID = `moonsafe.app` ngay từ đầu**, V2 chạy trên subdomain (vd `v2.moonsafe.app`). Passkey khoá theo RP ID: tạo trên domain khác thì khi gộp V2 vào moonsafe.app sẽ không dùng được.
- **Chưa kiểm:** trình duyệt nào trả PRF. Thử thật trước khi code màn Vault: Safari iOS, Safari macOS, Chrome Android (Samsung), Chrome Windows (Windows Hello), Chrome dùng điện thoại quét QR, Firefox. Không có PRF → chỉ hiện lựa chọn B.

**B. Mật khẩu truyền thống** (PC): `crypto.getRandomValues` → 24 ký tự → hiện đúng một lần, bắt gõ lại vài ký tự để chắc đã chép.

**9 việc phía app từ kiểm toán** (`docs/audit-vault-v2-arc-studio-2026-11-07.md`): sinh ngẫu nhiên bằng `crypto.getRandomValues`; đóng băng cách sinh khoá + test vector; không ký gì khác bằng khoá mật khẩu; không lưu/gửi password; mở vault xong đọc lại `vault.passwordKey()` so khớp; lấy `nonce` mới ngay trước khi ký, `deadline` 10 phút (hợp đồng cho tối đa 1 ngày); kiểm `factory.hasVault(ví mới)` trước Import; chỉ tin vault khi `factory.isVault(vault)` với factory ghim cứng.

## S3. Hợp đồng và cách app gọi

Đã viết + 396 test pass + Arc Studio kiểm toán: `contracts/VaultV2.sol`, `contracts/VaultFactoryV2.sol`. Chưa deploy; **Hiếu deploy bằng ví của mình qua Arc Studio**.

| Việc | Gọi | Ghi chú |
|---|---|---|
| Mở vault | `factory.createVault(passwordKey)`, value = fee (1 USDC = 1e18 native) | thừa thì hoàn; mỗi ví 1 vault |
| Nạp (chủ) | `vault.deposit()` + value | native 18 số lẻ |
| Nạp (ví khác) | `vault.depositFor()` + value | gửi thẳng tới địa chỉ vault bị từ chối (Hiếu chốt 2a) |
| Rút | ký EIP-712 `Withdraw(amount,to,nonce,deadline)` bằng khoá mật khẩu → chủ gửi `vault.withdraw(amount,to,deadline,sig)` | domain `("MoonSafeVault","2",5042,vault)` |
| Import | ký `Import(newOwner = ví mới,nonce,deadline)` → ví mới gửi `vault.importVault(deadline,sig)` | ví mới đã có vault → bị từ chối |
| Số dư | `vault.getBalance()` | không cộng dồn từ event (USDC kiểu ERC-20 có thể vào mà không có event) |

Lỗi → câu báo: `InvalidPasswordSignature` sai passkey/mật khẩu · `SignatureExpired` / `DeadlineTooFar` thử lại · `InsufficientBalance` · `NativeTransferFailed` địa chỉ nhận bị Circle chặn · `VaultAlreadyExists` ví này đã có vault.

**Import tìm vault từ mật khẩu** (người dùng không nhập địa chỉ vault): app tính `passwordKey` rồi tìm vault có key đó. Event `VaultCreated(owner indexed, vault indexed, passwordKey indexed)`: **đã index `passwordKey`** (Hiếu duyệt 2026-11-07), app lọc log thẳng theo topic 3. Test `test_Factory_VaultCreatedIndexesPasswordKey`; toàn repo 396 pass.

Rủi ro đã chấp nhận (CORE 7): ai có password là lấy được vault; mất cả passkey lẫn giấy = mất quyền rút; không có đổi mật khẩu.

## S4. Agent

1. **Lời nói** theo CORE 1: "quy tắc phổ biến là X, với số của bạn là Y"; cấm "bạn nên mua/bán", cấm số tiền gắn coin, không tự nêu tên tài sản, không bình luận giá lên/xuống. Có số tiền gắn crypto → kèm "not investment advice, you decide". Dưới 18 → chỉ giáo dục chung.
2. **Thứ tự:** quỹ 1 tháng → trả nợ lãi ≥10%/năm → đầy quỹ → đầu tư. Quỹ chưa đầy: không bàn đầu tư. Nợ nặng: giúp tìm đường thoát nợ. Nợ lãi thấp (nhà, làm ăn): OK nhưng nói rõ vay bao nhiêu vừa sức trả.
3. **Mức quỹ** = (chi + trả nợ hằng tháng) × 3 / 6 / 9 / 12. Đọc số dư vault onchain; lời khai không tính.
4. **Tiền tệ:** mặc định theo ngôn ngữ (vi → VND, còn lại USD cho tới khi thêm tiền khác), đổi được trong Menu; tỷ giá từ `/api/rates`. Vault là USDC, quy đổi khi hiển thị.
5. **Tỷ lệ:** Safety = tuổi %, không sửa; tuổi lưu kèm ngày khai, tự cộng 1 mỗi năm. Traditional/Crypto người dùng chọn, Crypto ≤ 50% phần còn lại.
6. Sửa ở: `functions/_lib/education.ts`, `coaching.ts`, `plan.ts`, `agentGuards.ts`, `src/kb/moonsafe-kb.json`. Sửa xong chạy `bun run test:agent` + eval.

## S5. Dữ liệu

- **Mã hoá khi lưu:** hồ sơ + chat trong KV mã hoá AES-GCM, khoá ở secret Cloudflare `USERDATA_KEY` (không commit).
- **Gửi AI:** chỉ số liệu + tin nhắn; bỏ email, địa chỉ ví, Privy id trước khi gửi.
- **Xoá hẳn:** `DELETE /api/userdata` xoá bản ghi KV + bộ đếm tin trong D1; giữ `power_tx` (bằng chứng thanh toán, không có dữ liệu tài chính), ghi rõ trong Privacy.
- Privacy liệt kê: Cloudflare, Privy, OpenAI, Anthropic, Telegram (chỉ báo "có yêu cầu mới").

## S6. Phí

- Mở vault: `fee` trong factory (1 USDC; 0 = tắt), thu khi `createVault`.
- AI power: giữ V1 (`functions/_lib/quota.ts`): 20 tin/ngày miễn phí, 1 USDC = 100 tin không hết hạn, kiểm giao dịch onchain. Đây là nguồn lãi.
- Mọi nước như nhau.

## S7. Môi trường V2

- Cloudflare Pages project riêng (vd `moonsafe-v2`) trên **subdomain của moonsafe.app** (vì RP ID passkey). Không link từ moonsafe.app, `noindex`; ai có link vào được.
- KV riêng, D1 riêng (`migrations/0001_ledger.sql`), secret riêng (`USERDATA_KEY`, khoá AI).
- Privy: dùng app hiện có, thêm domain V2 vào allowed origins.
- Contract: Arc mainnet (5042), factory V2 do Hiếu deploy, địa chỉ ghim trong biến build.
- V1 moonsafe.app giữ nguyên.

## S8. Thứ tự build + tiêu chí xong

| # | Việc | Xong khi |
|---|---|---|
| 1 | Trang thử passkey PRF trên các trình duyệt | Có bảng trình duyệt nào chạy, Hiếu xem |
| 2 | Hiếu deploy implementation + factory V2 (`indexed passwordKey` đã xong) | Có địa chỉ, verify trên explorer |
| 3 | Môi trường V2 (Pages, KV, D1, subdomain) | Mở link V2 thấy app, không bị index |
| 4 | Màn Vault: Open (A/B), Deposit, Withdraw, Import | Chạy thật trên mainnet số tiền nhỏ, cả passkey lẫn giấy, cả Import |
| 5 | Agent S4 + bảng 3 phần + tiền tệ | `test:agent` + eval pass; hết 7/10, top 10, Buy steadily |
| 6 | Dữ liệu S5 + màn đồng ý + Privacy/Terms | KV thấy đã mã hoá; xoá xong đọc lại rỗng |
| 7 | Nút "!" + xuất khoá | Bấm đủ mục |
| Sau | Prompt bao quát nhiều tài sản, agent đa năng hơn | — |

---

