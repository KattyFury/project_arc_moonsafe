# Spec Balance Sheet: tính giá trị thế nào, lệch thì xử lý ra sao (bản bàn, 2026-10-30)

> Trạng thái: **đang bàn, chưa code.** Hiếu chốt từng trục ở mục 5 rồi mới làm.

## 1. App đang làm gì (code hiện tại)

| Thứ | Cách tính hiện tại | Ở đâu |
|---|---|---|
| Khoản đầu tư (BTC, vàng, cổ phiếu, Crypto) | **Tiền đã bỏ vào** (cost basis, quyết định 10-29). Ngoại lệ: khoản khai bằng số lượng ("0.1 BTC") tính theo **giá thị trường**. cirBTC mua trong app = số USDC đã trả. | `src/lib/profile.ts`, `src/lib/allocation.ts` |
| Can use now (liquid) | Tổng tiền khai báo dùng được (tiết kiệm, stablecoin, đầu tư). Không tính quỹ dự phòng, nhà, xe. | `computeBalance` |
| Mục tiêu 3 phần | % theo tuổi của **Can use now** (trừ khoản chi lớn sắp tới): Safety = tuổi %, phần còn lại chia đôi Traditional / Crypto. | `bucketStanding` |
| Net worth | Mọi tài sản (cả nhà, xe, quỹ dự phòng) trừ nợ. **Chỉ để hiển thị**, không ảnh hưởng kế hoạch. | ô Net worth ở Balance |
| Lệch mục tiêu | Mọi đồng lệch đều hiện "to go" hoặc "above", không có ngưỡng. | Balance, Invest, agent |

**Hệ quả Hiếu thấy:** mua dư BTC thì Can use now tăng, nên mục tiêu Safety và Traditional cũng tăng theo và hai phần này tự dưng "thiếu" thêm. Ví dụ: Crypto $4,200 / mục tiêu $3,395 (124%) kéo Traditional thành $1,500 / $3,395, thiếu $1,895.

**Lỗ hổng gốc:** app trộn hai cách tính. Phần lớn tính theo tiền bỏ vào, nhưng một số khoản lại theo giá thị trường. Lệch nhỏ cũng bị coi là "thiếu", và không có nguyên tắc khi nào mới cần cân đối lại.

## 2. Thế giới làm thế nào

**Định giá: giá thị trường cho bức tranh tài sản, tiền bỏ vào cho lãi/lỗ.**
- Theo dõi net worth và tỉ trọng tài sản đều dùng **giá thị trường hiện tại**. Tiền bỏ vào (cost basis) được giữ riêng để biết lãi/lỗ thật và tính thuế.
- Lý do: tỉ trọng nói lên **rủi ro đang chịu**. BTC đã x3 thì rủi ro của anh là theo giá trị hiện tại, không phải theo số tiền đã bỏ ra.

**Lệch tỉ trọng (drift): chỉ xử lý khi lệch đủ lớn.**
- **Theo lịch:** mỗi năm cân đối 1 lần. Đơn giản, nhưng giữa hai lần có thể lệch xa.
- **Theo ngưỡng (bands):** chỉ cân đối khi một phần lệch quá ngưỡng.
  - Quy tắc phổ biến là **5/25** (Larry Swedroe): lệch quá 5 điểm % tuyệt đối, hoặc quá 25% của chính mục tiêu đó, lấy mức nhỏ hơn. Ví dụ mục tiêu 35% thì vùng an toàn là 30–40%; mục tiêu 10% thì là 7.5–12.5%.
  - Nghiên cứu của Vanguard nghiêng về cân đối theo ngưỡng vì giữ tỉ trọng sát hơn mà ít giao dịch hơn.
- **Cách sửa lệch, ưu tiên từ nhẹ tới nặng:**
  1. Dùng **tiền mới** (lương, tiền để dành) bỏ vào phần đang thiếu (cash-flow rebalancing). Không phải bán gì.
  2. Chỉ khi lệch rất xa mới bán bớt phần dư.

**Khi một phần tăng/giảm giá:**
- **Tăng mạnh:** tỉ trọng phần đó vượt ngưỡng. Lời khuyên chuẩn là dồn tiền mới sang phần khác, hoặc chốt bớt.
- **Giảm mạnh:** tỉ trọng phần đó tụt dưới ngưỡng. Lời khuyên chuẩn là mua thêm (mua thấp). Kỷ luật này đúng về lý thuyết, nhưng với người mới thì dễ thành "app giục tôi bắt dao rơi". Đây chính là điều Hiếu đã chặn ngày 10-29.

**Quỹ dự phòng:** luôn tính theo **số tháng chi tiêu** (3–6, có khi 12), tách hẳn khỏi danh mục đầu tư, không định giá theo thị trường. Danh mục to lên không làm quỹ phải to lên; chi tiêu và hoàn cảnh mới quyết định.

## 3. Chỗ MoonSafe khác thế giới, và vì sao

| | Thế giới | MoonSafe hiện tại |
|---|---|---|
| Định giá | Giá thị trường (lãi/lỗ tính riêng theo tiền bỏ vào) | Tiền bỏ vào (trừ khoản khai bằng số lượng) |
| Lệch | Ngưỡng (5/25) hoặc mỗi năm | Lệch 1 đồng cũng báo |
| Giá giảm | Mua thêm cho đủ tỉ trọng | Không giục mua (Hiếu 10-29) |

Lý do MoonSafe đi khác: người dùng là dân Web3 mới học quản lý tiền, giá crypto biến động mạnh, nên app không được đẩy họ mua thêm khi đang rơi. Lý do đó đúng. Nhưng tính theo tiền bỏ vào làm app **không thấy rủi ro thật**: BTC x3 mà app vẫn coi như chưa đổi.

## 4. Lưu ý về dữ liệu

- **cirBTC mua trong app:** app đọc được số lượng thật trên chuỗi, nên biết cả giá trị thị trường lẫn tiền đã trả.
- **Khoản khai bằng tiền** ("tôi có $2,000 vàng"): app chỉ biết đúng con số đó, không tự biết giá trị hiện tại. Muốn theo giá thị trường thì phải có số lượng (oz, số coin, số cổ phiếu), hoặc người dùng thỉnh thoảng báo lại.

## 5. Các trục cần Hiếu chốt

**Trục 1: định giá**
- **1a.** Giữ tiền bỏ vào cho mọi thứ (như hiện tại).
- **1b.** Giá thị trường cho mọi thứ biết số lượng; khoản chỉ có số tiền thì giữ số đã khai.
- **1c (em đề xuất).** Hiện **cả hai**: "Value now" (giá thị trường, nếu biết) và "Put in" (tiền bỏ vào), kèm lãi/lỗ. **Mục tiêu và lời khuyên** dùng giá thị trường khi biết, nhưng gặp lệch do giá giảm thì không bao giờ giục mua (xem trục 3).

**Trục 2: khi nào coi là lệch**
- **2a.** Lệch 1 đồng cũng báo (như hiện tại).
- **2b (em đề xuất).** Ngưỡng 5/25: trong ngưỡng là "On track", không có "to go". Ra ngoài ngưỡng mới báo "Over" hoặc "Under".
- **2c.** Phương án B bàn lúc trước: phần vượt không kéo mục tiêu phần khác. Có thể ghép với 2b.

**Trục 3: sửa lệch bằng gì**
- **3a (em đề xuất).** Chỉ bằng tiền mới: "lần tới có tiền thì bỏ vào phần Under". Không bao giờ khuyên bán, không giục mua khi giá giảm. Agent chỉ nói "phần này đang thấp hơn mục tiêu vì giá giảm; nếu có tiền mới, bạn có thể ưu tiên nó".
- **3b.** Cho phép gợi ý chốt bớt phần Over (bán ngoài app hoặc bán cirBTC). App hiện chưa có chức năng bán cirBTC.

**Trục 4: Net worth**
- **4a.** Giữ ô Net worth, tính theo giá thị trường (khi biết), vẽ thêm đường theo thời gian.
- **4b.** Bỏ ô Net worth, chỉ giữ Can use now và Emergency fund.
- **4c.** Đổi tên và định nghĩa lại, ví dụ "Total" = Can use now + quỹ dự phòng, bỏ nhà, xe, nợ khỏi ô này.

**Trục 5: nhắc nới quỹ (đã chốt)**
- Khi phần đầu tư vượt **24 tháng chi tiêu**, agent nhắc 1 lần: cập nhật lại chi tiêu, cân nhắc nới quỹ dự phòng (ví dụ 3 → 6 tháng).

## 6. Ví dụ với số của Hiếu (1c + 2b + 3a)

Tuổi 30, Can use now $9,700: Safety 30%, Traditional 35%, Crypto 35%.

| Phần | Có | Tỉ trọng | Vùng an toàn (5/25) | Trạng thái |
|---|---|---|---|---|
| Safety | $4,000 | 41% | 25–35% | **Over**: không cần làm gì, tiền mới bỏ vào phần khác |
| Traditional | $1,500 | 15% | 30–40% | **Under**: tiền mới ưu tiên phần này |
| Crypto | $4,200 | 43% | 30–40% | **Over**: tiền mới không bỏ vào đây, không giục bán |

Nếu sau đó BTC giảm làm Crypto tụt còn 33%: vẫn trong ngưỡng nên hiện **On track**, app không nói gì. Nếu tụt còn 25% (Under) vì giá giảm: app chỉ ghi "thấp hơn mục tiêu vì giá giảm", không có nút mua, không có lời giục.

## Nguồn
- Vanguard, threshold vs calendar rebalancing: https://corporate.vanguard.com/content/dam/corp/research/pdf/the_rebalancing_edge_optimizing_target_date_fund_rebalancing_through_threshold_based_strategies.pdf
- Vanguard Canada, when and how to rebalance: https://www.vanguard.ca/en/investor/insights/when_and_how_to_rebalance
- Larry Swedroe 5/25 rule (tóm tắt): https://awealthofcommonsense.com/2014/03/larry-swedroe-525-rebalancing-rule/
- Net worth theo giá thị trường, cost basis giữ riêng: https://moneyguy.com/article/how-to-calculate-your-net-worth-the-right-way/
