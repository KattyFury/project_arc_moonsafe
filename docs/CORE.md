# MoonSafe — CORE V2

> Nguồn chuẩn cho V2 (Claude, Codex, người). V1 ở moonsafe.app giữ nguyên, chạy theo `docs/archive/CORE-v1-2026-11-06.md`.
> Hiếu chốt 2026-11-07. Mâu thuẫn giữa file này và spec cũ trong `docs/` → file này đúng. Đổi core = Hiếu chốt trước, rồi sửa file này.

## Vai trò của app

MoonSafe là **người giáo dục tài chính** cho người dùng Web3. Quỹ dự phòng onchain là **công cụ tạo kỷ luật** (Hiếu 2026-11-07: kỷ luật là lý do chính; "agent kiểm được quỹ có thật" là lý do phụ).
Người dùng tự quyết, tự làm, xong thì báo lại. App không chia tiền hộ, không ra lệnh mua bán, không giữ tiền hộ.
Bỏ chữ "người giữ quỹ" và "người tư vấn" của V1.

## 1. Agent: người giáo dục (Hiếu 2026-11-07)

- **Được nói:** "Quy tắc phổ biến là X; với số của bạn thì thành Y."
- **Không được nói:** "Bạn nên mua / bán / chuyển…". Không nêu số tiền gắn với BTC hay coin cụ thể. Bỏ "cứ 10 đô Crypto thì ~7 đô BTC". Bỏ câu cổ vũ kiểu "Buy steadily".
- **Người dùng hỏi "có nên mua BTC / tài sản X không?":** phân tích rủi ro–lợi nhuận và lý do, nêu cả hai phía. Ví dụ: altcoin có thể mất gần hết giá trị; BTC vốn hoá và thanh khoản lớn nhất nhưng cũng từng sụt sâu. Nhắc quỹ dự phòng trước. Kết bằng "bạn tự quyết, đây không phải tư vấn đầu tư". Không kết luận "nên chọn".
- Quỹ chưa đầy: không bàn đầu tư (như V1).
- Nhãn "AI" rõ ràng. Câu trả lời có số tiền gắn với crypto kèm một câu "không phải tư vấn đầu tư, bạn tự quyết".
- Hỏi "có hợp pháp / có giấy phép không": nói thật là chưa có giấy phép, app không giữ tiền hộ, người dùng tự chịu trách nhiệm với luật nơi họ sống.
- Người khai dưới 18: dừng tư vấn, chỉ giáo dục chung. Tuổi tối thiểu 18+.
- App chỉ có tiếng Anh; agent trả lời theo ngôn ngữ người dùng nhắn.

## 2. Quỹ dự phòng nằm onchain

- **Vì sao onchain:** tạo kỷ luật (tiền nằm trong vault thì khó tiêu bậy) và agent kiểm được. Lời khai ("tôi có quỹ ở ngân hàng") không bao giờ được tính.
- Mức quỹ = (chi tiêu + trả nợ hằng tháng) × số tháng: 3 (thu nhập đều, không ai phụ thuộc), 6, 9 hoặc 12 (thu nhập không đều và/hoặc có người phụ thuộc). Thiếu thông tin thì hỏi đúng 1 câu.
- Quỹ chưa đầy: không bàn đầu tư, mọi câu "phần nào trước" quay về quỹ. Nút mua cirBTC khoá tới khi quỹ đầy và hết nợ lãi cao.
- Nợ lãi cao (từ 10%/năm) trả trước: quỹ khởi đầu 1 tháng → trả nợ → hoàn tất quỹ → đầu tư.

## 3. Bốn ô dữ liệu

| Ô | Gồm | Ghi chú |
|---|---|---|
| **Dự phòng** | USDC trong vault | Đọc onchain, không lưu trong hồ sơ |
| **Safety** | Tiền gửi có kỳ hạn, trái phiếu / quỹ trái phiếu / quỹ thị trường tiền tệ; tiền mặt, ngân hàng hoặc stablecoin **mà người dùng chọn làm Safety** | Safety ≠ quỹ dự phòng |
| **Traditional** | Cổ phiếu / quỹ chỉ số, vàng, trái phiếu lãi cao | |
| **Crypto** | BTC và mọi coin khác, một thanh duy nhất | **Bỏ** hướng dẫn 7/3, bỏ "ưu tiên top 10". Agent không tự nêu tên coin; khi được hỏi thì giải thích theo mục 1 |

- Tiền bank / stablecoin KHÔNG BAO GIỜ mặc định là Safety: chỉ đúng khoản người dùng tự nói là Safety (Hiếu 2026-11-01).
- Không theo dõi tiền nhàn rỗi (Hiếu 2026-11-01). Ngoại lệ (Hiếu 2026-11-03): người dùng tự kể trong chat và quỹ chưa đầy thì nói một câu rằng tiền đó có thể nạp quỹ trước, không nêu số, không ghi.
- Safety chỉ được chọn dạng ít biến động; vàng, cổ phiếu, coin làm Safety thì agent giải thích vì sao không nên và không ghi.
- Nhà ở, xe, bất động sản cho thuê, vốn doanh nghiệp, tiền cho vay nằm ngoài 3 phần (chưa chốt cách xếp).

## 4. Bảng cân đối: phần đi xa nhất làm mốc

- **Tỷ lệ (Hiếu 2026-11-07):** có tuổi thì app tự tính Safety = tuổi %. Người dùng tự chọn cách chia phần còn lại giữa Traditional và Crypto. **Crypto tối đa 50% phần còn lại**, kèm giải thích: crypto biến động mạnh, thuộc nhóm đầu tư mạo hiểm.
- Công thức theo tuổi gọi là "quy tắc phổ biến app dùng để minh hoạ", không phải lời khuyên. Màn hình hiện tỷ lệ của người dùng.
- **Luật mốc (Hiếu 2026-11-01):** phần đi xa nhất so với tỷ lệ của nó (tiền / tỷ lệ lớn nhất) là thanh đầy 100%; các phần khác theo nó. Ví dụ 30 tuổi (30/35/35), Safety $3.000 đi xa nhất → Traditional và Crypto đầy ở $3.500.
- Không lấy tổng 3 phần làm 100%, không hiện % trên từng phần. Mỗi phần viết: còn thiếu trước, rồi hiện trạng: "$2,500 to go (now $1,000 / $3,500)"; phần đủ ghi "full", phần làm mốc ghi "furthest ahead, it sets the size". Số lẻ luôn đủ 2 chữ số.
- **Giữ "to go" cho mọi phần, kể cả Crypto (Hiếu 2026-11-07).** Dòng của Crypto chờ luật sư (xem Chưa chốt).
- Không phần nào vượt thanh của nó nên **không bao giờ khuyên bán**. Giá giảm không phải lý do để giục mua thêm.
- Giá trị tài sản theo **giá hiện tại** (số lượng × giá), không hỏi giá vốn.
- Chưa đầu tư gì: nói tỷ lệ 3 phần rồi để người dùng bổ sung từ từ; đã có tài sản: bổ sung các phần sau mốc, thứ tự do người dùng.

## 5. Ghi dữ liệu (giữ như V1, Hiếu 2026-11-06)

- Đúng 3 nút tắt trên ô chat: `Update split` · `Edit cash flow` · `Edit information`. Update split: Safety, Traditional, Crypto, mỗi phần nhiều món, tổng do app tính; Traditional/Crypto có 3 cột món · số lượng · giá trị; cirBTC đọc từ ví. Edit cash flow: thu, chi, nợ. Edit information: tuổi, người phụ thuộc, thu nhập đều, người kiếm tiền duy nhất. Chạy bằng code, có bước Confirm.
- Không có form khai báo; agent hỏi chuyện tự nhiên. **Mọi thay đổi tài sản đều qua thẻ xác nhận**, kể cả lần khai đầu.
- Mua thêm là cộng ("bought $30 of gold" khi đã có $10 → $40); chỉ "now I have / in total" mới thay số.
- Người dùng kể thay đổi không nói số → không ghi, hỏi đúng 1 câu. Số khai đã cũ → hỏi lại món cũ nhất, mỗi lần 1 món.
- Chỉ ghi điều người dùng khẳng định về chính mình; ví dụ giả định, tiền của người khác, khoản đã lỗ thì không ghi.
- Mỗi người dùng 1 bản ghi riêng trong Cloudflare KV, trình duyệt giữ bản sao.

## 6. Invest

- **Nút mua cirBTC: giữ (Hiếu 2026-11-07).** Khoá tới khi quỹ đầy và hết nợ lãi cao. App **không đề nghị số tiền**, thẻ mua để trống. Nút là công tắc cấu hình, bật/tắt được, tắt theo khu vực được. Có mở cho người dùng VN hay không: chờ luật sư.
- Tương lai chắc chắn có cổ phiếu và vàng token hoá trên Arc: Màn Invest và dữ liệu thiết kế thành **danh sách tài sản onchain**, mỗi món gắn nhóm Traditional hoặc Crypto, thêm loại mới không phải viết lại.
- Tài sản có 2 mức tin cậy: **đã kiểm onchain** và **tự khai**. Hiển thị rõ món nào là món nào.

## 7. Vault V2 (Hiếu chốt 2026-11-07, thay hoàn toàn mục "Bảo mật" của V1)

- Đăng nhập bằng ví web3. Trong tab Vault có 2 nút: **Open vault** / **Import vault**.
- **Mở vault:** phí 1 USDC. App tạo **mật khẩu vault** ngẫu nhiên ngay trong trình duyệt, hiện đúng một lần, người dùng chép ra giấy. MoonSafe **không lưu, không cấp lại**. Không cho người dùng tự đặt mật khẩu (vault công khai trên chuỗi, mật khẩu tự nghĩ dò được).
- **Rút tiền = ví ký + nhập mật khẩu vault.** Thiếu một trong hai không rút được. Tiền gửi tới **bất kỳ địa chỉ** nào (Hiếu 2026-11-07).
- **Yêu cầu cho hợp đồng:** dùng mật khẩu không được làm lộ mật khẩu lên chuỗi (nếu lộ thì chỉ dùng được một lần). Cách làm do Claude Code đề xuất, người kiểm toán duyệt.
- **Mất ví:** đăng nhập bằng ví khác → Import vault → nhập địa chỉ vault + mật khẩu → ví mới thành chủ, **vào ngay, không chờ**.
- **Mất mật khẩu = mất quyền rút, kể cả còn ví.** Phải nói rõ lúc mở vault.
- MoonSafe **không giữ khoá nào, không ký gì**. MoonSafe sập vẫn rút bình thường.
- **BỎ** so với bản chốt 2026-11-06: vault 2-of-2 ví + email, khoá guardian, OTP qua Resend, link xác nhận qua mail, đường chờ 7 ngày khi MoonSafe sập, địa chỉ cứu hộ, đổi chủ do guardian khởi động.
- **Rủi ro đã biết, ghi cho kiểm toán:** vì vào ngay bằng mật khẩu, ai cầm tờ giấy kèm địa chỉ vault thì lấy được vault. Tờ giấy là chìa của cả két; nhắc người dùng lúc mở vault.
- Vault V1 (`VaultProxy`) không nâng cấp được; người dùng tự chuyển tiền sang vault mới.

## 8. Phí (Hiếu 2026-11-07)

- Mở vault 1 USDC; AI power 1 USDC cho 100 tin nhắn. Mỗi khoản là công tắc cấu hình, bật/tắt được.
- Nhận USDC từ người dùng VN và sàng lọc địa chỉ bị trừng phạt: chờ luật sư.

## 9. Pháp lý (rà soát ban đầu do AI làm, CHƯA phải ý kiến luật sư)

- Trang Privacy + Terms; bước đồng ý chủ động (ô không tích sẵn) trước lần chat đầu, theo từng mục đích (lưu hồ sơ; gửi tin nhắn tới OpenAI/Anthropic); lưu thời điểm đồng ý; xoá dữ liệu phải xoá hẳn trên server.
- Liệt kê bên xử lý ở nước ngoài: Cloudflare, Privy, OpenAI, Anthropic, Telegram (Telegram chỉ báo "có yêu cầu mới", không chuyển nội dung tài chính). Resend chỉ còn nếu còn gửi email.
- Terms về khoá viết lại cho V2: người dùng giữ ví và mật khẩu, MoonSafe không giữ khoá; mất mật khẩu thì sao; phí; 18+; khu vực phục vụ.
- Câu agent "MoonSafe không bao giờ giữ khoá hay di chuyển được tiền" chỉ giữ nếu kiểm toán xác nhận đúng với hợp đồng V2.

## 10. Môi trường và thứ tự

- V2: link riêng, **private test trên mainnet** (tiền thật). Pages, KV, D1 riêng; contract mainnet. Sửa mục 4 phạm vi đợt đầu cũ: bỏ "contract testnet" và "khoá guardian riêng".
- Phạm vi đợt đầu: (1) agent giáo dục; (2) Privacy + Terms + bước đồng ý dữ liệu; (3) Vault V2 + Import vault; (4) môi trường V2 riêng.
- **Thứ tự (đề xuất, Hiếu chưa xác nhận):** chốt và làm trước: hợp đồng vault + hỏi luật sư. Song song: agent giáo dục, Privacy/Terms/đồng ý, môi trường V2, màn tỷ lệ. Để sau: tách nội dung theo khu vực, cách xếp bất động sản / bảo hiểm / cho vay / vốn doanh nghiệp / NFT.

## Chưa chốt

- **Luật sư:** nhận phí USDC từ người dùng VN; sàng lọc địa chỉ bị trừng phạt; nút mua cirBTC cho người dùng VN; có tách nội dung theo khu vực không (VN chỉ còn giáo dục + quỹ USDC); dòng "to go" của thanh Crypto; việc đổi chủ vault bằng mật khẩu.
- **Kiểm toán:** việc vào ngay bằng mật khẩu (ai cầm giấy là cầm vault); cách dùng mật khẩu mà không lộ lên chuỗi.
- **Đăng nhập:** còn đăng nhập email / Google qua Privy không (luồng mới chỉ nói đăng nhập bằng ví); nếu còn thì có "xuất khoá" không; nội dung nút "!" trên màn đăng nhập (nút cũ "Mất 1 trong 2?" không còn đúng).
- **Tỷ lệ:** chưa chọn tỷ lệ Traditional/Crypto thì có tạm 50/50 không; Safety do app tính theo tuổi, người dùng có sửa được không (đang hiểu: không).
- **Chữ:** "Giá giảm không phải lý do để giục mua thêm" giữ hay đổi thành câu trung tính hơn.
- **Giới hạn người dùng** của private test (danh sách mời hay mở).
- Cách xếp bất động sản cho thuê, bảo hiểm tích luỹ, tiền cho vay, vốn doanh nghiệp, NFT.
