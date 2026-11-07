# MoonSafe — CORE V2

> Nguồn chuẩn cho V2 (Claude, Codex, người). V1 ở moonsafe.app giữ nguyên, chạy theo `docs/archive/CORE-v1-2026-11-06.md`.
> Hiếu chốt 2026-11-07. Mâu thuẫn giữa file này và spec cũ trong `docs/` → file này đúng. Đổi core = Hiếu chốt trước, rồi sửa file này.

## Core (Hiếu chốt 2026-11-07)

Người dùng Web3 hiếm khi được ai chỉ về tài chính cá nhân. Họ thường dồn hết tiền vào một lần đầu tư, nên kết quả hoặc là "hero" hoặc là "zero". MoonSafe tồn tại để thay đổi điều đó: dạy họ quản lý tiền trước khi đầu tư. Trước hết là có quỹ dự phòng, khoá trong vault USDC của chính họ trên Arc để khỏi tiêu bậy. Sau đó mới chia tiền theo những quy tắc phổ biến, áp vào đúng số liệu của họ. MoonSafe chỉ giải thích, không giữ tiền và không bảo ai mua hay bán gì. Người dùng tự quyết, nhưng quyết khi đã hiểu.

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
- **Tiền tệ mặc định theo ngôn ngữ của người dùng** (người Việt → VND) (Hiếu 2026-11-07). App quốc tế, không giới hạn nước.

## 2. Quỹ dự phòng nằm onchain

- **Vì sao onchain:** tạo kỷ luật (tiền nằm trong vault thì khó tiêu bậy) và agent kiểm được. Lời khai ("tôi có quỹ ở ngân hàng") không bao giờ được tính.
- **Kỷ luật là điều kiện để app dạy tiếp, không phải khoá cứng (Hiếu 2026-11-07):** nhiều người ậm ờ không làm quỹ rồi gặp chuyện; "có quỹ dự phòng thì tôi mới dạy tiếp" là trách nhiệm của app. Muốn rút là rút ngay, không chờ: tiêu khi gặp bất trắc chính là ý nghĩa của quỹ.
- **Quỹ KHÔNG ĐƯỢC SINH LÃI** (Hiếu 2026-11-07).
- Mức quỹ = (chi tiêu + trả nợ hằng tháng) × số tháng: 3 (thu nhập đều, không ai phụ thuộc), 6, 9 hoặc 12 (thu nhập không đều và/hoặc có người phụ thuộc). Thiếu thông tin thì hỏi đúng 1 câu.
- Quỹ chưa đầy: không bàn đầu tư, mọi câu "phần nào trước" quay về quỹ. Nút mua cirBTC khoá tới khi quỹ đầy và hết nợ lãi cao.
- Nợ lãi cao (từ 10%/năm) trả trước: quỹ khởi đầu 1 tháng → trả nợ → hoàn tất quỹ → đầu tư. Người đang nợ nặng / đã lỗ: app làm tròn trách nhiệm, giúp họ tìm đường thoát nợ.
- Nợ lãi thấp (mua nhà, làm ăn) hoàn toàn ổn, nhưng agent phải nói rõ vay bao nhiêu thì vừa sức trả (Hiếu 2026-11-07).

## 3. Bốn ô dữ liệu

| Ô | Gồm | Ghi chú |
|---|---|---|
| **Dự phòng** | USDC trong vault | Đọc onchain, không lưu trong hồ sơ |
| **Safety** | Tiền gửi có kỳ hạn, trái phiếu / quỹ trái phiếu / quỹ thị trường tiền tệ; tiền mặt, ngân hàng hoặc stablecoin **mà người dùng chọn làm Safety** | Safety ≠ quỹ dự phòng: Safety là **đầu tư vào chỗ an toàn** (vd gửi tiết kiệm ngân hàng uy tín để ăn lãi), không rút ngay được; quỹ dự phòng rút ngay |
| **Traditional** | Cổ phiếu / quỹ chỉ số, vàng, trái phiếu lãi cao | |
| **Crypto** | BTC và mọi coin khác, một thanh duy nhất | **Bỏ** hướng dẫn 7/3, bỏ "ưu tiên top 10". Agent không tự nêu tên coin; khi được hỏi thì giải thích theo mục 1 |

- Tiền bank / stablecoin KHÔNG BAO GIỜ mặc định là Safety: chỉ đúng khoản người dùng tự nói là Safety (Hiếu 2026-11-01).
- Không theo dõi tiền nhàn rỗi (Hiếu 2026-11-01). Ngoại lệ (Hiếu 2026-11-03): người dùng tự kể trong chat và quỹ chưa đầy thì nói một câu rằng tiền đó có thể nạp quỹ trước, không nêu số, không ghi.
- Safety chỉ được chọn dạng ít biến động; vàng, cổ phiếu, coin làm Safety thì agent giải thích vì sao không nên và không ghi.
- Nhà ở, xe, bất động sản cho thuê, vốn doanh nghiệp, tiền cho vay nằm ngoài 3 phần (chưa chốt cách xếp).

## 4. Bảng cân đối: phần đi xa nhất làm mốc

- **Tỷ lệ (Hiếu 2026-11-07):** có tuổi thì app tự tính Safety = tuổi %; người dùng **không sửa** con số này. App tự tăng 1 tuổi mỗi năm kể từ ngày khai (không bắt khai lại). Người dùng tự chọn cách chia phần còn lại giữa Traditional và Crypto; **chưa chọn thì 2 thanh này chưa hiện**, agent hỏi đúng 1 câu (không có mặc định 50/50). **Crypto tối đa 50% phần còn lại**: người dùng tự chọn nhưng app không cho quá 50%, kèm giải thích: crypto biến động mạnh, thuộc nhóm đầu tư mạo hiểm. Lý do là 50% chứ không thấp hơn: người dùng Web3 có tư duy Web3, bắt "chỉ 10% thôi" là kỳ cục; app giúp họ, không hãm tài họ.
- Công thức theo tuổi gọi là "quy tắc phổ biến app dùng để minh hoạ", không phải lời khuyên. Màn hình hiện tỷ lệ của người dùng.
- **Luật mốc (Hiếu 2026-11-01):** phần đi xa nhất so với tỷ lệ của nó (tiền / tỷ lệ lớn nhất) là thanh đầy 100%; các phần khác theo nó. Ví dụ 30 tuổi (30/35/35), Safety $3.000 đi xa nhất → Traditional và Crypto đầy ở $3.500.
- Không lấy tổng 3 phần làm 100%, không hiện % trên từng phần. Mỗi phần viết: còn thiếu trước, rồi hiện trạng: "$2,500 to go (now $1,000 / $3,500)"; phần đủ ghi "full", phần làm mốc ghi "furthest ahead, it sets the size". Số lẻ luôn đủ 2 chữ số.
- **Giữ "to go" cho mọi phần, kể cả Crypto (Hiếu 2026-11-07).**
- Không phần nào vượt thanh của nó nên **không bao giờ khuyên bán**. Agent không bình luận giá lên hay xuống (Hiếu 2026-11-07).
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

- **Nút mua cirBTC: giữ (Hiếu 2026-11-07).** Khoá tới khi quỹ đầy và hết nợ lãi cao. App **không đề nghị số tiền**, thẻ mua để trống. Nút là công tắc cấu hình, bật/tắt được, tắt theo khu vực được. Mở cho mọi nước như nhau.
- Tương lai chắc chắn có cổ phiếu và vàng token hoá trên Arc: Màn Invest và dữ liệu thiết kế thành **danh sách tài sản onchain**, mỗi món gắn nhóm Traditional hoặc Crypto, thêm loại mới không phải viết lại.
- Tài sản có 2 mức tin cậy: **đã kiểm onchain** và **tự khai**. Hiển thị rõ món nào là món nào.

## 7. Vault V2 (Hiếu chốt 2026-11-07, thay hoàn toàn mục "Bảo mật" của V1)

- Đăng nhập bằng ví web3 **hoặc email/Google** (Privy tạo ví hộ, **có nút xuất khoá**; Hiếu 2026-11-07). Trong tab Vault có 2 nút: **Open vault** / **Import vault**.
- **Nút "!" trên màn đăng nhập = trợ giúp chung** cho mọi vấn đề (Hiếu 2026-11-07): Contact support (email + Telegram, làm sau) · Lost your wallet? · Lost your vault password? · Terms & Privacy.
- **Mở vault:** phí 1 USDC. Có **2 lựa chọn bảo vệ** (Hiếu 2026-11-07):
  - **Passkey** (laptop, iPhone, Samsung/Android): người dùng bấm Face ID / vân tay; mật khẩu vault sinh ra từ passkey ngay trên máy (WebAuthn PRF), người dùng không cần thấy. Passkey tự sao lưu theo iCloud / Google. Kèm **tuỳ chọn "hiện mật khẩu dự phòng"** để chép ra giấy, phòng mất tài khoản iCloud/Google. Passkey bị khoá theo tên miền nên trang giả không dùng được: chống lừa đảo.
  - **Mật khẩu truyền thống** (PC không có passkey): app tạo mật khẩu ngẫu nhiên trong trình duyệt, hiện đúng một lần, người dùng chép ra giấy.
  - Hai cách cho ra cùng một loại khoá, hợp đồng không phân biệt. MoonSafe **không lưu, không cấp lại**. Không cho người dùng tự đặt mật khẩu (vault công khai trên chuỗi, mật khẩu tự nghĩ dò được).
  - Trước khi chốt code: thử thật WebAuthn PRF trên Safari/iPhone, Chrome/Android, Chrome/Windows, Firefox.
- **Rút tiền = ví ký + passkey (hoặc nhập mật khẩu vault).** Thiếu một trong hai không rút được. Tiền gửi tới **bất kỳ địa chỉ** nào (Hiếu 2026-11-07).
- **Yêu cầu cho hợp đồng:** dùng mật khẩu không được làm lộ mật khẩu lên chuỗi (nếu lộ thì chỉ dùng được một lần). Cách làm do Claude Code đề xuất, người kiểm toán duyệt.
- **Mất ví:** đăng nhập bằng ví khác → Import vault → passkey (hoặc nhập mật khẩu) → ví mới thành chủ, **vào ngay, không chờ**.
- **Mất cả passkey lẫn mật khẩu dự phòng = mất quyền rút, kể cả còn ví.** Phải nói rõ lúc mở vault.
- MoonSafe **không giữ khoá nào, không ký gì**. MoonSafe sập vẫn rút bình thường.
- **BỎ** so với bản chốt 2026-11-06: vault 2-of-2 ví + email, khoá guardian, OTP qua Resend, link xác nhận qua mail, đường chờ 7 ngày khi MoonSafe sập, địa chỉ cứu hộ, đổi chủ do guardian khởi động.
- **Rủi ro đã biết, ghi cho kiểm toán:** vì vào ngay bằng mật khẩu, ai cầm tờ giấy kèm địa chỉ vault thì lấy được vault. Tờ giấy là chìa của cả két; nhắc người dùng lúc mở vault.
- Người thân cầm tờ giấy thì lấy được quỹ khi người dùng mất: đây là tính năng, nhưng **không nói ra** trong app (Hiếu 2026-11-07).
- Kiểm toán hợp đồng bằng nhiều agent khác nhau (Hiếu 2026-11-07).
- **Không có đổi mật khẩu vault** (Hiếu 2026-11-07). Lộ tờ giấy thì rút hết sang vault mới.
- Vault V1 (`VaultProxy`) không nâng cấp được; người dùng tự chuyển tiền sang vault mới.

## 8. Phí (Hiếu 2026-11-07)

- Mở vault 1 USDC; AI power 1 USDC cho 100 tin nhắn. Mỗi khoản là công tắc cấu hình, bật/tắt được. AI power là chỗ app có lãi.
- Thu phí như nhau với mọi nước.

## 9. Pháp lý (rà soát do AI làm; Hiếu 2026-11-07: không chờ luật sư)

- Trang Privacy + Terms; bước đồng ý chủ động (ô không tích sẵn) trước lần chat đầu, theo từng mục đích (lưu hồ sơ; gửi tin nhắn tới OpenAI/Anthropic); lưu thời điểm đồng ý; xoá dữ liệu phải xoá hẳn trên server.
- Liệt kê bên xử lý ở nước ngoài: Cloudflare, Privy, OpenAI, Anthropic, Telegram (Telegram chỉ báo "có yêu cầu mới", không chuyển nội dung tài chính). Resend chỉ còn nếu còn gửi email.
- Terms về khoá viết lại cho V2: người dùng giữ ví và mật khẩu, MoonSafe không giữ khoá; mất mật khẩu thì sao; phí; 18+; khu vực phục vụ.
- **Dữ liệu tài chính (Hiếu 2026-11-07), làm cả 3:** (1) mã hoá hồ sơ khi lưu trên server; (2) không gửi danh tính cho AI (chỉ gửi số, không email, không địa chỉ ví); (3) xoá là xoá hẳn. Trang Privacy nói rõ: AI đọc được số liệu để tư vấn.
- Câu agent "MoonSafe không bao giờ giữ khoá hay di chuyển được tiền" chỉ giữ nếu kiểm toán xác nhận đúng với hợp đồng V2.

## 10. Môi trường và thứ tự

- V2: link riêng, **test trên mainnet** (tiền thật), **mở cho mọi người có link nhưng không công khai website** (không quảng bá, không đưa lên moonsafe.app) (Hiếu 2026-11-07). Pages, KV, D1 riêng; contract mainnet. Sửa mục 4 phạm vi đợt đầu cũ: bỏ "contract testnet" và "khoá guardian riêng".
- Phạm vi đợt đầu: (1) agent giáo dục; (2) Privacy + Terms + bước đồng ý dữ liệu; (3) Vault V2 + Import vault; (4) môi trường V2 riêng.
- **Thứ tự (Hiếu 2026-11-07: thứ tự nào cũng được):** làm trước: hợp đồng vault + thử passkey. Song song: agent giáo dục, Privacy/Terms/đồng ý, môi trường V2, màn tỷ lệ. Để sau: cách xếp bất động sản / bảo hiểm / cho vay / vốn doanh nghiệp / NFT.

## Chưa chốt

- Cách xếp bất động sản cho thuê, bảo hiểm tích luỹ, tiền cho vay, vốn doanh nghiệp, NFT (để sau).
- Đã bỏ (Hiếu 2026-11-07): mọi câu chờ luật sư; tách nội dung theo khu vực. Kiểm toán hợp đồng đã xong (Arc Studio 0 lỗi nặng, `docs/audit-vault-v2-arc-studio-2026-11-07.md`).
