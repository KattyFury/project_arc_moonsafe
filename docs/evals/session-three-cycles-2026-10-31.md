# Ba vòng cải thiện agent — 31/10/2026

Đã chạy thật Claude Haiku qua handler `/api/chat`, dùng hồ sơ giả lập, với trần **1.000.000 token mỗi vòng**. Tổng usage do Anthropic trả về: **2.916.086 token**, gồm token đọc cache; không có usage chưa xác định. Không chạy giao dịch hoặc triển khai production.

| Vòng | Token thực dùng | API calls | Lượt hoàn chỉnh | Hội thoại hoàn chỉnh | Vi phạm trong bộ chấm cuối |
|---|---:|---:|---:|---:|---:|
| 1 | 977.902 | 95 | 38 | 12 | 11 / 129 kiểm tra |
| 2 | 972.216 | 93 | 35 | 11 | 3 / 123 kiểm tra |
| 3 | 965.968 | 91 | 39 | 12 | 1 / 143 kiểm tra |
| Tổng | **2.916.086** | **279** | **112** | **35 lần chạy hội thoại** | Không quy đổi thành điểm chất lượng |

Có **17 tình huống khác nhau đã hoàn tất**. Một số được lặp lại giữa các vòng, không phải 112 người dùng độc lập. Ba lượt cuối bị ngân sách chặn hoặc bị chặn giữa quá trình sửa câu trả lời được giữ trong raw JSON và loại khỏi lượt hoàn chỉnh. Phần dư ngân sách không đủ cho reservation của request tiếp theo nên không cố dùng đúng 1 triệu token bằng cách vượt trần.

## Đã sửa và quan sát được

- Tôn trọng yêu cầu chỉ lắng nghe, không mở form bằng tiếng Việt và giữ lựa chọn đó qua lượt tiếp theo. Vòng 1 tái hiện việc mở form trái yêu cầu; vòng 2 và 3 không tái hiện trong các tình huống chạy lại. Có thêm một cách diễn đạt mới ở vòng 3.
- Lựa chọn kế hoạch cá nhân nằm trong câu dài được áp dụng trước mặc định gia đình. Vẫn xử lý phần khai báo thu nhập trong cùng tin nhắn; sửa lương thay thế nguồn cũ, không cộng tiền vợ.
- Câu hỏi có chữ deposit không còn bị câu trả lời cố định nuốt mất. Vòng 3 kiểm tra cả đồng ý trong chat, chữ ký ví, vault đã tồn tại, USDC native không cần ERC-20 approval, và testnet không trả hóa đơn thật.
- Nhận diện cách nói “mua 0.015 BTC hết 28 triệu VND” và đính chính vốn thành 29 triệu. Giữ số lượng BTC, không biến giá thị trường 20 triệu thành vốn hoặc một tài sản mới. Vòng 2 và 3 giữ đúng trạng thái qua cả ba lượt.
- Phân biệt dữ liệu đã lưu và đề xuất chưa xác nhận. Thêm ngữ cảnh hồ sơ đã lưu và danh sách đề xuất thật vào prompt; bỏ điều kiện kiểm tra bắt nhầm cụm “recorded purchase cost” thành lời khẳng định vừa lưu dữ liệu.
- Phép trừ lương/contribution trong ví dụ được tính bằng code và đưa vào ngữ cảnh có căn cứ, không suy ra số dư ngân hàng. Vòng 2 né phép trừ; vòng 3 trả lời đúng 9 triệu. Sau đó bổ sung kiểm tra offline cho khoản góp bị phủ định, trích dẫn và khác tiền tệ.
- Vòng 3 mô phỏng xác nhận tất cả, hủy tất cả và chỉ xác nhận mục đầu tiên từ thẻ thật do handler tạo. Chỉ thao tác được duyệt được áp dụng vào hồ sơ giả lập; các kiểm tra trạng thái sau đó đều qua. Thứ tự mục trên thẻ có thể thay đổi nên bộ chấm dựa vào mục được chọn thật, không giả định vị trí cố định.

## Sửa cuối sau vòng 3

Vòng 3 vẫn nói “your emergency fund is not full” khi vault bằng 0, dù chưa xác định dự phòng ngoài app. Đây là lỗi nội dung thật, dù phần sau đã phân biệt khoản thiếu trong vault.

Câu hỏi hẹp “đã lưu gì / còn gì cần xác nhận” hiện được trả lời trực tiếp từ hồ sơ bằng `confirmationStatus.ts`, trước khi gọi model. Nó liệt kê dữ liệu đã lưu, phân biệt thông tin chưa xác lập với số 0 và chỉ mô tả số dư vault; không suy ra tình trạng toàn bộ quỹ dự phòng. Câu hỏi có khai báo số liệu, yêu cầu giao dịch hoặc nhiều tác vụ vẫn đi qua handler thông thường.

Đã replay **3/3 lượt lỗi thực tế** bằng snapshot hồ sơ trong raw trace và kiểm tra handler dùng **0 model calls** cho nhánh này. Đây là kiểm chứng code offline sau vòng 3, **không phải lần Haiku thứ tư**. Báo cáo của ba vòng giữ nguyên lỗi đã quan sát; không sửa điểm cũ để tạo kết quả đẹp.

## Giới hạn còn lại

- Câu trả lời liệt kê trạng thái hoặc có thẻ xác nhận vẫn có lúc dài; prompt giới hạn độ dài chưa được tuân thủ tuyệt đối.
- Có lượt giải thích chưa đủ tốt dù kiểm tra trạng thái qua, như tạm gọi mục tiêu chưa hoàn tất trong một nhánh xác nhận một phần. Không coi bộ chấm tự động là đánh giá ngữ nghĩa toàn diện.
- Luồng kế hoạch dựng sẵn có thể tiếp tục mời nạp sau khi duyệt dữ liệu và dùng “You have $0” để chỉ phần vault mà chưa ghi rõ trong câu đó. Thẻ không tự tạo giao dịch; cách diễn đạt/offer này vẫn cần cải thiện.
- Chưa chạy browser E2E cho thẻ thật hoặc OpenAI primary, chưa có tập holdout kín hay người chấm độc lập. Các cuộc hội thoại là tình huống phát triển được biết trước.
- Số liệu 11 → 3 → 1 là số vi phạm trong các tập kiểm tra có độ phủ khác nhau, không phải đo lường accuracy hay mức tăng chất lượng thống kê.
- Hash diff của ba lượt trả phí chỉ bao phủ file đã được Git theo dõi, chưa bao phủ module mới chưa commit. Ledger cuối có thêm manifest/hash từng file runtime, gồm cả module mới; runner đã được sửa để lưu manifest này từ các lần chạy sau. Không coi hash diff cũ là snapshot đầy đủ.

## Tự động kiểm tra lần sau

`npm run test:agent` chạy sáu suite offline: hồi quy phiên này, response/mutation, education/household/coaching, part-choice, intake-assets và offline-flow. Không dùng API key hoặc token trả phí. GitHub Actions `Agent regression` đã được thêm để chạy khi push/PR thay đổi các vùng liên quan; workflow chưa chạy trên GitHub vì chưa push.

Chạy đánh giá trả phí có giới hạn khi đã được cấp ngân sách:

```sh
npm run eval:haiku -- --live --budget 1000000 --run ten-phien-moi
node scripts/session-report.mjs ten-phien-moi
```

Credential được đọc nội bộ từ biến môi trường hoặc `.env` / `.dev.vars`; không ghi key vào report. Run label không được trùng file cũ. Harness chặn provider khác, giả lập FX/prices, không gọi dịch vụ giao dịch; usage/cache, transcript, thao tác, hash diff runtime và commit được checkpoint sau từng request.

Kiểm tra cuối: sáu suite offline, TypeScript toàn app, TypeScript handler/eval, English UI check, production build và `git diff --check` qua. Build còn cảnh báo dependency annotation và bundle lớn. Ledger/contract không thuộc thay đổi lần này; ledger cần Bun và không được đưa vào lệnh test chạy bằng Node.

Raw evidence nằm trong `session1-*`, `session2-*`, `session3-*`; ledger tổng là `session-three-cycles-2026-10-31-summary.json`, replay sửa cuối là `session-final-status-replay-2026-10-31.json`. Không commit, push hay deploy.
