# Spec Balance Sheet v2: cân port theo giá trị, mốc là mục vừa được bơm (2026-10-30)

> Trạng thái: **đã chốt hướng, chưa code.** Thay cho bản bàn trước cùng ngày. Việc tiếp theo là mổ xẻ chi tiết từng màn hình rồi mới viết spec build.

## 1. Nguyên tắc

1. **Mục tiêu theo tuổi.** Safety = số tuổi (%), phần còn lại chia đôi Traditional và Crypto. Tuổi 30 thì 30 / 35 / 35. Đây là quy tắc "age in bonds" quen thuộc, là gợi ý chứ không phải luật.
2. **App không hỏi tổng tiền và không theo dõi tăng trưởng.** Không có cost basis, không có lãi/lỗ, không có Net worth, không có "Can use now".
3. **Chỉ khai cái đang có ở hiện tại, dưới dạng số lượng.** USDC, số oz vàng, số cổ phiếu, số coin. Giá lấy từ oracle mỗi khi mở app. Số dư stablecoin hoặc tiền mặt thì số lượng chính là giá trị.
4. **Bơm vào mục nào thì mục đó là mốc, các mục khác phải theo sau.** Không có khái niệm "tổng tiền người dùng có".

## 2. Công thức

Gọi giá trị hiện tại của mục i là `v_i`, tỉ lệ mục tiêu là `w_i`.

- **Mốc** là mục có `v_i / w_i` lớn nhất. Đó là mục đang "đi xa nhất" so với phần của nó.
- **Tổng ngụ ý** = `v_mốc / w_mốc`.
- **Mục tiêu của mục j** = tổng ngụ ý × `w_j`.
- **Cần thêm cho mục j** = mục tiêu của j − `v_j`. Không bao giờ âm, vì mốc đã là mục lớn nhất.

Ví dụ của Hiếu: bơm Safety lên $3,000 với tỉ lệ 30% thì tổng ngụ ý là $10,000, nên Traditional và Crypto mỗi mục phải đạt $3,500.

Đây cũng chính là số tiền tối thiểu để đưa cả ba mục về đúng tỉ lệ mà không phải bán gì.

## 3. Ngưỡng và cách báo

- Dùng ngưỡng **5/25**, tính trên tổng ngụ ý: một mục chỉ bị coi là thiếu khi tỉ trọng của nó (`v_j` ÷ tổng ngụ ý) thấp hơn mục tiêu quá 5 điểm % tuyệt đối hoặc quá 25% của chính tỉ lệ mục tiêu, lấy mức nhỏ hơn. Mục tiêu 35% thì chỉ báo thiếu khi tụt dưới 30%.
- Trong ngưỡng, và cả mục là mốc: **On track**, không hiện "to go".
- Ngoài ngưỡng: **Under**, hiện số tiền cần thêm.
- Không có trạng thái "Over", vì mốc là mục lớn nhất theo tỉ lệ nên không mục nào vượt mục tiêu.
- Giá giảm làm một mục tụt xuống Under: app chỉ ghi "thấp hơn mục tiêu vì giá giảm". Không có nút mua, không giục mua (giữ nguyên quyết định ngày 10-29).
- App **không khuyên bán** và chưa có chức năng bán.

## 4. Khai báo

- Mỗi khoản gồm: loại tài sản, số lượng, thuộc mục nào (Safety, Traditional, Crypto).
- Khoản đã có oracle thì tự lấy giá. Khoản không có oracle thì coi là tiền, số lượng quy thẳng ra USD.
- cirBTC mua trong app: đọc số lượng thật trên chuỗi.
- Bỏ hoàn toàn cách khai "tôi có $2,000 vàng". Phải khai bằng số lượng. Việc này giải quyết luôn chuyện trộn hai cách tính ở bản trước.

## 5. Bỏ khỏi bản trước

- Ô Net worth, và cả nhà, xe, nợ khỏi màn hình này.
- "Can use now" và việc trừ khoản chi lớn sắp tới.
- Cost basis và lãi/lỗ.
- Trục 2c (phần vượt không kéo mục tiêu phần khác) vì mốc theo công thức ở mục 2 đã xử lý.
- Trục 3b (gợi ý chốt bớt).

## 6. Hoãn lại

- **Dòng tiền:** sẽ là module riêng sau này. Hiện tại app thiên về Balance Sheet và đầu tư.
- **Nhắc nới quỹ khi đầu tư vượt 24 tháng chi tiêu (cũ là trục 5):** cần biết chi tiêu hàng tháng, nên chuyển sang module dòng tiền.

## 7. Rủi ro đã biết

- **Một mục tăng giá mạnh thì các mục còn lại bị coi là thiếu rất nhiều.** Ví dụ Crypto x3 thì Safety và Traditional phải x3 theo. Đây là hệ quả thật của việc không bán: thế giới xử lý chuyện này bằng cách bán bớt phần dư, còn app thì không. Ngưỡng 5/25 chỉ che được lệch nhỏ. Cách trình bày khoản thiếu lớn thế nào để người mới không bị hoảng là việc cần mổ xẻ ở bước sau.
- **Nguồn giá cho vàng và cổ phiếu chưa chốt.** Chưa kiểm tra oracle nào có sẵn trên Arc.

## 8. Ví dụ với số của Hiếu

Tuổi 30. Safety $4,000, Traditional $1,500, Crypto $4,200.

- Safety: 4,000 / 0.30 = 13,333. Traditional: 1,500 / 0.35 = 4,286. Crypto: 4,200 / 0.35 = 12,000.
- Mốc là Safety. Tổng ngụ ý $13,333.
- Mục tiêu: Safety $4,000, Traditional $4,667, Crypto $4,667.
- Tỉ trọng trên tổng ngụ ý: Safety 30%, Traditional 11%, Crypto 31.5%.
- Traditional thấp hơn mục tiêu 24 điểm % nên là **Under**, cần thêm $3,167.
- Crypto thấp hơn 3.5 điểm % (dưới 5) nên là **On track**, dù về số học vẫn thiếu $467.
- Safety là mốc nên là **On track**.
