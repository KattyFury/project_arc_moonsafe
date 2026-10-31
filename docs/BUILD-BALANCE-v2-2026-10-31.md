# Build Balance Sheet v2 — 2026-10-31

Quyết định: mục ▶ đầu `HANDOFF.md` (2026-10-31) + `docs/SPEC-BALANCE-SHEET-v2-2026-10-30.md`. Hiếu duyệt danh sách món 2026-10-31.

## 1. Nhóm tài sản (KB `asset_types`)
- `cash`, `checking`, `stable_wallet`: idle → **safe** (SEC: tiền gửi, tiền mặt là tương đương tiền; stablecoin Hiếu chốt vào Safety).
- Mới `bond` (safe): trái phiếu, tín phiếu, quỹ trái phiếu, quỹ thị trường tiền tệ.
- Mới `junk_bond` (invest / traditional): trái phiếu lãi cao.
- `fund_bond` đổi nhãn thành "Stock funds" (traditional).
- Vault MoonSafe vẫn `fund`, ngoài 3 nhóm.

## 2. Tỷ lệ mục tiêu
- Safety = tuổi %. Phần còn lại chia Traditional / Crypto theo `cryptoSplit` (% phần còn lại vào Crypto) trong hồ sơ, mặc định 50.
- `targetMix(age, cryptoSplit = 50)`.

## 3. Công thức mốc (`bucketStanding`)
- v = giá trị hiện tại mỗi nhóm; Safety trừ khoản chi lớn 5 năm (giữ riêng) và tiền sắp chuyển vào quỹ (`leaving`).
- Mốc = nhóm có v/w lớn nhất (w > 0). Tổng ngụ ý T = v_mốc / w_mốc. Mục tiêu j = T × w_j (+ khoản chi lớn với Safety). Còn thiếu = max(0, mục tiêu − v).
- Ngưỡng: Under khi v_j/T < w_j − min(5 điểm %, 25% × w_j). Còn lại On track. `full` = On track.
- Không có gì cả → null.

## 4. Giá trị theo giá
- Khai số lượng → số lượng × giá. Khai $ cho món có giá thị trường (vàng, BTC, cổ phiếu/coin có mã) → đổi ra số lượng theo giá lúc khai, lưu số lượng (`priceSource: market`). Không có giá lúc khai thì giữ $.
- cirBTC mua trong app: dùng giá trị trên chuỗi (`cirBtcUsd`) thay cho tiền đã trả.

## 5. Bảng hỏi trong chat
- Bước 1 (dòng tiền, 2 khung nếu không vừa): khung "Your month" = cho ai, tuổi, lương, chi tiêu ("not counting debt payments"), thu nhập đều, người phụ thuộc; khung "Debt and big expenses" = nợ (còn nợ, lãi, trả/tháng), khoản chi lớn 5 năm.
- Bước 2 (tài sản, 2 khung): khung "Safety" + "Traditional", khung "Crypto" + câu chia Traditional/Crypto (50/50 mặc định).
  - Safety: Bank savings and cash ($), Stablecoins (số), Bonds, T-bills, money market ($).
  - Traditional: Gold (oz hoặc $), US stocks and ETFs (mã + số cp hoặc $), Vietnamese stocks ($), High-yield bonds ($).
  - Crypto: Bitcoin (BTC hoặc $), Other coins (mã + số hoặc $). cirBTC tự đọc.
- Agent cần số liệu quỹ (tin nhắn về quỹ / tiết kiệm) mà còn thiếu chi tiêu → gửi lại thẻ, chỉ các khung bước 1.

## 6. Màn Balance
- Bỏ ô Net worth, Can use now; giữ Emergency fund.
- Nút gạt: Split | Cash flow. Split = 3 thanh ngang (have / target, On track hoặc Under + "X to go"), ghi tỷ lệ đang dùng. Cash flow = thu, chi, trả nợ, còn dư, danh sách nợ, mục tiêu quỹ.

## 7. Agent
- Safety gồm tiền gửi, tiền mặt, stablecoin, trái phiếu; quỹ dự phòng tách riêng.
- Nói rõ chia Traditional/Crypto là lựa chọn của MoonSafe, mặc định 50/50, người dùng đổi được (lưu `cryptoSplit`).
- Số liệu ba nhóm lấy từ `bucketStanding` mới.

## Kiểm
`bun run check:all`, `bun run test:agent`, `node scripts/check-lang.mjs`, build mainnet, ảnh 393×852 từng màn.
