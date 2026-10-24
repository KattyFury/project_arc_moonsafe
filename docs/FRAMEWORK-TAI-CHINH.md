# Frame tài chính cá nhân — MoonSafe

Nguồn chuẩn cho agent (`functions/api/chat.ts`) và phần tính phân bổ (`src/lib/allocation.ts`).
Bản gốc user chốt 23/10/2026; mục **"Chốt 24/10"** bên dưới là phần đang chạy trong code, ưu tiên hơn bản gốc khi khác nhau.

## Chốt 24/10/2026 (đang chạy trong code)

1. **Quỹ dự phòng trước.** 3 tháng chi tiêu thiết yếu nếu thu nhập ổn định, 6 tháng nếu không. Giữ bằng USDC trong vault. Quỹ **đứng riêng**, không tính vào phân bổ.
2. **Khoá đầu tư giữ như cũ:** chỉ mua cirBTC / DCA trong app khi không còn nợ ngoài và quỹ đủ mốc.
3. **Tiền ngoài quỹ chia 3 phần** (biểu đồ tròn):
   | Phần | Gồm | Nguồn số |
   |---|---|---|
   | An toàn | Gửi tiết kiệm ngân hàng (bảo hiểm tiền gửi) | Người dùng kể → agent ghi |
   | Đầu tư | Vàng, cổ phiếu / ETF Mỹ, coin, cirBTC | Kể → agent ghi; cirBTC app tự đọc |
   | Nhàn rỗi | Tiền chưa phân bổ: USDC trong ví, tiền mặt / tài khoản thanh toán, stablecoin | Ví app tự đọc; còn lại kể |
4. **Mục tiêu theo tuổi:** an toàn = tuổi %, đầu tư = 100 − tuổi %. Ví dụ 31 tuổi: 31% an toàn, 69% đầu tư. Nhàn rỗi không có mục tiêu: là tiền người dùng còn phải chia. App gợi ý chia tiền nhàn rỗi để lấp phần thiếu của mỗi bên.
5. **Gợi ý chia phần đầu tư (user chọn 2a, 2026-10-24)** theo bản gốc 23/10, tính trên % TOÀN BỘ tiền ngoài quỹ: altcoin = min(10, 40 − tuổi) (hết ở 40), BTC = min(20, 60 − tuổi) (hết ở 60), cổ phiếu chỉ số / ETF = phần đầu tư còn lại. Ví dụ 31 tuổi: cổ phiếu 40%, BTC 20%, altcoin 9%. Vàng chưa có tỉ lệ riêng (tính vào phần đầu tư, chờ user quyết). Code: `investMix()` trong `src/lib/allocation.ts`. Agent luôn nói đây là quan điểm MoonSafe, crypto cao hơn mức các tổ chức khuyên (0–5%). Trong app chỉ mua được phần BTC (cirBTC); thẻ mua cirBTC không vượt phần BTC; cổ phiếu, altcoin người dùng mua ở nơi khác. Người dùng vẫn được tự mua theo ý (không chặn, chỉ cảnh báo).
   - **Phần an toàn = tài khoản tiết kiệm ngân hàng của chính người dùng** (ngân hàng nhà nước, có bảo hiểm tiền gửi, có lãi). App không chuyển tiền vào ngân hàng; agent không bao giờ tạo thẻ nạp quỹ cho phần này.
   - **Chưa biết tài sản ngoài app thì chưa chia.** Chỉ thấy USDC trong ví thì agent hỏi người dùng còn gì (tiết kiệm, tiền mặt, vàng, cổ phiếu, coin) trước; chỉ nói %, không quy ra tiền theo số dư ví.
6. **Ghi tài sản = tool `record_asset` của agent** (không có form). Người dùng nói số lượng, app tự lấy giá:
   - Vàng: **giá vàng thế giới** (XAU/USD theo troy ounce, chốt 2026-10-24 khi app chuyển sang English; trước đó là giá SJC mua vào). Lưu theo ounce; agent nhận oz, g, kg, lượng, chỉ (1 lượng = 37,5 g). Vàng đã khai theo lượng trước 10-24 được tự quy đổi.
   - Cổ phiếu: chỉ cổ phiếu / ETF niêm yết ở Mỹ. Cổ phiếu Việt Nam không theo dõi giá: ghi vào "tài sản khác" theo giá trị người dùng nói.
   - Nhà, đất, xe: "tài sản khác" (tính vào giá trị ròng, không vào biểu đồ).
7. **Biểu đồ hiện ở:** Cân đối (nút gạt "Phân bổ"), Đầu tư, và trong chat khi hỏi về phân bổ.

### Nguồn giá (`functions/api/prices.ts`, cache 10 phút)
| Loại | Nguồn | Ghi chú |
|---|---|---|
| Vàng | api.gold-api.com (XAU spot), dự phòng Yahoo `GC=F` (hợp đồng tương lai, cao hơn spot vài USD) | Không cần key |
| Cổ phiếu Mỹ | Yahoo Finance chart API (query1 → query2) | Không chính thức, không cần key |
| Coin | Coinbase spot → Binance | Stablecoin tính = 1 USD, xếp vào nhàn rỗi |
Không có giá thì tài sản đó hiện "chưa có giá" và tạm không tính, không đoán.

### Đã bỏ
- Trần 110 − tuổi (Normal) / 120 − tuổi (Risky) và chặn mua theo trần.
- "3 mức" Thận trọng / Cân bằng / Mạo hiểm.
- Giới hạn 8 USDC mỗi lần mua (lên mainnet thì không còn cần).

## Bản gốc 23/10/2026 (tham khảo)

### Vai trò của app
- App tư vấn. Dừng ở tư vấn, không tự hành động thay người dùng.
- Tính mọi tài sản người dùng có vào giá trị ròng. Không dự đoán vĩ mô.

### Bảng cân đối
Tài sản = Nợ phải trả + Vốn chủ sở hữu. Bốn tỷ số (Lehigh): thanh khoản / chi tiêu tháng ≥ 3 tháng · nợ / tổng tài sản càng thấp càng tốt (64% là nguy hiểm) · thu nhập năm / tiền trả nợ năm ≥ 2,8 · tài sản đầu tư / vốn chủ ≥ 50%.

### Tiền chảy tràn
0. Ngân sách: chi thiết yếu + trả tối thiểu mọi khoản nợ. 1. Quỹ khẩn cấp nhỏ (1–2 tháng). 2. Trả nợ lãi cao (≥ 10%/năm). 3. Quỹ dự phòng đầy đủ. 4. Trả nợ lãi trung bình (≥ 4–5%/năm, trừ vay mua nhà). 5. Để dành khoản chi lớn sắp tới. 6. Đầu tư dài hạn, mục tiêu ≥ 15% thu nhập. 7. Nợ lãi thấp, mục tiêu khác.

### Quỹ dự phòng
Sàn 6 tháng chi tiêu thiết yếu (ổn định có thể 3 tháng). Nâng 12 tháng khi tài sản ngoài nhà ≥ 4 × chi tiêu 12 tháng. Giữ bằng USDC.

### Nợ
Nợ tiêu dùng luôn xấu; nợ làm ăn chỉ ổn khi lợi suất kỳ vọng > lãi vay + rủi ro. Trả lãi cao trước hoặc khoản nhỏ trước (Kellogg). Vay trong app: health factor ≥ 2,0; cảnh báo < 1,5; khẩn cấp < 1,2.

### Phân bổ (gợi ý chi tiết bản gốc, app hiện KHÔNG chỉ định)
Tuổi 30: cổ phiếu chỉ số 40% · BTC 20% · altcoin ≤ 10%. Lớn tuổi hơn: cắt altcoin trước (hết ở 40), rồi BTC (hết ở 60), cổ phiếu sau cùng. Nhãn: "Đây là quan điểm của MoonSafe. Crypto ở đây cao hơn mức các tổ chức tài chính khuyến nghị (0–5%)."

### Thị trường
Không canh thời điểm (Alpha Architect): giữ tỷ lệ cố định, lệch thì cân bằng lại mỗi quý.

### Nguồn
r/PersonalFinanceCanada money steps · Ramsey 7 Baby Steps · Lehigh Financial planning · Vanguard (CNBC) · Kellogg snowball · Bogleheads 3-fund · Permanent Portfolio · BlackRock 1–2% · Morgan Stanley 0–4% · Fidelity/Grayscale ~5% · DQYDJ · World Gold Council · K33 · Alpha Architect · Decrypt (Ondo) · VnEconomy (bảo hiểm tiền gửi)
