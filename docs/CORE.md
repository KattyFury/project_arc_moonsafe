# MoonSafe — CORE

> Nguồn chuẩn cho mọi phiên làm việc (Claude, Codex, người). Đọc trước khi sửa agent, màn hình hay hợp đồng. Hiếu chốt 2026-11-01.
> Mâu thuẫn giữa file này và spec cũ trong `docs/` → file này đúng. Đổi core = Hiếu chốt trước, rồi sửa file này.

## Vai trò của app

MoonSafe là **người giữ quỹ dự phòng**, rồi là **người tư vấn**, không phải người ra lệnh.

1. Đảm bảo quỹ dự phòng có thật và đủ (onchain, kiểm được).
2. Quỹ đủ rồi mới tư vấn chia tiền theo tuổi.
3. Người dùng tự quyết và tự làm, xong thì báo lại; app ghi lại để nắm tình hình. App không chia tiền hộ, không ra lệnh mua bán.

## 1. Quỹ dự phòng nằm onchain

- **Vì sao onchain:** an toàn, và agent kiểm được. Người dùng không thể khai láo "tôi có quỹ khẩn cấp rồi" để dồn hết vào coin hay cổ phiếu.
- Chỉ số dư vault của chính người dùng mới là quỹ. Lời khai ("tôi có quỹ ở ngân hàng") không bao giờ được tính.
- Mức quỹ = (chi tiêu + trả nợ hằng tháng) × số tháng: 3 tháng (thu nhập đều, không ai phụ thuộc), 6, 9 hoặc 12 tháng (thu nhập không đều và/hoặc có người phụ thuộc). Thiếu thông tin thì hỏi đúng 1 câu.
- Quỹ chưa đầy: không tư vấn đầu tư, không đưa con số chia; mọi câu "phần nào trước" đều quay về quỹ. Nút mua cirBTC trong app khoá cho tới khi quỹ đầy và hết nợ lãi cao.
- Nợ lãi cao (từ 10%/năm) trả trước: quỹ khởi đầu 1 tháng → trả nợ → hoàn tất quỹ → đầu tư.
- *Đã có trong code.*

## 2. Ba phần và 5 ô dữ liệu

| Ô | Gồm | Ghi chú |
|---|---|---|
| **Dự phòng** | USDC trong vault | Đọc onchain, không lưu trong hồ sơ |
| **Safety** | Phần rủi ro thấp: tiền gửi có kỳ hạn, trái phiếu chính phủ / quỹ trái phiếu / quỹ thị trường tiền tệ; tiền mặt, tài khoản ngân hàng hoặc stablecoin **mà người dùng chọn làm Safety** | Safety ≠ quỹ dự phòng: nó giữ cho tổng tài sản ít dao động, không phải tiền rút lúc nào cũng được (tiền gửi có kỳ hạn bị khoá tới ngày đáo hạn) |
| **Traditional** | Cổ phiếu / quỹ chỉ số (VOO), vàng, trái phiếu lãi cao | |
| **Crypto** | Chủ yếu BTC; coin khác vẫn ghi và tính vào đây | Không đặt mục tiêu riêng cho altcoin hay memecoin |
| **Chưa xếp** | Tiền mặt, ngân hàng không kỳ hạn, stablecoin chưa được chọn làm Safety | Không bao giờ gọi là Safety |

- Safety chỉ là Safety khi người dùng **hiểu vì sao cần** và **tự chọn** tiền nào, dạng nào. Chỉ chọn được dạng ít biến động; vàng, cổ phiếu hay coin làm Safety thì agent giải thích vì sao không nên và không ghi. Tiền gửi có kỳ hạn và trái phiếu đã có thì tính thẳng là Safety, kèm lời giải thích.
- Nhà ở, xe, bất động sản cho thuê, vốn doanh nghiệp, tiền cho vay nằm ngoài 3 phần (chưa chốt cách xếp, xem cuối file).
- *Đã có trong code.*

## 3. Bảng cân đối theo dõi SỰ CÂN BẰNG, không theo dõi tổng tiền

- **Vì sao:** tổng tiền thay đổi liên tục theo giá. Thứ cần theo dõi là tỷ lệ Safety / Traditional / Crypto so với mục tiêu.
- Mục tiêu theo tuổi: Safety = tuổi %, phần còn lại chia Traditional / Crypto (MoonSafe mặc định 50/50, người dùng chọn khác được; agent nói rõ 50/50 là mặc định của app, không phải quy tắc chuẩn). Ví dụ 63 tuổi: 63% / 18,5% / 18,5%.
- **Hiển thị:** tỷ lệ là thước đo chính, **số tiền hiện song song** ("Safety 36% ($200,000), mục tiêu 63%: thiếu"). Cân bằng được đánh giá bằng %, không bằng việc tổng tiền tăng hay giảm.
- Gốc tính là phần đầu tư: Safety cần = (Traditional + Crypto) × Safety% / (100 − Safety%). Tiền chưa xếp lấp Safety trước, phần dư chia theo tỷ lệ; trong phần đầu tư, tiền mới vào bên đang thiếu trước.
- **Không bao giờ khuyên bán** để cân lại. Phần vượt tỷ lệ là "trên tỷ lệ, không cần bán, tiền mới vào phần khác". Giá giảm không phải lý do để giục mua thêm.
- Giá trị tài sản tính theo **giá hiện tại** (số lượng × giá), không theo giá vốn; không hỏi "đã mua bao nhiêu tiền".
- *Code hiện chỉ có $ ("$X of $Y, $Z to go") → **phải sửa**: màn Balance + lời agent đưa % lên làm chính, $ đi kèm.*

## 4. Ghi dữ liệu

- Mỗi người dùng 1 bản ghi riêng (Cloudflare KV `u:<Privy id>`), trình duyệt giữ bản sao. Tài sản là danh sách món; ô của món suy ra từ loại + lựa chọn Safety của người dùng.
- Mỗi tin nhắn: agent đọc lời người dùng, đối chiếu với dữ liệu, đề nghị thêm / sửa / chuyển ô / xoá. **Mọi thay đổi tài sản đều qua thẻ xác nhận**, kể cả lần khai đầu.
- Người dùng kể thay đổi mà không nói số ("bán bớt ETH") → không ghi, hỏi đúng 1 câu. Số khai đã cũ → hỏi lại món cũ nhất, mỗi lần 1 món.
- Chỉ ghi điều người dùng khẳng định về chính mình; ví dụ giả định, tiền của người khác, khoản đã lỗ thì không ghi.
- *Đã có trong code.*

## 5. Invest: hôm nay cirBTC, sau này cổ phiếu và vàng onchain

- Hôm nay chỉ mua được cirBTC trong app; Traditional mua qua nhà môi giới của người dùng.
- Tương lai chắc chắn có cổ phiếu và vàng token hoá trên Arc. Màn Invest và dữ liệu phải thiết kế thành **danh sách tài sản onchain**, mỗi món gắn nhóm Traditional hoặc Crypto, thêm loại mới không phải viết lại.
- Tài sản có 2 mức tin cậy: **đã kiểm onchain** (đọc số dư từ chuỗi) và **tự khai**. Hiển thị rõ món nào là món nào.
- *Phải xây khi có tài sản onchain mới.*

## 6. Bảo mật: đây là tiền thật, bảo vệ cả 2 mặt

**Mặt 1: bản thân vault an toàn.** Hợp đồng đơn giản, không ai ngoài người dùng chạm được tiền, test kỹ, kiểm toán trước mainnet.

**Mặt 2: mất ví (bị hack) cũng không bị rút tiền.** Rút tiền cần **2 chìa tách rời: ví + email**, như multisig 2-of-2. Có ví mà không có email thì không rút được; có email mà không có ví cũng không rút được.

Sự thật kỹ thuật phải giữ khi xây:
- Hợp đồng onchain không đọc được email. "Chìa email" thực chất là **khoá của MoonSafe trên server, chỉ ký sau khi người dùng bấm link xác nhận trong mail** (link ghi rõ số tiền và địa chỉ nhận). Khoá này **đứng một mình không rút được gì**: không có chữ ký ví thì hợp đồng từ chối.
- Server không bao giờ giữ khoá ví của người dùng.
- **Đường thoát khi MoonSafe sập hoặc đóng cửa:** chỉ dùng ví vẫn rút được nhưng phải **chờ 7 ngày**, trong lúc đó email (và app) báo và **huỷ được**. Tiền không bao giờ bị kẹt vì server; kẻ trộm ví thì bị email chặn trong 7 ngày đó.
- **Mất ví:** email + ví mới → đổi chủ sau 7 ngày chờ; ví cũ huỷ được trong lúc chờ (spec `docs/vault-recovery-spec.md`).
- **Mất email:** ví → đổi email sau 7 ngày chờ; email cũ huỷ được trong lúc chờ.
- Mất cả 2 chìa = mất quyền rút. Phải nói rõ với người dùng lúc mở vault.

Hiện trạng: hợp đồng hiện tại (`VaultProxy`) chỉ có 1 chìa là ví, rút toàn bộ ngay tới bất kỳ địa chỉ nào → lộ khoá ví = mất cả quỹ. **Vault v3 chưa xây: làm SAU hackathon, khi có mini grant (Hiếu chốt 2026-11-01).** Trước đó không đổi hợp đồng. Vault cũ không nâng cấp được, người dùng tự chuyển tiền sang vault mới.

Việc khác còn mở (từ `docs/audit-mainnet-2026-10-29.md`): giới hạn đăng ký Privy, giới hạn tần suất `/api/*` trên Cloudflare, gói Workers trả phí, Safe 2-of-2 chưa có ví dự phòng.

## Chưa chốt

- Rút trong lúc khẩn cấp: mỗi lần rút đều chờ bấm mail (vài phút), hay vẫn cho rút ngay một khoản nhỏ (ví dụ 1 tháng chi tiêu/ngày) chỉ bằng ví?
- Email nhận link: email đăng nhập Privy, hay một email riêng người dùng tự khai (tách khỏi tài khoản đăng nhập để mất một bên không mất cả hai)?
- Tiền rút được gửi tới đâu: bất kỳ địa chỉ nào (đã ghi trong link mail), hay chỉ về ví chủ?
- Bất động sản cho thuê, bảo hiểm tích luỹ, tiền cho vay, vốn doanh nghiệp, NFT xếp ở đâu.
