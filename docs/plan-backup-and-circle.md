# Plan: backup khi ví bị hack (vault v3) + có nên chuyển Privy sang Circle

> Bản nháp để Hiếu chốt (2026-11-06). Chưa sửa code. Theo `CLAUDE.md`: các lựa chọn đánh số, chờ chốt rồi mới làm.
> Làm SAU hackathon (đã chốt 2026-11-01). Nguồn chuẩn hiện tại: `docs/CORE.md` §6, `docs/vault-recovery-spec.md`.

## CHỐT (Hiếu, 2026-11-06). Phần này thắng mọi mục bên dưới

**Hợp đồng: 2-of-2 ví + email**, đúng như `CORE.md` §6. Không thêm chìa thứ 3, không nút khoá, không passkey. Mất một chìa thì còn chìa kia lo (đường 7 ngày); mất cả hai là mất quyền rút, và phải nói rõ lúc mở vault.

**Ví: giữ Privy.** Không dùng Circle (không rẻ hơn, chưa chứng minh bảo mật hơn, phải viết lại phần ký giao dịch).

**Luôn có đủ 2 thứ của mỗi người: ví và email.**
- *Đăng nhập bằng email* → một bước nói rõ: email này gắn với ví `0xabcd…wxyz`. Cho người dùng **chọn** xuất khoá ví hay không (không bắt buộc, không chặn vào app). Kèm cảnh báo: khoá vừa là tài khoản vừa là mật khẩu của ví, lộ là bị lấy tiền, phải tự cất kỹ. Xuất bằng chức năng của Privy (chạy trong iframe của họ); app MoonSafe không bao giờ thấy hay lưu khoá. Chưa xác minh tên hàm trong bản `@privy-io/react-auth` đang dùng: đọc `.d.ts` sau khi `bun install`.
- *Đăng nhập bằng ví web3* → một bước nhập email nhận OTP. **Email do MoonSafe tự lưu và tự xác minh** (OTP gửi bằng Resend của MoonSafe, lưu trong dữ liệu MoonSafe), không nhờ Privy gắn email. Nhờ vậy không dính lỗi ngày 2026-10-29 (commit `31e5ac7`: Privy từ chối gắn email thứ hai, "User already has one email account linked"). Người đăng nhập bằng email thì lấy luôn email Privy đã xác minh, khỏi OTP lần nữa. Bước này lỗi cũng không được chặn người dùng vào app.
- *Nút nhỏ ở màn đăng nhập* (dấu chấm than, không to rõ): "Mất 1 trong 2?" → khôi phục vault / liên hệ support / điều khoản. **Đầy đủ chức năng trong V2**, nên nút "khôi phục vault" phải dùng được thật: cần hợp đồng recovery, server, nhà gửi mail trước khi bật.

**Mốc:** hackathon đã xong, nên vault 2-of-2 (CORE gọi là v3) nằm trong V2 và làm ngay. Hợp đồng mới cần test Foundry + kiểm toán lại trước khi lên mainnet.

**Support:** email hỗ trợ trên tên miền moonsafe.app (địa chỉ cụ thể Hiếu chốt) + một bot Telegram báo tin nhắn/yêu cầu mới vào cho Hiếu. Nút "!" dẫn tới đây.

**Còn mở:** email nhận link mặc định là email đăng nhập, tuỳ chọn khai email riêng; rút khẩn cấp có cho rút nhỏ chỉ bằng ví không; tiền rút gửi về ví chủ hay địa chỉ bất kỳ.

---

> Các mục dưới đây là bản nghiên cứu ban đầu (có 2-of-3, Circle làm chìa dự phòng, nút khoá, passkey). Giữ lại làm tham khảo, KHÔNG phải quyết định.

## 0. Kết luận nhanh (bản đầu, đã bị thay bởi mục CHỐT)

1. **Hack ví: muốn lấy lại được tiền thì cần chìa thứ 3.** Ví + email (2-of-2) chặn được kẻ trộm rút tiền, nhưng không cho người thật lấy lại tiền, vì kẻ trộm cầm ví vẫn huỷ được mọi lần recovery. Đề xuất: **2-of-3 có thời gian chờ** (ví, email, ví dự phòng). Xem mục 1.
2. **Chuyển hẳn sang Circle: chưa nên.** Không rẻ hơn Privy ở quy mô nhỏ, chưa chứng minh được bảo mật hơn, và phải viết lại phần ký giao dịch. **Nên dùng Circle làm "ví dự phòng"** (chìa thứ 3, khác nhà cung cấp với Privy). Xem mục 2.

## 1. Backup trong hợp đồng (vault v3)

### 1.1 Hiện trạng
`VaultProxy.sol`: 1 chủ cố định, `withdraw` rút hết ngay tới địa chỉ bất kỳ, không đổi chủ. Lộ khoá ví = mất cả quỹ. Không có đường lấy lại.

### 1.2 Vì sao 2-of-2 (ví + email) chưa đủ khi bị hack
- Kẻ trộm cầm ví không rút nhanh được (thiếu chữ ký email). Phần này ổn.
- Nhưng người thật muốn đổi chủ sang ví mới: spec hiện tại cho "ví cũ huỷ được trong 7 ngày chờ". Kẻ trộm cầm ví cũ **huỷ mãi mãi**. Hợp đồng không phân biệt được bên nào là bên bị hack.
- Cần thêm một chìa mà kẻ trộm ví không có.

### 1.3 Đề xuất: 3 chìa, quy tắc 1 câu
- **Owner**: ví đăng nhập (Privy hoặc ví ngoài).
- **Guardian**: khoá MoonSafe trên server, chỉ ký sau khi người dùng bấm link trong mail (link ghi số tiền + địa chỉ nhận). Đứng một mình không làm được gì.
- **Backup**: một địa chỉ độc lập người dùng tự chọn lúc mở vault (ví Circle, ví cứng, hoặc ví thứ hai). **Gợi ý: ví Circle**, vì khác nhà giữ khoá với Privy.

Quy tắc:
- **Hai chìa bất kỳ ký chung → làm ngay** (rút, đổi chủ, đổi guardian, đổi backup).
- **Một chìa đứng một mình → chờ 7 ngày, và hai chìa còn lại, chìa nào cũng huỷ được.**

| Tình huống | Kết quả |
|---|---|
| Rút bình thường | Owner + Guardian (bấm mail), ngay lập tức |
| Ví bị hack | Kẻ trộm chỉ có Owner: rút phải chờ 7 ngày, bạn huỷ bằng email hoặc backup. Bạn dùng Guardian + Backup đổi Owner hoặc rút sạch sang ví mới ngay |
| Mất ví | Guardian + Backup đổi Owner ngay |
| Mất email | Owner + Backup đổi Guardian ngay |
| Mất ví dự phòng | Owner + Guardian đổi Backup ngay |
| MoonSafe sập | Owner + Backup làm ngay; Owner một mình thì chờ 7 ngày |
| Mất 2 chìa bất kỳ | Chìa còn lại chỉ rút được sau 7 ngày, và chỉ khi không ai huỷ. Mất 2 chìa mà kẻ trộm không có thì tiền kẹt: phải nói rõ lúc mở vault |
| Hack 2 chìa cùng lúc | Mất tiền. Đây là giới hạn của mọi 2-of-3 |

Phần khớp với `CORE.md` §6: server không giữ khoá ví, Guardian đứng một mình không rút được, đường thoát 7 ngày khi MoonSafe sập, báo mail trong thời gian chờ.

### 1.4 Việc phải làm (thứ tự)
1. **Chốt thiết kế** (mục 3, câu hỏi 1a-1c). Cập nhật `CORE.md` §6 và thay `vault-recovery-spec.md`.
2. **Hợp đồng**: `VaultV3` (clone, không nâng cấp được như v1): 3 địa chỉ, EIP-712 cho chữ ký Guardian/Backup (nonce + hạn dùng + khoá chain ID), hàng đợi hành động có `eta` 7 ngày, `cancel` cho chìa không phải người đề xuất, sự kiện cho mỗi bước. Guardian đọc từ factory để Safe xoay khoá được.
3. **Test Foundry**: Guardian một mình không làm được gì; Owner một mình phải chờ; huỷ bởi chìa khác nhưng không bởi chính người đề xuất; replay chữ ký; deposit/withdraw vẫn chạy trong lúc có hành động đang chờ; fuzz + invariant (tiền chỉ ra khi đủ điều kiện).
4. **Server**: khoá Guardian là secret Cloudflare; endpoint xin/duyệt/huỷ; link mail ghi rõ số tiền + địa chỉ; job hằng ngày hoàn tất hành động đến hạn; nhà gửi mail (đã có Resend trong `secrets.env`).
5. **App**: màn mở vault chọn Backup, banner "có yêu cầu đang chờ" kèm nút Huỷ, màn Recover.
6. **Kiểm toán + deploy mainnet**, người dùng v1 tự chuyển tiền sang v3 (v1 không nâng cấp được).

Rủi ro: hợp đồng phức tạp hơn nhiều so với v1 (v1 chỉ ~100 dòng) → bắt buộc audit lại trước mainnet.

### 1.5 Sản phẩm tương tự làm thế nào (đã tra, 2026-11-06)
| Sản phẩm | Cách làm | Điều học được |
|---|---|---|
| **Casa** (BTC, 2-of-3) | Mất 1 chìa: xin chữ ký "recovery key" của Casa, **chờ 7 ngày** (vault 3 chìa) hoặc 48 giờ (vault 5 chìa) | Công ty giữ chìa thứ 3 + thời gian chờ + báo cho người dùng. Giống Guardian của ta |
| **Unchained** (BTC, 2-of-3) | Người dùng giữ 2 chìa, Unchained giữ 1. Mất thiết bị: chìa còn lại + Unchained ký chung, không chờ | 2-of-3 là mẫu phổ biến cho quỹ lớn. Xác nhận hướng 1.3 |
| **Safe{RecoveryHub}** (EVM) | "Recoverer" vượt ngưỡng ký sau thời gian chờ (mặc định 28 ngày, chọn 7/14/56). **Chủ ví hiện tại huỷ được** | Tài liệu **không nói** chuyện chủ ví bị hack tự huỷ recovery. Ví Safe nhiều chủ (ngưỡng >1) thì một chìa bị trộm không huỷ nổi. Cùng lỗ hổng ta đã thấy ở 2-of-2 |
| **Argent** (EVM/Starknet) | Recovery qua đa số guardian, **chờ 36 giờ**, chủ huỷ được. Guardian có nút **khoá ví** (5 ngày) nhưng không tiêu được tiền | Guardian không bao giờ tiêu tiền, chỉ đổi khoá/khoá ví. Nút khoá là ý hay, rẻ để thêm |
| **BIP-345 OP_VAULT** (đề xuất cho BTC) | Chìa tiêu chỉ **khởi động** rút, chờ N block; **chìa recovery** quét tiền về địa chỉ lạnh đã cam kết sẵn, không khởi động rút được | Đúng mô hình "một chìa đứng riêng thì chờ, chìa khác huỷ/quét về". Hạn chế họ nêu: **phải có người (hoặc watchtower) canh**, không thì kẻ trộm chỉ việc chờ hết hạn. Cả hai chìa bị trộm = mất |
| **Coinbase Smart Wallet** | Passkey đồng bộ iCloud/Google; cụm từ khôi phục tuỳ chọn; "recovery signer" tự giữ đang được hứa là sắp có (đọc qua kết quả tìm kiếm, trang gốc chặn 403) | Người dùng đại chúng khó giữ ví cứng. Passkey đồng bộ là chìa phụ ít ma sát |
| **Ambire / Candide (Safe)** | Đăng nhập email+mật khẩu là multisig 2/2; guardian bằng email/SMS xác nhận để khôi phục | Dùng email làm guardian là cách đã có người làm; chỗ khác nhau của ta là guardian do MoonSafe giữ |

**Điều rút ra, và thay đổi so với bản trước:**
1. 2-of-3 đúng là mẫu chuẩn (Casa, Unchained, Safe nhiều chủ). Không phải tự nghĩ ra.
2. Safe và Argent đều để **chủ ví hiện tại huỷ recovery**, tức là chưa giải quyết ca ví bị hack. Quy tắc "chìa nào không phải người đề xuất mới huỷ được" (mục 1.3) là chỗ tốt hơn, và gần với OP_VAULT.
3. **Thời gian chờ ngoài thị trường: 36 giờ (Argent), 48 giờ-7 ngày (Casa), 7-56 ngày (Safe).** 7 ngày nằm trong khoảng, nhưng với ca hack thì 7 ngày là dài: nên cân nhắc 72 giờ (câu hỏi 5 bên dưới).
4. **Delay chỉ có tác dụng nếu có người canh** (bài học OP_VAULT). Phải thêm: mọi hành động bị đưa vào hàng đợi đều gửi mail ngay + banner trong app, và server có job quét sự kiện onchain. Nếu hộp mail bị hack thì mail cảnh báo vô dụng, nên cần thêm kênh thứ hai (push/Telegram) hoặc chấp nhận giới hạn này.
5. Thêm **nút khoá** kiểu Argent: Guardian hoặc Backup đóng băng mọi hành động chỉ-Owner trong vài ngày, không tiêu được tiền. Một lần bấm khi nghi bị hack.
6. Chìa Backup không nhất thiết là ví Circle: **passkey đồng bộ iCloud/Google** (kiểu Coinbase) ít ma sát hơn cho người dùng thường. Chưa kiểm chứng Arc có hỗ trợ xác minh chữ ký passkey (secp256r1) onchain hay không; cần tra trước khi hứa.

## 2. Circle thay Privy?

### 2.1 So sánh (số liệu cần xác minh lại khi chốt)
| | Privy (đang dùng) | Circle User-Controlled Wallets |
|---|---|---|
| Giá | Gói miễn phí tới khoảng 10K MAU, rồi $299/tháng (Core) trở lên (theo trang tổng hợp giá bên thứ ba, chưa đọc privy.io/pricing) | 1.000 ví hoạt động/tháng đầu miễn phí, sau đó $0,05/ví/tháng; hoàn $0,01 nếu ví giữ ≥10 USDC cả tháng |
| Đăng nhập | email, Google, ví ngoài (MetaMask…) | Google, Apple, Facebook, email OTP, PIN. **Không có ví ngoài** |
| Khôi phục | Đăng nhập lại là có lại ví cùng địa chỉ | PIN + câu hỏi bảo mật. Mất cả hai = mất vĩnh viễn, Circle không giúp được |
| Arc | Đang chạy | Hỗ trợ Arc mainnet + testnet, loại EOA và SCA |
| Tích hợp | Chuẩn EIP-1193, dùng được wagmi/viem như hiện tại | Chưa thấy tài liệu nói có provider kiểu wagmi. Cách làm mẫu: server tạo giao dịch bằng API key, người dùng nhập PIN trong SDK để ký |

Ví dụ giá: 5.000 người dùng hoạt động → Circle khoảng $200/tháng (trừ tối đa vài chục đô hoàn tiền); Privy vẫn miễn phí. **Circle chỉ rẻ hơn khi dưới ~1.000 người, mà lúc đó cả hai đều miễn phí.**

### 2.2 Bảo mật
Cả hai đều chia khoá thành mảnh, không bên nào giữ trọn khoá. Tôi **không tìm thấy bằng chứng** Circle an toàn hơn Privy. Khác nhau chủ yếu là mô hình khôi phục: Circle phụ thuộc PIN + câu hỏi bảo mật (người dùng thường quên hoặc chọn câu dễ đoán), Privy phụ thuộc quyền vào email/Google. Phần "tôi không biết": cách mỗi bên lưu mảnh khoá, vì tài liệu Circle tôi đọc không nói.

### 2.3 Chuyển hẳn sang Circle sẽ đụng những gì
- `src/privyConfig.ts`, `WalletPref.tsx`, `useVault.ts`, `chain.ts`, `AppShell`, `LoginScreen`, `SettingsScreen`…: toàn bộ ký giao dịch (wagmi/viem) viết lại thành luồng "server tạo giao dịch → người dùng nhập PIN".
- `functions/_lib/privyAuth.ts` và mọi API dùng nó (`chat`, `userdata`, `power`, `usage`, `admin`): đổi xác thực, đổi khoá dữ liệu người dùng (hiện theo Privy user id).
- Vault v1 có chủ cố định = địa chỉ Privy → mỗi người dùng phải rút và tạo lại vault ở địa chỉ Circle mới.
- Mất đăng nhập bằng ví ngoài (MetaMask).
- Mọi giao dịch phải qua server + API key → thêm độ trễ, thêm một điểm sập, thêm secret.
- Đây là thay đổi kiến trúc lớn (>3 file), cần bạn duyệt riêng.

### 2.4 Khuyến nghị
**Giữ Privy làm đăng nhập + ví chính; dùng Circle làm Backup (chìa thứ 3).**
- Ví Circle chỉ cần: tạo 1 lần để lấy địa chỉ, ký rất hiếm (khi cứu hộ). Tích hợp nhỏ, không đụng luồng ký hằng ngày.
- Được lợi lớn nhất của Circle: **khác nhà giữ khoá**. Privy sập hoặc bị tấn công thì chìa Backup vẫn nằm ngoài.
- Nếu sau này Circle chứng minh tốt hơn (giá, UX, có provider chuẩn), việc chuyển hẳn dễ hơn vì vault v3 đã tách vai trò.

Nếu bạn vẫn muốn chuyển hẳn, thứ tự đề xuất: (1) spike 1-2 ngày: một tx USDC trên Arc testnet bằng UCW + dò xem có provider kiểu EIP-1193 không; (2) chạy song song hai loại đăng nhập; (3) chuyển API auth; (4) đưa người dùng sang vault v3 ở địa chỉ mới; (5) bỏ Privy.

## 3. Cần bạn chốt

**Hợp đồng**
- 1a. Dùng 2-of-3 (ví, email, backup) như mục 1.3. / 1b. Giữ 2-of-2 (ví + email) rồi chấp nhận người thật không lấy lại được ví bị hack nếu kẻ trộm cứ huỷ.
- 2a. Backup bắt buộc lúc mở vault. / 2b. Tuỳ chọn (không đặt thì quay về 2-of-2 và chịu lỗ hổng trên).
- 3a. Rút luôn cần Owner + Guardian (bấm mail, vài phút). / 3b. Cho rút nhanh một khoản nhỏ mỗi ngày chỉ bằng ví (đã nằm trong "Chưa chốt" của CORE).

- 5a. Thời gian chờ 7 ngày. / 5b. 72 giờ. / 5c. 36 giờ như Argent.
- 6a. Thêm nút khoá (Guardian/Backup đóng băng). / 6b. Không.
- 7a. Backup = ví Circle hoặc ví tự chọn. / 7b. Backup = passkey đồng bộ (cần tra Arc trước).

**Circle**
- 4a. Giữ Privy, Circle làm Backup (khuyến nghị). / 4b. Giữ Privy hoàn toàn, Backup là ví bất kỳ do người dùng dán địa chỉ. / 4c. Chuyển hẳn sang Circle (cần spike trước).

## Nguồn
- Casa/Unchained: https://www.spark.money/tools/bitcoin-collaborative-custody-comparison
- Safe{RecoveryHub}: https://help.safe.global/en/articles/110656-account-recovery-with-safe-recoveryhub
- Argent: https://argent.xyz/blog/off-chain-recovery , https://www.spark.money/glossary/social-recovery
- OP_VAULT: https://www.spark.money/research/bitcoin-bip345-op-vault-custody
- Coinbase Smart Wallet: https://help.coinbase.com/en/wallet/getting-started/smart-wallet-recovery
- Ambire / Candide: https://docs.candide.dev/wallet/plugins/recovery-flow-guide/
- Giá Circle: https://www.circle.com/wallets (và https://circle.com/credits)
- Khôi phục + đăng nhập Circle: https://developers.circle.com/wallets/user-controlled/recover-account , https://developers.circle.com/w3s/authentication-methods
- Arc được hỗ trợ: https://developers.circle.com/wallets/supported-blockchains
- Giá Privy (bên thứ ba, cần đối chiếu): https://costbench.com/software/web3-wallet-sdk/privy
