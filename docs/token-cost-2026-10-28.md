# Chi phí token của agent (2026-10-28)

Mục tiêu của Hiếu: **giảm chi phí mà không làm kết quả đầu ra tệ đi**, và **không tốn token khi thử prompt**. Quy ước từ hôm nay: không gọi model thật để thử nếu Hiếu chưa duyệt (có nêu rõ ngân sách token). Muốn biết prompt gửi bao nhiêu token thì chạy `bun run tokens` (không gọi model, không tốn gì).

## Đo được (ngoại tuyến, `bun run tokens`)

Một lượt chat gọi model nhiều lần. Mỗi lần gọi gửi:

| Lệnh gọi | Token đầu vào | Trong đó |
|---|---|---|
| Kế hoạch (PLAN), mỗi bước | ~4.680 | lời nhắc hệ thống 1.720 + 19 công cụ 2.870 + lịch sử/trạng thái ~90 |
| Trả lời (REPLY), mỗi vòng | ~4.000 | lời nhắc hệ thống 2.900 + các ghi chú động ~950 (số liệu, hành động vừa làm) + lịch sử ~90 |

Một lượt tối thiểu = 1 bước PLAN + 1 vòng REPLY ≈ 8.700 token đầu vào. Thêm 1 bước PLAN (khi planner ghi dữ liệu và cần bước chốt) +4.700; thêm 1 vòng viết lại (khi kiểm tra bắt lỗi) +4.000. Lượt "nặng" khoảng 17.000 đến 21.000 token đầu vào.

Phần lớn mỗi lệnh gọi là **phần tĩnh** (lời nhắc + công cụ ≈ 4.600 / 2.900 token, cùng nội dung ở mọi lượt, đứng đầu yêu cầu). OpenAI tự tính giá thấp hơn cho phần đầu giống hệt các lần gọi gần nhau (prompt caching) nên chi phí thật thấp hơn con số thô. Số liệu thật (kể cả phần đã cache) lấy từ `GET /api/usage` sau khi có lưu lượng thật (chỉ ví owner đã xác minh xem được).

## Đã làm (không đổi cách agent trả lời)

- **Bỏ 2 công cụ DCA khỏi danh sách của planner khi DCA đang tắt** (`propose_dca`, `stop_dca`): giảm ~160 token ở MỖI bước PLAN (4.850 → 4.680) và bỏ một lệnh gọi chỉ để bị từ chối. Ai xin DCA vẫn nhận câu "chưa có" từ luật trong lời nhắc trả lời.
- **Thống kê từ lưu lượng thật** (`functions/_lib/stats.ts`, `GET /api/usage`, chỉ owner): mỗi ngày UTC gồm số lượt, số lệnh gọi model, số bước PLAN, số vòng viết lại, token vào/ra/đã cache, số lượt chạy bằng model dự phòng. Từ số này biết lượt trung bình tốn bao nhiêu và phần cache có hoạt động không, thay cho việc chạy thử.
- Giảm trước đó (28/10 sáng): bước kế hoạch tối đa 6, vòng viết lại tối đa 4, model trả lời chỉ thấy 10 tin gần nhất, trần 30 tin/ngày/tài khoản.

## Ứng viên giảm tiếp (chưa làm vì có thể đổi kết quả; cần chạy so sánh có ngân sách)

| Ý tưởng | Tiết kiệm ước tính | Rủi ro |
|---|---|---|
| Dừng vòng PLAN ngay sau bước 1 khi mọi công cụ đều thành công (bỏ bước chốt `no_action`) | −4.700 token ở lượt có ghi dữ liệu | Planner không còn thấy lời từ chối để thử lại / ghi tiếp |
| Bỏ hẳn PLAN với câu hỏi thuần khái niệm (kết thúc bằng "?", không số, không từ hành động/ổn định) | −4.700 ở các lượt đó | Bỏ sót một dữ kiện kể kèm câu hỏi |
| Cắt các đoạn của lời nhắc trả lời chỉ dùng có điều kiện (altcoin, tiếng Việt, từ điển thuật ngữ) và chỉ thêm khi cần | −500 đến −1.000 mỗi vòng | Quy tắc tách sai điều kiện làm mất quy tắc |
| Rút gọn mô tả công cụ ghi dữ liệu (add_holding 421, update_profile 371, add_debt 315, move 287) | −300 đến −600 mỗi bước PLAN | Planner chọn sai loại/trường |
| Chọn model nhỏ hơn cho PLAN | giá/token thấp hơn | Đã từng bỏ sót món khi kể nhiều món (gpt-4o-mini) |
| Giảm số vòng viết lại bằng cách sửa NGUYÊN NHÂN các lỗi bị bắt nhiều nhất | −4.000 mỗi vòng tránh được | Cần biết lỗi nào hay gặp: lấy từ `/api/usage` (số vòng viết lại mỗi lượt) |

## Cách kiểm chứng an toàn (đã dựng công cụ, chờ Hiếu duyệt ngân sách)

Bộ kiểm tra có sẵn `scripts/agent-eval.mjs` (49 đến 54 lượt, mỗi lượt có kiểm tra đạt/không đạt tự động) chạy với **máy chủ eval có trần token cứng**:

```
bun run eval:server -- --budget 250000      # cửa sổ 1: bản sao /api/chat, tự dừng khi đủ token
bun scripts/agent-eval.mjs http://localhost:8788 --only "tên ca"     # cửa sổ 2 (lặp --only cho từng ca)
curl localhost:8788/__stats                 # số thật đã dùng: lệnh gọi, bước PLAN, vòng viết lại, token vào/ra/cache
```

- Trần do chính máy chủ giữ, tính từ số token OpenAI báo về: đủ `--budget` thì mọi yêu cầu sau bị từ chối (429), không tốn thêm; vượt tối đa một lượt. (Đã thử bằng model giả: dừng đúng sau lượt chạm trần.)
- Chỉ dùng OpenAI (không đi qua Claude), đúng mã production, đăng nhập thật bằng token ký tại chỗ. `EVAL_FAKE=1` để thử chính công cụ không tốn gì.
- Ước tính mỗi lượt ~15.000 token đầu vào (2 bước PLAN + 1,5 vòng trả lời; chưa trừ phần cache): bộ nhỏ 12 ca (~16 lượt) ≈ 250.000; cả bộ (~54 lượt) ≈ 810.000. Mỗi thay đổi cần 2 lần chạy (trước và sau), nhưng "trước" chỉ chạy một lần.
- Tiêu chí duyệt một thay đổi: các lượt đạt/không đạt giống hoặc tốt hơn bản trước (cùng tập lượt lỗi hoặc ít hơn), số vòng viết lại mỗi lượt không tăng, token đầu vào mỗi lượt giảm.
