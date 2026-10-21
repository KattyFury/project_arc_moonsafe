# nguyen0xhieu — Design System

> **Cho AI agent:** đọc hết file này và [`tokens.json`](tokens.json) trước khi thiết kế. Chỉ dùng màu, chữ, khoảng cách, bo góc, shadow có trong `tokens.json`; không tự bịa giá trị mới.
>
> - Hướng dẫn (file này): https://raw.githubusercontent.com/KattyFury/repo_personal_design/main/README.md
> - Token (JSON): https://raw.githubusercontent.com/KattyFury/repo_personal_design/main/tokens.json
> - Figma gốc: https://www.figma.com/design/IPyKVg7ylGw1mjMRyYVrL7/hieu

Bộ màu thương hiệu cá nhân của nguyen0xhieu, dùng cho mọi thiết kế: web, app, slide, ảnh mạng xã hội. Gốc của cả bộ là **0x Blue** (`blue`, #1E6DF7). Đây là màu xanh nằm đúng điểm cân bằng giữa trắng và đen, nên đặt trên nền trắng hay nền đen đều đọc được.

## Màu xanh đặc trưng

- `blue` là màu nhận diện. Màu này giữ **nguyên một giá trị ở cả giao diện sáng lẫn tối**, đạt 4.58:1 trên trắng và 4.59:1 trên đen (chuẩn chữ thường là 4.5:1).
- **Nút chính:** nền `blue`, chữ `on-blue` (trắng).
- **Nút phụ:** nền trắng (`ground`), chữ `blue`.
- **Chữ nhấn, link:** dùng `blue` trên `ground`.
- Trên nền xám/nhạt (`mist`, `blue-soft`), `blue` chỉ dùng cho chữ to (≥24px, hoặc ≥19px đậm) và icon. Chữ nhỏ màu xanh trên các nền này dùng `blue-strong`.
- Màu đen thương hiệu là **đen thuần #000000** (`ink`). Lệch sang đen-xanh dù chỉ một chút là `blue` tụt dưới 4.5:1 so với đen.

## Gradient

- Gradient thương hiệu: `linear-gradient(to top right, var(--gradient-end), var(--gradient-start))`. Đầu đậm `gradient-end` (#0F3DB2) ở góc dưới-trái, đầu sáng `gradient-start` (= `blue`) ở góc trên-phải.
- Chữ trắng `on-blue` đọc được trên toàn dải: 4.58:1 ở đầu sáng, 9.0:1 ở đầu đậm.
- Dùng cho nút chính nổi bật, banner, ảnh bìa, khối số dư. Mỗi màn hình chỉ một vùng gradient. Chữ, icon nhỏ và đường kẻ không dùng gradient.

## Chữ và nền

| Vai trò | Token | Dùng cho |
|---|---|---|
| Chữ đen | `ink` | Tiêu đề, nội dung chính (dark: trắng) |
| Chữ xám | `grey` | Mô tả, nhãn, giá trị phụ |
| Chữ muted | `muted` | Placeholder, chữ bị tắt, giờ/ngày. Không dùng cho chữ người đọc cần làm theo |
| Trắng | `ground` | Nền trang (dark: đen thuần) |
| Nền phụ | `mist` | Thẻ, ô nhập, khối gom nhóm. Nhạt hơn `muted`, hơi ngả xanh để hợp với `blue` |
| Đường kẻ | `line` | Viền mảnh 0.5–1px, viền ô nhập |

- Chỉ có 3 cấp chữ: `ink`, `grey`, `muted`. Không thêm cấp xám thứ tư.
- Thứ bị tắt (disabled) thì đổi sang màu nhạt hơn hoặc ẩn đi. Nút bị tắt: nền `line`, chữ `muted`, không shadow. **Không giảm opacity.**

## Bộ màu đi kèm

Mỗi màu có 3 bậc:
- Màu gốc (`green`…): cho icon, chấm, biểu đồ, khối lớn.
- `-text`: cho chữ trên nền trắng và trên nền nhạt của chính nó.
- `-soft`: cho nền nhạt của ghi chú, badge, dòng.

| Màu | Ý nghĩa |
|---|---|
| `green` | Thành công, nhận tiền, tăng |
| `red` | Lỗi, gửi tiền đi, xoá, giảm |
| `purple` | Điểm nhấn, tính năng mới, chuỗi biểu đồ thứ 2 |
| `yellow` | Cảnh báo, đang chờ. Chữ trên nền `yellow` luôn là `ink` đen |
| `orange` | Cần chú ý nhưng không phải lỗi: hạn mức, phí, sắp hết hạn |
| `cyan` | Thông tin, link ra ngoài, chuỗi biểu đồ thứ 3 |

- Trạng thái luôn đi kèm chữ hoặc icon ("Received", "Failed"). Không phân biệt xanh lá với đỏ chỉ bằng màu.
- Không dùng quá 2 màu đi kèm trên một màn hình, ngoài `blue`.

## Gradient hay solid

- **Solid là mặc định** cho mọi thứ:
  - Nút chính: nền `blue`, chữ `on-blue`. Nút phụ: nền `ground`, chữ `blue`.
  - Chữ: `ink`, `grey`, `muted`. Thẻ và ô nhập: `mist`.
  - Trạng thái và biểu đồ dùng màu đi kèm, dạng solid.
- **Gradient chỉ dùng tối đa 1 vùng trên mỗi màn hình hoặc mỗi slide**, ở một trong các chỗ sau:
  - nền slide bìa và slide chương;
  - dải hero của web;
  - thẻ số dư hoặc thẻ tóm tắt;
  - nút CTA chính duy nhất.
- Không dùng gradient cho chữ, icon, đường kẻ, chip, nút nhỏ, ô nhập hay biểu đồ. Không đặt 2 vùng gradient cạnh nhau.

## Chữ

- **Thiết kế (Figma, slide): Inter** (`design`).
- **Code app và web: font hệ thống của Apple** (`app`: -apple-system, SF Pro). Trên máy không có SF Pro, font tự lùi về font hệ thống.
- Cỡ chữ là số chẵn từ 14 tới 96. Khoảng cách dòng theo bước 4px. Letter-spacing theo bảng "dynamic metrics" của Inter: chữ càng to càng khít, từ −0.6% ở cỡ 14 tới −2.2% ở cỡ 96.
- Tên style ghi luôn chỗ dùng.
- **App mobile: chỉ 7 cỡ 14 · 16 · 18 · 22 · 28 · 34 · 48** (chốt 2026-10-20, rút từ ezwallet). Bộ này dựa trên cỡ chữ chuẩn của iPhone (Body 17, Title 2 22, Title 1 28, Large Title 34), làm tròn lên số chẵn. Chữ nội dung to hơn app thường vì app cũng phục vụ người lớn tuổi:
  - `app-caption` / `app-label` 14/20: giờ, gợi ý, chip, badge;
  - `app-note` 16/24: ghi chú, toast, gợi ý (hint) và dòng thông báo, ô nhập địa chỉ;
  - `app-secondary` 18/24: dòng phụ "Nhãn: giá trị", nhãn thanh tab;
  - `app-button-small` 18/24 đậm: nút có icon (icon 24 trên, chữ dưới) và nút nhỏ dạng viên (50%, Max, Open, chọn tiền tệ…);
  - `app-body` / `app-button` / `app-title-card` 22/28: nội dung, nút chữ thường, tiêu đề thẻ và popup;
  - `app-title-screen` 28/36: tiêu đề màn hình, phím bàn phím số;
  - `app-large-title` 34/40: tiêu đề màn đầu, số dư;
  - `app-number` 48/56: số tiền.
- Slide:
  - `slide-cover`: 96/104 Bold, cho bìa.
  - `slide-title`: 56/64 Bold, cho tiêu đề slide nội dung.
  - `slide-body`: 32/44, cho nội dung.
  - `slide-footnote`: 24/32, cho nguồn và số trang.
- Web 1440 dùng `web-*`. Web trên điện thoại (393) đổi tiêu đề sang `web-mobile-*`.

## Shadow

- Chỉ có một shadow là `shadow-y2`: X 0, Y 2, Blur 8, Spread 0, màu đen #000000 độ đậm **32%** ở giao diện sáng và **48%** ở giao diện tối. Ngày 2026-10-19 đã nâng từ 16% lên 32% cho rõ hơn.
- Dùng cho thẻ nổi, nút, popup và sheet. Các khối phẳng đặt trên nền `mist` thì không cần shadow.

## Lề, lưới và khoảng cách

- Mọi khoảng cách là bội số của 8:
  - `space-8`: icon cách chữ;
  - `space-16`: lề mobile, padding thẻ;
  - `space-24`: khoảng giữa các thẻ, rãnh cột web;
  - `space-32`: khoảng giữa các nhóm trong màn app;
  - `space-48`, `space-64`, `space-96`, `space-128`: các khoảng lớn của web và slide (xem bảng dưới).
- Bo góc `radius-md` 16px cho mọi thẻ, ô và nút. Pill và hình tròn dùng `radius-pill`.

| Khung | Chiều rộng | Chiều cao / nhịp dọc |
|---|---|---|
| **Mobile app 393×852** | Lề 16, 4 cột, rãnh 16 | **Không có lưới hàng**, vì màn app cuộn dọc. Nhịp dọc theo lưới nền 8. Chừa vùng an toàn: trên 59 (thanh trạng thái + Dynamic Island), dưới 34 (thanh home). Thẻ cách nhau 16–24, nhóm cách nhau 32 |
| **Website 1440** | Lề 120, 12 cột, rãnh 24, nội dung rộng 1200 | Padding mỗi section 96, các khối cách nhau 64. Đoạn văn rộng tối đa 680 |
| **Website mobile 393** | Lề 16, 4 cột, rãnh 16 | Padding mỗi section 48, các khối cách nhau 32 |
| **Slide 1920×1080** | Lề 128, 6 cột, rãnh 64 (mỗi cột 224) | Lề 128, 4 hàng, rãnh 64. Kicker cách tiêu đề 24, tiêu đề cách nội dung 48 |

Căn cứ:
- Lề 16 và lưới 8pt theo Apple HIG và Material (màn hình nhỏ: 4 cột, lề 16).
- Lưới slide theo một brand guide 1920×1080 đã công bố (lề 128, rãnh 64, 4–6 cột).
- Viền focus: 2px `focus` (= `blue`), cách 2px.

## Button và box

Căn cứ: Apple HIG yêu cầu vùng bấm tối thiểu 44×44 pt. Slide 1920 có mật độ khoảng gấp đôi màn hình thường, nên mọi kích thước trên slide nhân đôi, kể cả bo góc (`radius-32`).

| | Mobile app 393 | Website 1440 | Slide 1920 |
|---|---|---|---|
| Nút | Cao **48**, đệm 24, chữ `app-button` | Cao **48**, đệm 24. CTA hero cao **56**, đệm 32 | Cao **96**, đệm 48, chữ `slide-button` |
| Nút có icon | Icon 24 trên, chữ dưới, chữ `app-button-small` 18 đậm. Khoảng trống **mắt thấy** giữa icon và chữ là 8 (đo từ nét icon tới đỉnh chữ hoa; trong code để gap 0, vì icon có lề trong và dòng chữ 18/24 có đệm phía trên). Cùng một hàng thì mọi nút cùng kích thước, nút chính chỉ khác màu (nền `blue`) | như mobile | không dùng |
| Nút nhỏ | Dạng viên cao 40, đệm 16, chữ `app-button-small` 18 đậm. Vùng bấm vẫn ≥44 | Cao 40, đệm 16, chữ `web-label` | không dùng |
| Nút icon | 48×48, icon 24 | 40×40, icon 20 | 96×96, icon 48 |
| Ô nhập | Cao 48, đệm 16, nền `mist`, viền `line` 1px, khi chọn viền 2px `blue` | như mobile | không dùng |
| Box / thẻ | Đệm 16, các phần trong cách nhau 8, thẻ cách nhau 16–24 | Đệm 32 (thẻ nhỏ 24), rộng 4 cột = 384, thẻ cách nhau 24 | Đệm 48, tiêu đề `slide-box-title`, rộng 3 cột = 800, box cách nhau 64 |
| Dòng danh sách | Cao tối thiểu 56, đệm 16 | Cao tối thiểu 56, đệm 24 | không dùng |
| Bo góc | `radius-md` 16 | `radius-md` 16 | `radius-32` |

Màu, áp dụng chung cho cả 3 loại khung:
- Nút chính: nền `blue`, chữ `on-blue`.
- Nút phụ: nền `ground`, chữ `blue`.
- Nút chính và nút phụ đều có `shadow-y2`.
- Nút bị tắt: nền `line` (#DCE3EE), chữ `muted`, không shadow, không giảm opacity. Dùng `line` chứ không dùng `mist`, vì nút tắt đặt trên bảng nền `mist` sẽ biến mất (phát hiện khi redesign ezwallet 2026-10-19).
- Box phẳng: nền `mist`, không shadow. Box nổi: nền `ground` + `shadow-y2`.
- Trên mobile, **nút đứng một mình** (Done, Reload…) rộng cố định **296** (3/4 màn 393, làm tròn bội số 8), căn giữa, không bao giờ rộng full (chốt 2026-10-20, rút từ ezwallet). **Ngoại lệ:** nút hành động mang chữ trạng thái thay đổi (Swap, gửi/rút, vay: gợi ý, "At most …", lỗi) thì rộng full 361, để chữ dài không bị cắt. Hai nút trở lên trong một hàng thì chia đều chiều ngang, cách nhau 16.

## Icon

- Bộ **Lucide 1.59.0**: 2.159 icon, khung 24×24, nét 2px, đầu nét tròn, giấy phép ISC (dùng cá nhân và thương mại tự do, giữ lại thông báo bản quyền).
- Chỉ dùng các cỡ 16, 20, 24 hoặc 32. Màu icon lấy từ màu chữ hoặc `blue`. Không dùng emoji thay icon.

## File Figma

Toàn bộ quy định đã có trong file Figma `hieu`: https://www.figma.com/design/IPyKVg7ylGw1mjMRyYVrL7/hieu. Tên mỗi style đều theo mẫu `Nhóm/Tên — công dụng · thông số`, nên chỉ cần đọc tên là biết dùng ở đâu.

| Trang | Nội dung |
|---|---|
| Cover | Bìa, mục lục |
| Colors | 59 style màu: `Light/Brand/…`, `Light/Text/…`, `Light/Surface/…`, `Light/Accent/…`; bộ `Dark/…` tương ứng; `Gradient/Brand Blue` |
| Typography | 30 text style: `App/…`, `Web/…`, `Web Mobile/…`, `Slide/…`, ví dụ `Slide/Cover & Big Number — cover title, one big stat · 96/104 Bold` |
| Layout, Shadow & Gradient | Spacing, lề và lưới, `Shadow/Y2 Light` (32%) / `Shadow/Y2 Dark` (48%), quy định gradient hay solid |
| Buttons & Boxes | Component `App/Button`, `App/Icon Button`, `App/Input`, `App/Card`, `App/List Row`, bộ `Web/…` tương ứng, `Slide/Button`, `Slide/Icon Button`, `Slide/Box` |
| Templates | Khung mẫu đã gắn lưới: Mobile App 393×852, Website 1440, Website Mobile 393, Slide bìa và Slide nội dung 1920×1080 |
| Icons | 2.159 component `Icon/<tên>` (Lucide) |

Ngoài ra file có:
- 5 grid style `Grid/…`;
- 11 biến trong bộ `Spacing & Radius`: `space/8 … space/128`, `radius/16`, `radius/32`, `radius/pill`. Padding và bo góc của các component đã nối sẵn vào các biến này.
