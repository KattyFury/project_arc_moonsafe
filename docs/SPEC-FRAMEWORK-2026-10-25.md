# MoonSafe: Spec chốt (framework phân bổ, dòng tiền, tool của agent)

> Ngày chốt: 2026-10-25. File này thay thế file câu hỏi `MoonSafe-spec-framework-2026-10-25.md`.
> Claude Code build đúng theo file này, không tự đoán. Chỗ nào thiếu hoặc mâu thuẫn thì hỏi lại Hiếu, không tự ngoại suy.
>
> **Sửa đổi 2026-10-27 (framework v2 bản gọn, Hiếu duyệt), đè lên các mục bên dưới:**
> 1. Mục 4: còn **3 nhóm**: An toàn (Safety) = tuổi %, Truyền thống = r × 4/7, **Crypto = r × 3/7 là một khối**, nói bằng lời "phần lớn là BTC". Bỏ mục tiêu Coin lớn / Altcoin (= 0); coin đang có vẫn được ghi và tính vào Crypto, không thành gợi ý mua. Hiển thị % làm tròn số nguyên, tổng 100.
> 2. Quỹ dự phòng chưa đủ → kế hoạch chỉ nói quỹ + để dành; tỉ lệ 3 nhóm chỉ nêu %, không chia tiền.
> 3. Thêm câu hỏi: khoản lớn cần trong 5 năm (giữ ở An toàn, không đầu tư); "crypto giảm một nửa có giữ được không" (không → agent chỉ GỢI Ý giảm crypto, user quyết); bảo hiểm (chỉ khi có người phụ thuộc / trụ cột).
> 4. Sau khi quỹ đủ: user lấp từng nhóm một, nhóm nào trước do user chọn; không chia nhỏ mọi đồng.
> 5. Bỏ (người mới không cần): giảng rủi ro DeFi/depeg/oracle/bridge, chỉ số tỉ lệ tiết kiệm, rà soát 30 ngày, tách chi tiêu thiết yếu, nêu "giả định / độ bất định".
> Đánh giá gốc: Desktop của Hiếu, `MoonSafe-danh-gia-framework-2026-10-27.md` và `MoonSafe-FRAMEWORK-v2-SPEC.md`.

---

## 0. Nguyên tắc nền

1. MoonSafe là app quản lý tài chính cá nhân onchain cho dân Web3. Đây không phải app đầu tư truyền thống. Khung phân bổ theo tư duy Web3 (BTC nặng, giữ dài hạn). Agent không bao giờ nói "theo chuẩn thế giới" hay so với Fidelity/Vanguard. Agent chỉ nói "theo khung MoonSafe".
2. Người dùng toàn quyền với tiền của họ. App ghi nhận và đưa lựa chọn, không ra lệnh. Có đúng một ngoại lệ: app chặn lệnh mua cirBTC trong app khi thiếu đệm an toàn (mục 5). Mọi thứ khác không chặn.
3. Lời khai của người dùng là sự thật. Khi không lấy được giá thị trường thì agent hỏi người dùng và chấp nhận con số họ nói, gắn nhãn "tự khai".
4. Agent không tự chuyển tiền. Nó chỉ tạo thẻ lệnh, người dùng tự ký trong ví.
5. Không có form hay thẻ khai báo. Mọi thứ khai qua chat.
6. App nắm tình hình người dùng rồi tư vấn dựa trên một kho tình huống (mục 9), không dựa vào một công thức duy nhất.

---

## 1. Hạng mục (6 hạng mục)

| Hạng mục | Định nghĩa 1 câu | Vào cơ sở tính % |
|---|---|---|
| Quỹ dự phòng | USDC trong vault MoonSafe, đệm để sống qua lúc mất thu nhập | Không, đứng riêng |
| An toàn | Tiền ít biến động, rút được hoặc gần như rút được: tiết kiệm, gửi linh hoạt, stablecoin sinh lãi, bảo hiểm tích luỹ | Có |
| Đầu tư | Tài sản kỳ vọng tăng giá: Truyền thống (cổ phiếu, vàng, quỹ), BTC, Coin lớn, Altcoin, cộng các món "không cân lại được" (bất động sản cho thuê, vốn góp, tiền cho vay) | Có, trừ các món "không cân lại được" |
| Nhàn rỗi | Tiền mặt, tài khoản thanh toán, stablecoin trong ví chưa được phân bổ vào đâu | Có, là phần còn phải chia |
| Tài sản tiêu dùng | Nhà đang ở, xe: dùng để sống, không phải để cân lại tỉ lệ | Không |
| Nợ | Từng khoản nợ, trừ vào tài sản ròng | Không |

Mỗi món tài sản có thêm trường `rebalanceable` (cân lại được hay không). Món `rebalanceable = false` vẫn nằm trong hạng mục của nó và tính vào tài sản ròng, nhưng không vào cơ sở tính mục tiêu %. Trên biểu đồ nó hiện thành một lát xám.

Nhóm con của Đầu tư: Truyền thống, BTC, Coin lớn (ETH, SOL, BNB và coin top 10, kể cả đang stake), Altcoin (altcoin nhỏ, memecoin, NFT), Bất động sản, Kinh doanh (vốn góp), Cho vay.

---

## 2. Tổng tài sản

App luôn hiện hai con số.

- **Tài sản thanh khoản** là cơ sở tính %. Gồm An toàn, Đầu tư (chỉ món cân lại được) và Nhàn rỗi. Không gồm Quỹ dự phòng, Tài sản tiêu dùng và các món không cân lại được.
- **Tài sản ròng** là tất cả tài sản (kể cả quỹ dự phòng, tài sản tiêu dùng, món không cân lại được) trừ tổng nợ.

Nợ chỉ trừ ở tầng tài sản ròng. Không trừ vào từng tài sản, không vào biểu đồ %. Ngôi nhà vẫn hiện đúng giá trị, khoản vay mua nhà hiện riêng ở mục Nợ.

---

## 3. Bảng phân loại tài sản

| # | Loại tài sản | Hạng mục / nhóm con | Vào tài sản ròng | Vào cơ sở % | Định giá |
|---|---|---|---|---|---|
| 1 | Tiền mặt | Nhàn rỗi | Có | Có | Tự khai |
| 2 | Tài khoản thanh toán ngân hàng | Nhàn rỗi | Có | Có | Tự khai |
| 3 | Tiết kiệm có kỳ hạn | An toàn | Có | Có | Tự khai |
| 4 | Tiết kiệm không kỳ hạn | An toàn | Có | Có | Tự khai |
| 5 | USDC/USDT trong ví (không sinh lãi) | Nhàn rỗi | Có | Có | Tự động ($1) |
| 6 | Gửi linh hoạt trên sàn (Binance Simple Earn Flexible...) | An toàn | Có | Có | Tự động ($1) |
| 7 | Gửi cố định / locked trên sàn | An toàn | Có | Có | Tự khai |
| 8 | Stablecoin cho vay DeFi, vault sinh lãi | An toàn (agent nhắc rủi ro contract) | Có | Có | Tự động nếu có giá, không thì tự khai |
| 9 | Quỹ dự phòng MoonSafe | Quỹ dự phòng | Có | Không | Đọc onchain |
| 10 | Vàng vật chất | Đầu tư / Truyền thống | Có | Có | Số lượng × giá vàng |
| 11 | Vàng token hoá (PAXG, XAUT) | Đầu tư / Truyền thống | Có | Có | Tự động |
| 12 | Cổ phiếu Mỹ / ETF | Đầu tư / Truyền thống | Có | Có | Tự động |
| 13 | Cổ phiếu Việt Nam | Đầu tư / Truyền thống | Có | Có | Tự khai |
| 14 | Chứng chỉ quỹ, trái phiếu | Đầu tư / Truyền thống | Có | Có | Tự khai |
| 15 | BTC (sàn / ví lạnh) | Đầu tư / BTC | Có | Có | Tự động |
| 16 | cirBTC trong ví app | Đầu tư / BTC | Có | Có | Tự động |
| 17 | ETH | Đầu tư / Coin lớn | Có | Có | Tự động |
| 18 | BNB, SOL, các coin top 10 | Đầu tư / Coin lớn | Có | Có | Tự động |
| 19 | Altcoin nhỏ, memecoin | Đầu tư / Altcoin | Có | Có | Tự động nếu có giá, không thì tự khai |
| 20 | ETH/SOL đang stake | Đầu tư / Coin lớn | Có | Có | Theo giá coin gốc |
| 21 | NFT | Đầu tư / Altcoin | Có | Có | Tự khai |
| 22 | Nhà đang ở | Tài sản tiêu dùng | Có | Không | Tự khai |
| 23 | Nhà / đất đầu tư, cho thuê | Đầu tư / Bất động sản | Có | Không (lát xám) | Tự khai |
| 24 | Xe | Tài sản tiêu dùng | Có | Không | Tự khai |
| 25 | Vốn góp kinh doanh | Đầu tư / Kinh doanh | Có | Không (lát xám) | Tự khai |
| 26 | Tiền cho người khác vay | Đầu tư / Cho vay (gắn nhãn đúng hạn / quá hạn) | Có | Không (lát xám) | Tự khai |
| 27 | Bảo hiểm nhân thọ tích luỹ, quỹ hưu tự nguyện | An toàn | Có | Không (lát xám) | Tự khai theo giá trị hoàn lại hiện tại, không theo tổng phí đã đóng |
| 28 | Khác | Agent tự phân loại theo bản chất, hỏi lại 1 câu nếu không chắc | Có | Theo phân loại | Tự khai |

BHXH nhà nước không tính vì không rút được theo ý và không có giá trị xác định.

---

## 4. Phân bổ theo tuổi (khung MoonSafe, tư duy Web3)

Công thức duy nhất, liên tục theo tuổi, không có bậc:

- An toàn = tuổi %
- Phần còn lại r = 100 − tuổi, chia cố định: Truyền thống = r × 4/7, Crypto = r × 3/7
- Crypto chia cố định: BTC = 2/3, Coin lớn = 1/6, Altcoin = 1/6 (tức BTC = r × 2/7, Coin lớn = Altcoin = r / 14)

Mốc 30 tuổi (do Hiếu chốt): An toàn 30, Truyền thống 40, BTC 20, Coin lớn 5, Altcoin 5.

| Tuổi | An toàn | Truyền thống | BTC | Coin lớn | Altcoin |
|---|---|---|---|---|---|
| 18 | 18 | 46.9 | 23.4 | 5.9 | 5.9 |
| 20 | 20 | 45.7 | 22.9 | 5.7 | 5.7 |
| 25 | 25 | 42.9 | 21.4 | 5.4 | 5.4 |
| 30 | 30 | 40.0 | 20.0 | 5.0 | 5.0 |
| 35 | 35 | 37.1 | 18.6 | 4.6 | 4.6 |
| 40 | 40 | 34.3 | 17.1 | 4.3 | 4.3 |
| 45 | 45 | 31.4 | 15.7 | 3.9 | 3.9 |
| 50 | 50 | 28.6 | 14.3 | 3.6 | 3.6 |
| 55 | 55 | 25.7 | 12.9 | 3.2 | 3.2 |
| 60 | 60 | 22.9 | 11.4 | 2.9 | 2.9 |
| 65 | 65 | 20.0 | 10.0 | 2.5 | 2.5 |
| 70 | 70 | 17.1 | 8.6 | 2.1 | 2.1 |

Bảng chỉ để tham khảo và đối chiếu. Code tính trực tiếp bằng công thức, không tra bảng. Tổng các hàng có thể lệch 0.1 do làm tròn.

- BTC không bao giờ về 0 ở mọi tuổi. Đây là chủ ý: Bitcoin to the moon, giữ cố định, không "về hưu".
- Ngoài tuổi, không yếu tố nào đổi tỉ lệ này. Thu nhập không ổn định, có người phụ thuộc, khẩu vị rủi ro, có nợ: chỉ ảnh hưởng quỹ dự phòng, khoá mua và lời tư vấn (mục 5 và 9), không đổi tỉ lệ.
- Tuổi hợp lệ từ 18 đến 100. Nếu chưa biết tuổi, agent hỏi tuổi trước khi nói về tỉ lệ. Nếu người dùng từ chối, dùng mốc 30 tuổi và nói rõ đó là mặc định.

---

## 5. Quỹ dự phòng, nợ, khoá mua cirBTC, thứ tự ưu tiên

### 5.1 Mốc quỹ dự phòng (tính theo số tháng chi tiêu)

| Tình huống người dùng | Mốc |
|---|---|
| Thu nhập ổn định, không có người phụ thuộc | 3 tháng |
| Thu nhập ổn định nhưng có người phụ thuộc, hoặc thu nhập không ổn định và không có người phụ thuộc | 6 tháng |
| Thu nhập không ổn định và có người phụ thuộc | 9 tháng |
| Như dòng trên và là người trụ cột duy nhất trong nhà | 12 tháng |

"Chi tiêu" để tính mốc gồm chi cố định, chi biến đổi thiết yếu và số tiền trả nợ mỗi tháng (nợ có lãi theo kỳ phải trả, nợ không lãi theo số người dùng khai là thực trả). Cần thêm trường hồ sơ: `dependents` (số người phụ thuộc) và `sole_earner` (có/không).

### 5.2 Nợ: lưu từng khoản

Mỗi khoản nợ có: tên, loại, người cho vay (nếu là người thân), số còn nợ, lãi suất (0 = không lãi), kỳ hạn (ngắn / dài), số trả mỗi tháng, bắt buộc hay linh hoạt.

| Loại nợ | Nhóm | Chặn mua cirBTC |
|---|---|---|
| Thẻ tín dụng | Ưu tiên trả | Có |
| Vay tiêu dùng, tín chấp | Ưu tiên trả | Có |
| Vay nóng | Ưu tiên trả | Có |
| Margin crypto, vay thế chấp crypto (agent cảnh báo ngưỡng thanh lý) | Ưu tiên trả | Có |
| Vay mua nhà, vay mua xe, vay kinh doanh có kế hoạch trả | Thường | Không, trừ khi lãi ≥ ngưỡng |
| Nợ người thân hoặc bạn bè, không lãi | Linh hoạt | Không bao giờ |
| Nợ người thân hoặc bạn bè, có lãi | Theo lãi suất | Theo ngưỡng |

Quy tắc chung: nợ có lãi suất ≥ ngưỡng ưu tiên (mặc định 10%/năm, chỉnh được) luôn là nợ ưu tiên bất kể loại. Nợ lãi bằng 0 không bao giờ chặn.

### 5.3 Khoá mua cirBTC (chặn thật, không chỉ cảnh báo)

Mở khoá khi cả hai điều kiện đều đúng:
1. Không còn nợ ưu tiên.
2. Quỹ dự phòng đạt mốc ở 5.1.

Khi bị chặn, agent không tạo thẻ mua cirBTC và nói đúng một câu: còn thiếu gì, thiếu bao nhiêu để mở. Không giảng đạo. Chỉ lệnh mua cirBTC trong app bị chặn. Người dùng vẫn tự mua tài sản khác ngoài app.

### 5.4 Thứ tự ưu tiên khi tiền có hạn (agent gợi ý, không ép)

1. Quỹ khởi điểm nhỏ (mặc định 1 tháng chi tiêu thiết yếu).
2. Trả nợ ưu tiên.
3. Hoàn thiện quỹ dự phòng đến mốc 5.1.
4. Phân bổ vào An toàn và Đầu tư theo tỉ lệ mục 4.

Tiền nhàn rỗi luôn chừa lại 1 tháng chi tiêu để tiêu hàng ngày trước khi gợi ý chia. Khi tiền nhàn rỗi không đủ lấp mọi phần đang thiếu, lấp phần An toàn trước.

---

## 6. Dòng tiền và tự do tài chính

App phải ghi nhận dòng vào và dòng ra (trước đây chỉ có hai con số tổng).

- **Dòng vào:** mỗi nguồn có tên, số trung bình mỗi tháng, loại. Loại gồm chủ động (lương, làm thêm, nội dung), thụ động (lãi gửi, staking, tiền thuê, cổ tức, lãi cho vay) và không đều (airdrop, trade, thưởng). Airdrop và trade không xếp vào thụ động vì phải làm việc và không đảm bảo.
- **Dòng ra:** chia cố định và biến đổi. Trả nợ nằm trong cố định.
- **Dòng dư** = tổng vào − tổng ra mỗi tháng.
- **Tự do tài chính:** thu nhập thụ động mỗi tháng ≥ chi tiêu mỗi tháng. Màn Balance hiện "Thụ động / Chi tiêu = X%". Đạt 100% là tự do tài chính.
- Giai đoạn này lưu số trung bình mỗi tháng. Ghi từng tháng để giai đoạn sau.

---

## 7. Lệch mục tiêu, mua bán, DCA

- **Lệch mục tiêu:** agent chỉ báo lệch và gợi ý dùng tiền mới để bù phần thiếu. Agent không bao giờ gợi ý bán.
- **Mua cirBTC nhiều hơn gợi ý:** khi đã qua khoá, tạo lệnh luôn và nhắc lệch mục tiêu một câu.
- **DCA:** agent chủ động đề xuất khi có dòng dư dương và đã qua khoá mua. Mức đề xuất mặc định 50% dòng dư mỗi tháng, người dùng tự chỉnh.
- **Nêu tên tài sản:** được nêu như ví dụ minh hoạ theo nhóm, không kèm "nên mua". Truyền thống: ETF chỉ số như VOO, vàng, PAXG, XAUT. BTC: cirBTC. Coin lớn: ETH, SOL, BNB. Không nêu tên altcoin nhỏ hay memecoin cụ thể.
- **Altcoin / memecoin / all-in:** agent nêu rủi ro một lần, rồi tôn trọng quyết định. Không nhắc lại.

---

## 8. Giọng tư vấn và bảng warning

### 8.1 Giọng

Tiếng Việt, xưng "mình", gọi "bạn". Không gọi "boss". Câu ngắn, thẳng, dễ hiểu. Nói sự thật và con số, không phán xét người dùng. Agent trả lời theo ngôn ngữ người dùng đang dùng.

### 8.2 Được nói / cấm nói

Được nói:
- "Theo khung MoonSafe, ở 30 tuổi thường để BTC khoảng 20%."
- "Danh mục đang lệch: crypto 60% so với 30% theo khung MoonSafe."
- "Bạn còn thiếu 800$ ở quỹ dự phòng để mở mua cirBTC."

Cấm nói:
- "Bạn nên mua BTC ngay."
- "Theo chuẩn thế giới" / "theo chuyên gia" / so với Fidelity, Vanguard.
- Khuyên đòn bẩy, khuyên all-in altcoin, dự đoán giá, hứa lợi nhuận.
- Câu phán xét người dùng ("bạn sai rồi", "lẽ ra bạn phải...").

### 8.3 Tư duy Web3 agent thể hiện

BTC là tài sản dự trữ dài hạn. Không canh đáy canh đỉnh. Mua đều đặn. Có quỹ dự phòng trước. Không đòn bẩy. Không all-in altcoin.

### 8.4 Disclaimer

Đặt ở màn "Before you start" và trên thẻ lệnh. Không nhắc lặp trong chat. Nội dung màn "Before you start" gồm 3 ý:
1. MoonSafe là app quản lý tài chính cá nhân cho dân Web3, không phải app đầu tư truyền thống.
2. Khung phân bổ nặng BTC hơn hẳn chuẩn của các quỹ truyền thống, theo tư duy Web3.
3. BTC thường có những đợt giảm khoảng một nửa. Ở 30 tuổi, nếu cả phần crypto (30%) giảm một nửa thì danh mục mất khoảng 15%.

---

## 9. Kho tình huống tư vấn (hạng mục build riêng)

**Ghi chú build: xây một database bao hàm nhiều trường hợp để app tư vấn đúng người, đúng trường hợp.**

Mỗi tình huống là một bản ghi dữ liệu (không viết cứng trong code, thêm tình huống không cần sửa code) gồm: `id`, tên, điều kiện nhận ra (đọc từ dữ liệu người dùng đã khai), việc agent làm, câu được nói, câu cấm nói, tính năng bị chặn hoặc mở, độ ưu tiên. Một người dùng có thể khớp nhiều tình huống cùng lúc. Agent đọc các tình huống khớp trước khi trả lời.

Danh sách khởi đầu:

| Tình huống | Nhận ra khi | Agent làm | Chặn / mở |
|---|---|---|---|
| Nợ lãi cao (thẻ, vay nóng, tiêu dùng) | Có nợ thuộc nhóm ưu tiên | Nêu số lãi đang mất mỗi tháng, gợi ý ưu tiên trả | Chặn mua cirBTC |
| Margin / vay thế chấp crypto | Có loại nợ này | Cảnh báo ngưỡng thanh lý | Chặn mua cirBTC |
| Nợ người thân không lãi | Nợ lãi = 0, người cho vay là người thân | Ghi nhận không phán xét, không thúc trả, ghi kế hoạch trả linh hoạt (ví dụ trả góp 200$/tháng, tháng khó thì không trả). Chỉ tính số thực trả vào chi tiêu | Không chặn gì |
| Mất thu nhập / thất nghiệp | Thu nhập chủ động = 0 | Tính "quỹ sống được bao nhiêu tháng" | Chặn mua cirBTC cho đến khi quỹ đạt mốc |
| Thu nhập không đều | Cờ thu nhập không ổn định | Mốc quỹ lên 6 hoặc cao hơn theo mục 5.1 | Theo mốc quỹ |
| Có người phụ thuộc / trụ cột duy nhất | `dependents` > 0 hoặc `sole_earner` | Mốc quỹ 9 hoặc 12 tháng | Theo mốc quỹ |
| Giàu tài sản, nghèo tiền mặt | Tài sản ròng lớn nhưng quỹ trống | Nêu sự thật: quỹ dự phòng đang trống | Chặn mua nếu quỹ thiếu |
| All-in altcoin / memecoin | Altcoin chiếm tỉ lệ rất cao | Nêu rủi ro một lần, tôn trọng quyết định | Không chặn |
| Mới bắt đầu, ít tiền | Tài sản thanh khoản rất nhỏ | Chỉ lo quỹ khởi điểm, chưa nói tỉ lệ | Chặn mua nếu quỹ thiếu |
| Có khoản tiền lớn bất ngờ (airdrop, thưởng) | Dòng vào không đều tăng đột biến | Chỉ ra thứ tự ưu tiên của app, không bắt buộc | Theo khoá mua |
| Lỗ nặng, muốn gỡ | Người dùng nói muốn gỡ, vừa lỗ lớn | Nêu số liệu, không thúc, không gợi ý bán | Chặn mua nếu thiếu đệm |
| Đã tự do tài chính | Thụ động / chi tiêu ≥ 100% | Ghi nhận, chuyển sang nói về bảo toàn | Theo khoá mua |
| Người dùng khai thiếu rồi bổ sung sau | Dữ liệu đổi | Cập nhật im lặng, không nhắc lại lời khai cũ, không phán xét | Theo dữ liệu mới |

Quy tắc thu thập: agent không dừng ở các khoản nợ giấy tờ. Câu cuối của checklist nợ phải hỏi thẳng: "Bạn còn khoản nợ nào khác không, kể cả mượn người thân, không lãi, không giấy tờ?"

---

## 10. Tool của agent (thiết kế lại theo thao tác)

| Tool | Làm gì |
|---|---|
| `update_profile` | Tuổi, thu nhập ổn định hay không, số người phụ thuộc (`dependents`), trụ cột duy nhất (`sole_earner`) |
| `add_holding` | Thêm một món tài sản |
| `set_holding` | Sửa số lượng hoặc giá trị của món đã có |
| `remove_holding` | Xoá món (bán hết, tất toán) |
| `move` | Chuyển một khoản từ hạng mục / nơi giữ A sang B (ví dụ "đã bỏ 1.000$ từ ví vào tiết kiệm") |
| `add_debt`, `update_debt`, `remove_debt` | Quản lý từng khoản nợ với đủ trường ở 5.2 |
| `set_income`, `remove_income` | Quản lý từng nguồn thu (tên, trung bình tháng, loại) |
| `set_expense`, `remove_expense` | Quản lý từng khoản chi (tên, trung bình tháng, cố định hay biến đổi) |
| `show_allocation`, `show_cashflow` | Hiện biểu đồ phân bổ, dòng tiền trong chat |
| `prepare_deposit`, `prepare_withdraw` | Thẻ nạp, rút quỹ dự phòng |
| `prepare_buy_cirbtc`, `propose_dca`, `stop_dca` | Thẻ mua cirBTC, đề xuất, dừng DCA (`prepare_buy_cirbtc` và `propose_dca` bị khoá theo 5.3) |
| `open_screen`, `no_action` | Mở màn hình, không làm gì |

Trường mỗi món tài sản: `id`, hạng mục, nhóm con, tên, nơi giữ, số lượng, đơn vị, giá trị, tiền tệ, ngày cập nhật, nguồn giá (thị trường hoặc tự khai), `rebalanceable`.

**Luồng hỏi toàn bộ tài sản:** agent chủ động đi một vòng, mỗi tin chỉ 1 câu hỏi. Bắt đầu ở lần chat đầu (sau khi hỏi tuổi), hoặc khi người dùng hỏi "nên đầu tư gì" mà dữ liệu còn thiếu. Thứ tự: tuổi → thu nhập → chi tiêu → ổn định và người phụ thuộc → tiền ngân hàng → stablecoin trên sàn và ví → crypto → vàng và cổ phiếu → nhà đất, xe → cho vay, vốn góp → nợ (hỏi cuối, kèm câu hỏi nợ người thân ở mục 9).

**"Vừa bỏ X$ vào safe":** agent hỏi đúng 1 câu "lấy từ đâu?". Nếu từ tiền nhàn rỗi hoặc ví app thì dùng `move`. Nếu tiền từ ngoài vào thì dùng `add_holding`.

**Xác nhận sau khi ghi:** agent đọc lại một câu ngắn trong chat ("Mình ghi: tiết kiệm 1.500$, vàng 0,5 oz. Đúng chưa?"), không dùng form.

**Số liệu cũ:** món tự khai quá 30 ngày thì agent hỏi cập nhật. Thu nhập và chi tiêu hỏi lại sau 90 ngày. Món có giá thị trường tự cập nhật.

---

## 11. Màn Balance

Hiện theo thứ tự:
1. Tài sản ròng và tài sản thanh khoản.
2. Biểu đồ phân bổ: An toàn, Truyền thống, BTC, Coin lớn, Altcoin, Nhàn rỗi, so với mục tiêu. Thêm lát xám cho các món không cân lại được. Hiện hai tỉ lệ cạnh nhau: "% trong danh mục thanh khoản" (để so với mục tiêu) và "% trên tài sản ròng".
3. Quỹ dự phòng: số dư so với mốc (tháng và số tiền).
4. Dòng tiền: vào (chủ động / thụ động / không đều), ra, dư, và thanh "Thụ động / Chi tiêu = X%".
5. Nợ: từng khoản, tổng, tổng trả mỗi tháng.
6. Tài sản tiêu dùng và các món không cân lại được: danh sách.

---

## 12. Tình huống biên

- **Từ chối kể tài sản hoặc thu nhập:** agent tôn trọng, dùng mặc định 30 tuổi nếu thiếu tuổi, nói rõ biểu đồ chỉ là ước tính vì thiếu dữ liệu.
- **Kể giá trị thay vì số lượng:** tài sản có giá thị trường thì quy ra số lượng theo giá lúc kể. Tài sản tự khai thì lưu giá trị cố định.
- **Không lấy được giá thị trường:** agent hỏi người dùng giá trị, chấp nhận lời khai là sự thật, gắn "tự khai", hỏi cập nhật sau 30 ngày.
- **Người dùng nói VND, app hiển thị USD:** quy đổi theo tỉ giá sống, nhưng lưu số và đơn vị gốc để không lệch khi tỉ giá đổi.
- **Số liệu mâu thuẫn:** agent hỏi lại đúng 1 câu ("tổng là 5.000$ hay các món cộng lại 8.000$?"), rồi lấy theo danh sách từng món vì chi tiết hơn.

---

## 13. Tham số mặc định (đặt trong một file cấu hình, chỉnh được)

| Tham số | Mặc định |
|---|---|
| Ngưỡng lãi suất nợ ưu tiên | 10% / năm |
| Quỹ khởi điểm | 1 tháng chi tiêu thiết yếu |
| Tiền chừa tiêu hàng ngày ở Nhàn rỗi | 1 tháng chi tiêu |
| Mức DCA đề xuất | 50% dòng dư mỗi tháng |
| Tuổi mặc định khi người dùng từ chối khai | 30 |
| Khoảng tuổi hợp lệ | 18 đến 100 |
| Hỏi cập nhật món tự khai | 30 ngày |
| Hỏi cập nhật thu nhập, chi tiêu | 90 ngày |

---

## 14. Việc Claude Code làm sau khi nhận file này

1. Cập nhật `docs/archive/FRAMEWORK-TAI-CHINH.md` theo đúng file này.
2. Sửa `src/lib/allocation.ts` theo công thức mục 4, cơ sở % theo mục 2, trường `rebalanceable`. Sửa màn Balance theo mục 11.
3. Thiết kế lại tool theo mục 10, thêm dữ liệu dòng tiền (mục 6) và nợ từng khoản (mục 5.2).
4. Xây kho tình huống tư vấn (mục 9) dạng dữ liệu.
5. Viết lại prompt agent một lần, đưa vào: nguyên tắc mục 0, giọng và câu cấm mục 8, kho tình huống mục 9.
6. Viết bộ test và chạy nhiều vòng trước khi deploy. Bắt buộc có các ca sau:
   - Nợ thẻ tín dụng: chặn mua cirBTC. Nợ người thân không lãi: không chặn.
   - Nợ vay mua nhà lãi dưới ngưỡng: không chặn. Lãi từ ngưỡng trở lên: chặn.
   - Quỹ dự phòng thiếu mốc: chặn và agent nói đúng thiếu bao nhiêu. Đủ mốc và hết nợ ưu tiên: mở.
   - Mốc quỹ đổi theo ổn định thu nhập, người phụ thuộc, trụ cột duy nhất (3, 6, 9, 12).
   - Chưa khai tuổi: agent hỏi tuổi. Từ chối khai tuổi: dùng 30 và nói rõ.
   - "Vừa bỏ 1.000$ vào safe": agent hỏi "lấy từ đâu?" rồi dùng đúng `move` hoặc `add_holding`.
   - Không có giá thị trường: agent hỏi và chấp nhận lời khai.
   - Số liệu mâu thuẫn: agent hỏi đúng 1 câu.
   - Người dùng muốn all-in altcoin: agent nêu rủi ro một lần, không nhắc lại.
   - Agent không bao giờ nói "theo chuẩn thế giới", không gợi ý bán, không đòn bẩy.
   - Thụ động ≥ chi tiêu: hiện "tự do tài chính".
