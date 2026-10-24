# MoonSafe — HANDOFF

App quỹ dự phòng web3 trên Arc Testnet. Live: https://moonsafe.app (Cloudflare Pages project `moonsafe`, deploy tay — push GitHub KHÔNG tự deploy).
Spec gốc: user dán trong chat (SPEC.md, 10 mục, màn 1–10). Cập nhật lần cuối: 2026-10-24.
Khung tài chính đang chạy: **`docs/FRAMEWORK-TAI-CHINH.md`** (ưu tiên hơn mọi ghi chú cũ bên dưới về 110/120 − tuổi).

## ▶ Làm tiếp từ đây (mới nhất ở trên)

-9. **2026-10-24 (tối) — PLAN chuyển sang gpt-4o-mini (cả 2 bước giờ đều mini). ĐÃ DEPLOY.**
   - User chốt: giữ OpenAI (có token miễn phí), chỉ dùng mini cho rẻ.
   - Eval `--runs 2` (43 tình huống): mini thuần 82/86 → thêm chốt chặn ở server → **85/86** (lượt lỗi còn lại đều ở REPLY, lúc có lúc không). gpt-4o trước đó 86/86.
   - Chốt chặn mới trong `functions/api/chat.ts` (mini tự bịa, prompt không cản được):
     - `incomeStable` chỉ ghi khi người dùng nói về kiểu thu nhập (`STABILITY_WORDS`) hoặc vừa được hỏi "ổn định không" (mini ghi `true` từ "my salary is $2,000").
     - Số 0 chỉ ghi khi người dùng nói "no / none / không có…" (`SAYS_NONE`); bỏ trường đã lưu y hệt (mini ghi thu nhập 0 + nợ 0 từ "office job with a fixed salary").
     - Cổ phiếu cùng vế câu với "Vietnam / HOSE / sàn Việt…" (`VN_MARKET`) không ghi thành stock; có đúng 1 số tiền trong câu thì ghi vào otherAssets, không thì hỏi giá trị.
   - Chi phí đo (86 lượt): PLAN ~2.316 token vào / 22 ra, REPLY ~1,27 lượt × 2.089 vào / 79 ra → **≈ $0,0008 / tin nhắn** theo giá niêm yết 4o-mini ($0,15 / $0,60 mỗi 1M token), cũ ≈ $0,007 (rẻ ~9 lần).
   - **Lỗi REPLY có từ trước, CHƯA sửa (chờ user):** trả lời tiếng Việt đôi khi chèn chữ English từ bảng số liệu ("3 months of spending", "Noted."); thỉnh thoảng tự trừ ra số (đã có `ungrounded()` viết lại nhưng có lượt vẫn lọt).
   - Chạy eval local: tạo `.dev.vars` (dòng OPENAI_API_KEY lấy từ `.env`, đã thêm vào .gitignore) → `bunx vite build` → `npx wrangler pages dev dist --port 8788` → `node scripts/agent-eval.mjs http://127.0.0.1:8788 --runs 2`.
   - Deploy: token trong keys.env tên `CF_API_TOKEN` / `CF_ACCOUNT_ID`, phải export thành `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.

-8. **Cuối phiên 2026-10-24 — trạng thái để làm tiếp.**
   - **Repo đã PUBLIC** (github.com/KattyFury/project_arc_moonsafe). Trước khi đổi đã quét cả 31 commit: không có `.env`/file secret nào từng commit; 39 giá trị thật trong `keys.env` + `.env` không có trong lịch sử, chỉ trùng 3 giá trị vốn công khai (Privy App ID, địa chỉ factory). **Từ giờ mọi thứ commit là ai cũng đọc được**: secret chỉ ở `.env` / `D:\Files\Claude\.secrets\keys.env` / secret của Pages.
   - **Slogan chốt: "Onchain personal finance for Web3"** — tiêu chí của user: trực quan + chân thật (đã ghi trong CLAUDE.md).
   - **User test trên moonsafe.app** (sau deploy commit ffa9347). Chưa có phản hồi lỗi. Việc đầu phiên sau: hỏi user kết quả test, sửa theo câu thật user gửi (chạy lại đúng câu đó trước/sau).
   - **Chưa test bằng đăng nhập thật** (Claude không đăng nhập Privy được): kể tài sản với agent → Balance › Allocation; ký nạp / mua cirBTC qua thẻ trong chat; vàng cũ (đã khai theo lượng) có tự đổi sang ounce đúng không.
   - Mẹo kiểm agent bằng lệnh: gửi tiếng Việt bằng `node` (fetch), KHÔNG dùng `curl` trong Git Bash — curl làm hỏng dấu nên agent tưởng là English.
   - Dọn dẹp tuỳ chọn: `git stash@{0}` trên máy Dell (bản 3 mức + 8 USDC đã bỏ) xoá được khi chắc không cần; `server/index.ts` (server dev cũ) vẫn tiếng Việt, không dùng ở production.
   - **Não agent: GIỮ OpenAI (user chốt 2026-10-24)** — user được tặng token OpenAI miễn phí, muốn dùng GPT mini cho rẻ. Ngoại lệ của luật chung "não mặc định Claude"; đừng đề xuất đổi sang Claude nữa.

-7. **Phiên 2026-10-24 (chiều) — app chuyển sang English (thi hackathon). ĐÃ DEPLOY. Eval 86/86 (`--runs 2`, 43 tình huống, có 5 tình huống tiếng Việt).**
   - User chốt: **chỉ English** (1a), agent trả lời theo ngôn ngữ người dùng nhắn, mặc định English (2a), **mặc định USD** (3a), **vàng = giá thế giới** XAU/USD theo ounce (api.gold-api.com, dự phòng Yahoo GC=F). Sau này ổn mới thêm ngôn ngữ.
   - Gác cổng: `node scripts/check-lang.mjs` quét `src/`, `functions/`, `index.html` (bỏ comment), bắt cả chữ có dấu lẫn vài từ không dấu hay gặp ("Mua" từng lọt). Dòng cố ý giữ tiếng Việt (regex đọc tin nhắn tiếng Việt) gắn `lang-ok`. **Chạy trước mỗi lần deploy.**
   - Số hiển thị kiểu en-US (`3,200.50`), ô nhập dùng dấu chấm thập phân. Vàng lưu theo ounce (`unit: 'oz'`); vàng cũ lưu theo lượng tự đổi khi đọc (`toHolding`).
   - Agent (`chat.ts`) viết lại bằng English. Chốt chặn mới: server ghi rõ "Reply language" (trước đó lượt viết lại làm câu hỏi English bị trả lời tiếng Việt); **mọi số tiền trong câu trả lời phải có trong số liệu / lời người dùng** (`ungrounded()`, bắt chuyện model tự trừ "còn thiếu 2,800 sau khi nạp 200"); hỏi tổng quan → nợ → quỹ → phân bổ.
   - Ảnh duyệt: Desktop\MoonSafe-english-2026-10-24 (tất cả màn, mobile + desktop, đo vừa 1 khung).
   - `server/index.ts` (server dev cũ, không dùng ở production) vẫn tiếng Việt, không nằm trong check-lang.

-6. **Phiên 2026-10-24 — khung tài chính mới + biểu đồ phân bổ. ĐÃ DEPLOY moonsafe.app 2026-10-24 (ảnh ở Desktop\MoonSafe-phan-bo-2026-10-24). Eval 76/76 (`--runs 2`, chạy trên `wrangler pages dev` local).**
   - User chốt: tiền ngoài quỹ chia **An toàn (gửi tiết kiệm) / Đầu tư (vàng, cổ phiếu Mỹ, coin, cirBTC) / Nhàn rỗi (ví USDC, tiền mặt, stablecoin)**; mục tiêu an toàn = tuổi %, đầu tư = 100 − tuổi %; quỹ đứng riêng; khoá đầu tư giữ (C1); **không chặn mua vượt mục tiêu, chỉ cảnh báo** (H1); vàng giá SJC mua vào (I1); không theo dõi cổ phiếu Việt; **bỏ 110/120, 3 mức, giới hạn 8 USDC** (sắp lên mainnet). Chi tiết: `docs/FRAMEWORK-TAI-CHINH.md`.
   - Code: `src/lib/allocation.ts` (tính phân bổ, dùng chung app + `chat.ts` qua import tương đối), `functions/api/prices.ts` (vàng vang.today, Yahoo, Coinbase/Binance), `src/hooks/usePrices.ts`, `src/components/ui/AllocationPies.tsx` (2 vòng tròn; bản `compact` ở Đầu tư + chat), `FinancialProfile.holdings`. Agent: tool `record_asset` (ghi tài sản, quantity 0 = xoá) + `show_allocation`; prompt REPLY viết lại ngắn (~88 token ra/câu); chốt chặn mới: thẻ phải khớp động từ (mua ≠ nạp), nêu đủ "an toàn X%, đầu tư Y%", không nhầm phần an toàn với quỹ, không đọc lại bảng khi đã hiện biểu đồ.
   - Chi phí đo 2026-10-24: PLAN gpt-4o ~2.600 token vào → ~$0,0067; REPLY 4o-mini ~1,1 lượt × 2.300 vào / 88 ra → ~$0,0004. **≈ $0,007 / tin nhắn** (cũ ~$0,0045; tăng do schema 2 tool mới).
   - Đã đo vừa 1 màn: Cân đối (Tổng quan + Phân bổ), Đầu tư (khoá + mở khoá giả lập số dư quỹ) ở 393×852 và 1440×900.
   - `/api/prices` đã thử trên production 2026-10-24: vàng SJC, Yahoo (SPY, VOO), Coinbase (ETH, SOL) đều trả giá từ server Cloudflare.
   - **Chưa test bằng đăng nhập thật:** nhờ user kể tài sản với agent rồi xem Cân đối › Phân bổ.
   - Còn 4 thay đổi cũ (3 mức + 8 USDC) nằm trong `git stash@{0}` trên máy Dell, user đã bỏ; xoá stash khi chắc không cần.
   - Preview local: `vite.preview.config.ts` (proxy `/api` → `wrangler pages dev dist --port 8788`), đã cho vào `.git/info/exclude`.

-5. **Phiên 2026-10-22 (cuối) — thẻ giao dịch trong chat + tiết kiệm. ĐÃ DEPLOY. Eval 62/62 (`--runs 2`).**
   - **Chat là chính:** nạp / rút / mua cirBTC / DCA từ agent KHÔNG chuyển màn nữa mà hiện **thẻ xác nhận ngay dưới câu trả lời** (`src/components/chat/ActionCard.tsx`): số USDC + ≈ VND, chặn khi vượt số dư (giữ 0,02 USDC phí), cảnh báo rút dưới sàn (nút đỏ "Vẫn ký rút"), mua cirBTC = "Xem báo giá" → "Ký mua" + cảnh báo rủi ro, DCA = "Duyệt DCA". Bấm nút → ví (OKX) bật lên ký. Chỉ "mở màn …" mới chuyển màn. Hạn mức đầu tư dùng chung `src/lib/invest.ts` (`investRoom`). Đã bỏ cơ chế prefill cũ (type `Prefill`, props ở Fund/Invest/AppShell).
   - Thử trên preview (mock /api/chat): thẻ hiện đúng, vẫn ở tab Chat, chặn/cảnh báo đúng; nút ký gọi ví (ví giả không ký được → báo lỗi trong thẻ). **Chưa ký thật bằng OKX qua thẻ** — nhờ user thử nạp 1 số nhỏ.
   - Agent: không đủ tiền → khuyên tiết kiệm đều + nạp dần, server tính "để dành X/tháng thì cần ~N tháng"; giải thích vì sao cần quỹ (không có thì gặp chuyện phải bán tài sản đầu tư, có khi bán lỗ). Chốt chặn mới: >1 câu hỏi / hỏi lại "ổn định" chưa được trả lời → viết lại tối đa 2 lần, còn sót thì `tidyQuestions()` cắt câu hỏi thừa.
   - Lưu ý khi sửa `functions/api/chat.ts` bằng script Python: `\n` trong regex/chuỗi TS từng bị ghi thành xuống dòng thật → wrangler build Functions lỗi (không deploy). Sửa regex bằng Edit, chạy tsc riêng cho file này trước khi deploy.
   - **VIỆC TIẾP THEO (user đã nêu, CHƯA làm, cần bàn chi tiết):** sau khi mở khoá đầu tư, agent cho mua ngay trong chat; mua xong hiện **2 biểu đồ tròn** trong chat: trái = phân bổ vốn đầu tư hợp lý (ví dụ 25% cổ phiếu, 25% BTC…), phải = phân bổ hiện tại của user so với mức hợp lý → cho biết đi tới đâu, còn thiếu gì; user chọn mua loại nào thì agent tạo thẻ mua ngay trong chat. User: "từ từ sẽ có stock và nhiều thứ ở trên Arc, chúng ta build cho tương lai" → thiết kế cho nhiều loại tài sản, hiện chỉ cirBTC mua được (Arc swap chỉ USDC/EURC/cirBTC theo docs.arc.io; USYC chỉ cho tổ chức ≥100k USD). Cần chốt với user: mô hình phân bổ (theo tuổi/rủi ro?), các lớp tài sản hiển thị, lớp chưa mua được trên Arc thì hiện thế nào. Biểu đồ: theo skill dataviz + design system.

-4. **Bộ test agent tự động — 2026-10-22.** `node scripts/agent-eval.mjs [--runs 2] [--only tên]` đóng vai người dùng qua 26 tình huống nhiều lượt trên `/api/chat` thật (gửi `debug: true` để nhận `facts` + `notes`), tự kiểm: nhận làm thao tác không có thật, ghép VND−USDC, số tiền không có trong dữ liệu (lệch >1%), hỏi lại trường đã biết, thao tác không ai yêu cầu, ép khai báo, xưng "tôi", >1 câu hỏi, "đã ghi nhận" khi không ghi gì, "nạp để trả nợ". Bản ghi đầy đủ: `scripts/agent-eval-last.txt`. **Sửa prompt nào cũng chạy lại bộ này trước khi báo xong.** Chi phí ~$0.005/lượt (~$0.3 cho --runs 2).
   - Kết quả cuối: 56/58 lượt sạch. Còn: thỉnh thoảng hỏi lại "công việc có ổn định không" ngay sau khi người dùng hỏi sang chuyện khác; 1 lần tóm tắt tình hình quên nhắc khoản nợ.
   - Chốt chặn ở server (không chỉ dựa vào prompt): `fundFacts()` tính mọi con số tiền 2 đơn vị (ví, quỹ, thu nhập, nợ, tiết kiệm, mốc 3/6 tháng, phần thiếu, trần đầu tư theo tuổi trên tiền NGOÀI quỹ, lý do khoá); ghi chú thao tác có sẵn số 2 đơn vị; `ACTION_INTENT` bỏ thao tác UI khi tin nhắn không yêu cầu; viết lại 1 lần nếu trả lời nhận "đã mở/điền" mà không có thao tác, nêu mốc quỹ thiếu "N tháng", hoặc không nói "đang khoá" khi người dùng đòi đầu tư lúc khoá; `DECLINES` → không hỏi chuyện riêng khi người dùng từ chối. App gửi thêm `vaultUsdc`, `walletUsdc`, `cirBtcUsdc`, `fundOk`.

-3. **Agent không còn tự tính tiền — 2026-10-22.** Lỗi thật user gặp: "cần thêm 30 triệu − 1.000 USDC" (mốc tính bằng VND, quỹ bằng USDC, model tự trừ khác đơn vị). Giờ `fundFacts()` trong `functions/api/chat.ts` tính sẵn chi tiêu, quỹ đang có, mốc 3/6 tháng và phần còn thiếu theo CẢ HAI đơn vị (tỉ giá open.er-api.com, cùng nguồn với app; app gửi thêm `vaultUsdc` dạng số) → ghi chú "SỐ LIỆU QUỸ"; prompt có mục riêng "Con số tiền" cấm tự cộng/trừ/nhân/chia/quy đổi. Đã chạy lại: chưa biết ổn định + quỹ 1.000 (2/2 đúng: 30tr ≈ 1.161 USDC, thiếu 161), ổn định + quỹ 1.000 (2/2), quỹ 0 (3/3 số đúng). Prompt cũng: trường nào đã có thì không hỏi lại dù hồ sơ chưa đủ.
   - **Rút tiền bị OKX chặn (Network fee "--", Confirm mờ):** không phải lỗi contract (eth_call withdraw chạy được). Mạng Arc Testnet trong OKX trỏ RPC chết; user sửa RPC thành `https://rpc.testnet.arc.io` là rút được (vault 0x5c38… về 0, ví +1.000 USDC). Gặp lại thì bảo user kiểm RPC trong ví trước; nếu RPC đúng mà vẫn lỗi mới tính chuyện app tự truyền gas/phí/nonce.

-2. **Dữ liệu người dùng lưu theo tài khoản Privy trên server — 2026-10-22.**
   - Trước đây profile + chat chỉ ở localStorage (đổi máy / trình duyệt / xoá dữ liệu trang là mất). Giờ: `functions/api/userdata.ts` (GET/PUT) lưu `{profile, chat, updatedAt}` vào **Cloudflare KV** namespace `moonsafe-userdata` (id `f5f9fd482e3b4810898171fa71dca952`, binding `USERDATA` cho production + preview, gắn qua API, secret OPENAI_API_KEY giữ nguyên). Khoá `u:<Privy user id>`; mỗi request phải có `Authorization: Bearer <Privy access token>`, kiểm bằng `jose` + JWKS `auth.privy.io/api/v1/apps/<appId>/jwks.json` (ES256, iss `privy.io`, aud = app id).
   - Client: `src/lib/cloud.ts` (gom ghi ~1 s, lỗi thì gửi lại cùng lần ghi sau), `AppState` tải về khi đăng nhập (AppShell chờ tải xong mới hiện màn; lỗi thì dùng bản trên máy + dải báo vàng), lần đầu trên tài khoản thì đẩy bản localStorage cũ lên. `moonsafe_owner_v1` ghi chủ của bản trên máy; đăng nhập tài khoản khác thì xoá bản trên máy trước. Đăng xuất: gửi nốt, xoá profile + chat trên máy.
   - Đã kiểm: API từ chối thiếu token / token giả (401). **Chưa kiểm luồng đăng nhập thật** (Claude không đăng nhập Privy được): nhờ user chat trên máy A, mở máy B xem Cân đối + chat còn không.
   - Cân đối hiện ngay mọi số agent đã ghi nhận (không chờ đủ hồ sơ). Danh sách ví gộp trùng địa chỉ (OKX tự khai thêm là "MetaMask").

-1. **Giao diện mới theo Figma + bỏ thẻ khai báo — 2026-10-22.**
   - Thiết kế chuẩn: Figma `WcPHEwY8xh33OvCFrxgLcQ` section 38:191 (mobile 393) / 38:192 (desktop 1440) / 39:193 (nav). Code: `src/components/ui/kit.tsx` (Screen, Grid/Col 12 cột, Btn md/sm, Toggle segmented, Stats, AmountField…), `NavBar.tsx` (mobile chỉ tab; desktop logo + tab + ví). Mọi màn vừa 1 khung 393×852 và 1440×900 (đã đo scrollHeight; Đầu tư đã mở khoá chỉ dư khi hiện thông báo lỗi giá BTC).
   - **Không còn thẻ khai báo.** Agent `update_profile` → `ChatScreen.onProfileDraft` gộp vào profile và lưu luôn (localStorage). Khoá đầu tư giữ nguyên logic, chữ đổi ("Agent chưa biết thu chi của bạn").
   - System prompt (`functions/api/chat.ts` REPLY_PROMPT) = chuyên gia tư vấn tài chính cá nhân, không ép khai báo. Đã thử 1 câu thật trên live ("Lương 20 triệu, tiêu 12 triệu, không nợ…"): giọng đúng, tự ghi nhận số; lần đầu agent TỰ ĐỔI "36 triệu ≈ 1,8 USDC" (sai) + tự chọn sàn 3 tháng → đã thêm luật cấm tự đưa số USDC khi app chưa tính sẵn và nói "3–6 tháng" khi chưa biết độ ổn định; chạy lại 2 lần đều đúng. Chưa đo chi phí/câu sau khi đổi prompt.
   - Preview thiết kế trên máy: `preview.html` + `src/preview-main.tsx` (ví giả chỉ đọc, đã cho vào `.git/info/exclude`, không commit). Chạy `bunx vite --port 5299` rồi mở `/preview.html?screen=login|app|warn`.
   - `server/index.ts` (server dev cũ) vẫn còn prompt kiểu thẻ khai báo; production dùng `functions/api/chat.ts`.

0. **Sửa lỗi quay mãi sau đăng nhập — đã deploy 2026-10-22.** User bỏ Rabby, chuyển sang **OKX Wallet**. Phiên đăng nhập cũ bằng Rabby không còn ví kết nối → wagmi không có `address` → `useVault` không bao giờ `ready` → spinner vô hạn. Giờ `AppShell` hiện màn "Ví chưa kết nối" (nút Kết nối ví = Privy `connectWallet`, nút Đăng xuất) khi Privy không có ví nào, hoặc sau 8 s mà wagmi vẫn chưa có ví. Trang `scripts/deploy-factory` giờ ưu tiên OKX, rồi Rabby, rồi ví đầu tiên tìm thấy. **Chưa test bằng đăng nhập thật**: nhờ user mở lại moonsafe.app. Lưu ý: vault + quyền chủ factory gắn với địa chỉ `0xEb2D…52F6`, nên OKX phải dùng đúng địa chỉ đó (nhập seed cũ).

1. **Factory mới — XONG 2026-10-22.** `0x7E0f289d535369E582C596071b637E78E69Ac88F`, user tự ký deploy bằng Rabby (tx `0x64fc068f…b3`). Đọc onchain: owner = feeRecipient = `0xEb2D…52F6`, fee = 1e18 (1 USDC), implementation `0xd0d5…68d8`, runtime code giống hệt bản đã rà. `.env` `VITE_FACTORY_ADDRESS` đã đổi ở máy Dell (**máy kia phải sửa tay**), đã deploy moonsafe.app.
   - Factory cũ `0x358e…576f` vẫn được app đọc (`LEGACY_FACTORIES`): vault 1.000 USDC của user `0x5c38…7c72` nằm ở đó, vẫn nạp/rút bình thường. Vault mới luôn tạo ở factory mới.
   - Factory `0x506c…982a` (Arc Studio deploy, owner ví Arc Studio) bỏ, không dùng, chưa có vault.
   - Deploy lại sau này: `scripts/deploy-factory/index.html` (chạy `python -m http.server 8787 --bind 127.0.0.1` trong thư mục đó, user ký bằng Rabby).

2. **Chưa test bằng đăng nhập thật** (Claude không đăng nhập Privy được — nhờ user test):
   - Mục "Ví đang dùng" (Menu) + app ưu tiên ví Rabby hơn ví nhúng Privy.
   - Tự chuyển ví sang Arc Testnet trước nạp/rút/mua (lỗi cũ: "chain id 1 does not match 5042002").
   - Agent mở sẵn màn + điền số (thử "nạp 10 USDC vào quỹ").
   - Thẻ khai báo với nút ₫ / USDC.

3. **Đã quyết 2026-10-24:** giữ OpenAI (user có token OpenAI miễn phí, ưu tiên GPT mini cho rẻ). Không đổi sang Claude.

4. Lỗi typecheck có sẵn từ Arc Studio, không liên quan: `scripts/compass-deploy.ts` thiếu module `@circlefin/compass-chains`.

## Luật làm việc với user ở dự án này
- **Hỏi trước** mọi thay đổi code/spec (user sợ phá code). Sửa lỗi user đã yêu cầu thì làm luôn.
- Sửa thẳng trên `main` + deploy production moonsafe.app, KHÔNG tách nhánh/preview (chốt 2026-10-22).
- **Giữ giao diện Arc Studio** (kính mờ, gradient xanh, DM Sans, 5 tab trên). Đã thử áp design system nguyen0xhieu → user chê "loạn", đã trả về. Đổi UI lớn thì gửi ảnh cho user duyệt TRƯỚC khi deploy. Không dùng opacity cho trạng thái khoá.
- Slogan (user chốt 2026-10-24): **"Onchain personal finance for Web3"**, thay câu cũ "Nên đầu tư nhưng phải có đường lui.". Tiêu chí của user: slogan phải trực quan + chân thật (nói đúng app làm gì, không hứa hẹn). · Tab title: "MoonSafe" · Logo: Figma `WcPHEwY8xh33OvCFrxgLcQ` node `32:310` → `public/logo.svg`.
- Mọi thao tác của agent phải là TOOL.

## Deploy
```
bunx vite build
npx wrangler pages deploy dist --project-name moonsafe --branch main
```
Cần `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (file secret chung `D:\Files\Claude\.secrets\keys.env`). `OPENAI_API_KEY` là secret của Pages project, không nằm trong repo.
Origin mới phải thêm vào Privy dashboard → Allowed origins (đang có moonsafe.app, www, redesign.moonsafe.pages.dev — cái cuối không dùng nữa).
Máy cần `bun` (`npm i -g bun`) và Foundry (`forge`, `cast`).

## Kiến trúc chính
- `src/state/AppState.tsx`: 1 instance dùng chung cho vault / khai báo / tỉ giá / cirBTC / đơn vị hiển thị + số đã tính (`math`: sàn, % đạt, còn thiếu, mở khoá đầu tư).
- `src/state/WalletPref.tsx`: chọn ví cho wagmi — ví user chọn > ví ngoài (Rabby…) > ví nhúng Privy. Dùng `@privy-io/wagmi` **1.0.6** (khớp `@privy-io/react-auth` 2.x; bản 4.x đòi react-auth 3).
- `src/lib/chain.ts`: hỏi thẳng ví đang ở mạng nào và chuyển sang Arc trước mỗi tx (chainId của wagmi sai khi ví ở mạng lạ).
- Arc: USDC native 18 decimals; app làm việc bằng đơn vị 6 decimals (`src/lib/format.ts`). Phí factory đọc từ contract ngay trước khi ký.
- Khai báo (`types.ts` `FinancialProfile`): mỗi khoản tiền lưu đúng loại user nhập (`units`: VND mặc định / USDC); màn hình quy về đơn vị chọn ở Menu.
- cirBTC testnet `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` (8 decimals, docs Arc). Swap USDC→cirBTC qua Circle App Kit keyless. Giá BTC: `/api/price` (Coinbase, CoinGecko dự phòng — CoinGecko trả 403 từ Workers). Tỉ giá: `/api/rates` (open.er-api), lỗi thì dùng cache, không đoán.
- Không bịa số: thiếu dữ liệu hiện "–".

## Agent chat (`functions/api/chat.ts`)
Luật chi phí & độ tin cậy bắt buộc: `D:\Files\Claude\guide_personal_HF-agents-course\AGENTS.md` — **Part 3**.
- Mọi thao tác của agent là TOOL. Mỗi tin nhắn = 2 lượt gọi:
  1. PLAN (**gpt-4o-mini** từ 2026-10-24, trước là gpt-4o; `tool_choice: "required"`): bắt buộc chọn tool — `update_profile`, `record_asset`, `show_allocation`, `prepare_deposit`, `prepare_withdraw`, `prepare_buy_cirbtc`, `propose_dca`, `stop_dca`, `open_screen`, `no_action`. Server chặn mua/DCA khi `investUnlocked` = false.
  2. REPLY (**gpt-4o-mini**, chỉ có `web_search`): chỉ được kể đúng thao tác bước 1 đã làm ("đã mở sẵn", không "đã nạp").
  App nhận `actions` → mở màn, điền sẵn số tiền (VND được app quy đổi). User LUÔN tự ký; agent không ký, không chuyển tiền.
- Đo 2026-10-22: để gpt-4o-mini tự gọi tool → 0/8 thao tác, còn ghi "nạp 200 USDC" thành nợ; PLAN ép tool trên gpt-4o → 10/10 đúng tool + số tiền. Trích khai báo: gpt-4o 12/12, các bản mini 10/12.
- Số liệu trích ra chỉ điền vào thẻ khai báo, user tự bấm "Lưu khai báo".
- Trạng thái app gửi trong `context`, đặt SAU lịch sử chat; câu chào cố định chỉ hiển thị, không gửi cho model (từng làm agent hỏi lại thu nhập).
- Hết credit / sai key → trả lỗi rõ (502 + lý do), app hiện trong chat.
- Chi phí ước tính mỗi tin nhắn: PLAN ~1.500 token vào gpt-4o (≈ $0,004) + REPLY gpt-4o-mini (≈ $0,0005). Log: `plan tokens`, `reply tokens` trong Cloudflare function logs.

## Rà bảo mật contract (Arc Studio, 2026-10-22) — không có lỗi high/critical
- Medium: gửi dư phí → `createVault` revert (`RefundFailed`), vì factory chuyển hết `msg.value` cho người nhận rồi mới hoàn. App luôn gửi đúng `fee()` nên hiện không ảnh hưởng; nếu owner hạ phí lúc user đang ký thì tx đó revert.
- Low: `setFee` không giới hạn trên; `Ownable` 1 bước (gõ nhầm `transferOwnership` là mất quyền).
- Info: implementation `0xd0d5…` chưa initialize (vô hại, không delegatecall/selfdestruct); mỗi ví 1 vault, không migrate.
