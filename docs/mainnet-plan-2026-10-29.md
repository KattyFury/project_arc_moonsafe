# MoonSafe lên mainnet: kế hoạch (2026-10-28, Arc Studio, theo yêu cầu của Hiếu)

Trạng thái: **kế hoạch, chưa có thay đổi mainnet nào trong code**. Hiếu đã xác nhận cảnh báo mainnet của Arc Studio. Arc Studio có thể viết/sửa mã và cấu hình tham chiếu mainnet nhưng **không triển khai, ký, nạp tiền hay giao dịch trên mainnet thay Hiếu**; mọi thứ dùng cho mainnet phải được Hiếu tự rà soát, kiểm thử, triển khai và vận hành bên ngoài Arc Studio, kèm kiểm toán độc lập.

## 1. Dữ kiện chính thức (docs.arc.io, đọc ngày 28/10; kiểm lại trước khi dùng)
| | Arc mainnet | Arc Testnet (đang dùng) |
|---|---|---|
| Chain ID | `5042` | `5042002` |
| RPC (Circle, không cần khóa) | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Explorer | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` |
| USDC | `0x3600…0000` (ERC-20 6 decimals; native 18 decimals, cùng một số dư) | giống hệt |
| cirBTC | `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` (8 decimals) | `0xf0C4…32BF` |
| Swap Kit / App Kit | chain `Arc`; SDK có sẵn cirBTC mainnet | `Arc_Testnet` |
| Gas | USDC (mainnet không có faucet; nạp qua bridge/onramp hoặc đầu mối Circle) | faucet.circle.com |
Điểm khác của Arc cần nhớ khi kiểm thử hợp đồng: blocklist của USDC được thi hành khi chạy (chuyển tới/từ địa chỉ bị chặn sẽ revert, vẫn mất gas); chuyển giá trị tới `0x0` bị cấm; `SELFDESTRUCT` và gọi tới tài khoản đã hủy có luật riêng; native value gửi vào hợp đồng không đảm bảo thành công. Dùng **Arc Foundry** (`arc-forge`, `arc-anvil`) để chạy lại bộ test, không chỉ `forge` thường.
**Chưa kiểm chứng**: thanh khoản và giá của đường swap USDC → cirBTC trên mainnet. Cần xin một báo giá nhỏ (không ký) và so với giá BTC thật; testnet từng lệch ≈ 2,6 lần.

## 2. Công việc, chia theo ai làm
**A. Arc Studio có thể làm (trên nhánh, chưa deploy, không động vào production hiện tại)**
1. Một công tắc mạng cho cả app và server (`VITE_NETWORK=testnet|mainnet`): chain ID, RPC, explorer, địa chỉ cirBTC, tên chain cho Swap Kit (`Arc`/`Arc_Testnet`), cấu hình Privy (`supportedChains`), tab tiêu đề và địa chỉ factory. Mặc định vẫn testnet.
2. Sửa chữ nhìn thấy: bỏ câu "test tokens with no real value" ở màn Before you start, bỏ mọi nhắc faucet/"Get test USDC", thêm cảnh báo tiền thật, cách nạp USDC vào ví (bridge CCTP, onramp) thay cho faucet. Chữ do Hiếu duyệt trước.
3. Hợp đồng mainnet (một lần, rồi rà soát lại): xem mục 3.
4. Công tắc khẩn cấp phía server (`KILL_SWITCH`): chặn mọi thẻ nạp/rút/mua mới nếu phát hiện sự cố (không ngăn người dùng gọi hợp đồng trực tiếp, nhưng ngừng đề nghị).
5. Hạn chế an toàn giai đoạn đầu: danh sách người dùng được mời (allowlist theo Privy), trần số tiền một lần nạp ở lớp app, nhắc ghi nhớ khóa ví (mất khóa là mất vault).
6. Tách dữ liệu: namespace KV riêng cho mainnet để hồ sơ thử nghiệm không đi theo sang tiền thật; đếm hạn mức AI riêng.
7. Runbook triển khai + bộ kiểm tra sau triển khai (mục 4), test cho mọi thay đổi.

**B. Chỉ Hiếu làm (bên ngoài Arc Studio)**
1. Kiểm toán độc lập cho hợp đồng cuối cùng (Arc Studio chỉ rà soát nội bộ, không thay thế).
2. Triển khai hợp đồng bằng ví/khóa của Hiếu, dùng keystore hoặc ví cứng (không dán khóa trên dòng lệnh), từ máy riêng bằng Arc Foundry. Kiểm kỹ địa chỉ chủ, địa chỉ nhận phí, địa chỉ implementation trước khi ký.
3. Nạp USDC cho ví triển khai (gas) và verify mã nguồn trên explorer.arc.io.
4. Quyết định pháp lý/tuân thủ cho một app đưa lời khuyên tài chính với tiền thật (hỏi luật sư theo nơi bạn hoạt động).
5. Deploy Cloudflare production cho mainnet (secret, biến `VITE_*` mainnet, tên miền), thêm origin vào Privy.

## 3. Hợp đồng: sửa một lần trước khi triển khai mainnet
Nguồn: `docs/audit-2026-10-27.md` (rà soát mức tối đa, 86 test, Slither sạch). Đề xuất gộp vào MỘT bản mới (vault cũ trên testnet không chuyển sang được):
1. **`Ownable2Step`** cho factory (gõ nhầm `transferOwnership` hiện là mất quyền vĩnh viễn). Giữ `renounceOwnership` bị tắt.
2. **Phí kiểu rút về** thay vì trả thẳng khi tạo vault: factory giữ phí, owner rút về địa chỉ thay thế được. Lý do: người nhận phí bị blocklist hoặc từ chối nhận ⇒ hiện mọi vault mới đều lỗi cho tới khi owner đổi người nhận.
3. Phát sự kiện `Withdrawn`/`VaultCreated` trước các lời gọi ra ngoài; lỗi có tham số (`InsufficientBalance(requested, available)`…); ghi chú không-nâng-cấp trong mã.
4. Quyết định thiết kế cần Hiếu chọn (mục 5): chủ factory là ví thường hay multisig; phí thật là bao nhiêu (đang 1 USDC); có muốn cơ chế khôi phục cho vault không (spec hiện nói không có admin/chuyển chủ, nên mất khóa là mất tiền).
5. Chạy lại toàn bộ test bằng `arc-forge`, thêm test blocklist và gửi value tới địa chỉ bị chặn; Slither; rà soát nội bộ mức tối đa lần nữa; rồi mới gửi kiểm toán độc lập.

## 4. Kiểm tra theo thứ tự sau khi Hiếu triển khai
1. Mã đã verify trên explorer khớp mã trong repo (chỉ khác địa chỉ immutable); chủ, người nhận phí, phí, implementation đúng như dự kiến.
2. Ví của Hiếu tạo một vault với số tiền rất nhỏ, nạp 1 USDC, rút lại; kiểm sự kiện và số dư.
3. Xin báo giá swap USDC → cirBTC cho số rất nhỏ, so với giá BTC thật; chỉ bật nút mua khi lệch nằm trong khoảng chấp nhận. Mua thử một lệnh nhỏ nếu muốn.
4. Mời 3–5 người tin cậy, giới hạn số tiền, theo dõi `/api/usage`, log Cloudflare và số lần chặn của bộ kiểm trong một tuần.
5. Sau khi có kiểm toán và dữ liệu thật: mở rộng dần.

## 5. Quyết định cần Hiếu chốt
1. **Tên miền**: chuyển `moonsafe.app` sang mainnet, hay giữ `moonsafe.app` là testnet và dùng tên miền/dự án Cloudflare mới cho mainnet (đề xuất: dự án mới, để testnet còn dùng làm môi trường thử).
2. **Chủ factory**: ví thường hay multisig (đề xuất multisig hoặc ít nhất ví cứng); địa chỉ nhận phí; mức phí.
3. **Chấp nhận danh sách sửa hợp đồng ở mục 3** không, và có muốn cơ chế khôi phục vault không.
4. **Cách mở đầu**: beta mời + trần số tiền (đề xuất) hay mở công khai.
5. **Nút mua cirBTC** bật ngay khi ra mắt hay chỉ bật sau khi kiểm giá/thanh khoản (đề xuất: sau khi kiểm).
6. **Kiểm toán**: đơn vị nào, thời gian nào; trước đó chỉ chạy testnet hoặc beta cực nhỏ.
7. DCA vẫn tắt trên mainnet đợt đầu (đã chốt thiết kế riêng, xem `HANDOFF.md` mục 7).

## 6. Có thể làm gì "ngày mai" (29/10)
Một mình ngày mai **không đủ** để ra mainnet an toàn (cần kiểm toán độc lập, triển khai và kiểm tra thật). Phần Arc Studio làm được trong ngày: A.1 đến A.7 trên nhánh, chưa deploy, kèm bộ test. Kết quả cuối ngày: một bản "sẵn sàng mainnet" nằm sau công tắc mạng, hợp đồng bản mới đã test, runbook triển khai. Việc còn lại (kiểm toán, triển khai, bật) do Hiếu quyết định sau.
