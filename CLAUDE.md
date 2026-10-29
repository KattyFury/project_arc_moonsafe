# CLAUDE.md

> How to work with me. Read this before every session.

Khi tôi bảo "login dự án": đọc file này → `git pull` → đọc mục **▶ Làm tiếp từ đây** trong `HANDOFF.md`. Làm xong thì commit + push. Địa chỉ contract, cách deploy, kiến trúc: xem `HANDOFF.md` và `AGENTS.md`, không chép lại ở đây.

---

## MoonSafe – luật riêng (đọc kỹ, từng làm sai)

### Bàn trước, làm sau
- **"Bàn với mình" = chỉ đưa phương án trong chat, KHÔNG sửa code.** Đưa vài lựa chọn đánh số (1a, 1b…), chờ tôi chốt rồi mới viết vào code.
- **Hỏi trước mọi thay đổi code/spec.** Sửa lỗi tôi đã yêu cầu thì làm luôn, không hỏi lại.
- **Nội dung chữ người dùng nhìn thấy** (trang chủ, lời chào agent, mô tả trang…): luôn bàn trước, không tự viết. Ngoại lệ (2026-10-22): tôi đã giao cho Claude tự soạn chữ theo giọng **chuyên gia tư vấn tài chính cá nhân**: chuyên nghiệp, gần gũi; giữ đúng giọng đó khi viết thêm.
- **Slogan = "Your personal finance agent for Web3"** (Hiếu đổi 2026-10-29: nhấn agent giúp quản lý tài chính cá nhân; câu cũ "Onchain personal finance for Web3", chốt 2026-10-24). Slogan / chữ giới thiệu phải trực quan + chân thật: nói đúng app làm gì, không hứa hẹn, không chơi chữ.
- **App chỉ còn English (chốt 2026-10-24, để thi hackathon).** Mọi chữ trên app viết bằng English; agent trả lời theo ngôn ngữ người dùng nhắn (mặc định English, nhắn tiếng Việt thì trả lời tiếng Việt xưng "mình" gọi "bạn"). Mặc định USD. Trước khi deploy chạy `node scripts/check-lang.mjs` (phải báo "English only"). Sau này sản phẩm ổn mới làm thêm ngôn ngữ, mỗi ngôn ngữ một lượt build kỹ.
- Góc nhìn sản phẩm (chốt 2026-10-22): **quản lý tài chính cá nhân onchain cho dân web3**. Lộ trình: làm rõ thu chi → tạo quỹ dự phòng → cân đối tài sản → mở khóa đầu tư. Tránh câu sến kiểu trích dẫn (ngoặc kép + in nghiêng).
- **Không ép ai khai báo. KHÔNG có thẻ/form khai báo.** Agent hỏi chuyện tự nhiên để tư vấn; số liệu người dùng kể được app tự lưu trên trình duyệt (xem ở Cân đối, sửa bằng cách nói lại với agent, xoá ở Menu). Đừng đưa lại form hay nút "Lưu khai báo" dưới bất kỳ hình thức nào.

### Thiết kế
- **Thiết kế chuẩn = Figma `WcPHEwY8xh33OvCFrxgLcQ`, section "MoonSafe · Mobile web 393" (node 38:191) và "MoonSafe · Desktop web 1440" (node 38:192)**, nav ở "MoonSafe · Components" (39:193). Tôi sửa thiết kế bằng lời, Claude sửa thẳng trong code (không vẽ auto layout cho tôi kéo tay).
- Mobile: chỉ hàng 5 tab, KHÔNG có hàng logo + ví. Desktop: thanh trên logo + tab dạng viên + ví; nội dung 1200 trên lưới 12 cột.
- **Mỗi màn phải vừa 1 khung hình (393×852 và 1440×900), không bắt cuộn.** Nhiều nội dung thì gom lại (ô số liệu cùng hàng, nút gạt chuyển tab, gộp thẻ) chứ đừng xếp dọc dài. Chat là ngoại lệ (tin nhắn tự cuộn). Đo bằng scrollHeight trước khi báo xong.
- **Phần trình bày theo design system nguyen0xhieu** (Design System artifact Rvs7H37zwuUdb8uBGf5rtM, Figma `hieu` IPyKVg7ylGw1mjMRyYVrL7): 0x Blue #1E6DF7, đen #000, font hệ thống Apple (SF Pro), chữ theo style Web / Web Mobile (14·16·20·24·32·40·48·56), bo 16, shadow Y2, khoảng cách bội số 8, gradient tối đa 1 vùng mỗi màn, icon Lucide, không emoji. Không giảm opacity cho trạng thái tắt.
- **Logo** (Figma `WcPHEwY8xh33OvCFrxgLcQ`, node 34:303 logo, 32:367 logo + chữ): khối tròn xanh ruột trắng, **hiển thị full, KHÔNG đặt trong box trắng** (box trắng chỉ dùng làm PFP X). Đứng cạnh chữ thì **logo cao = 1.5 × cỡ chữ**. Không đặt logo xanh trên nền xanh.
- **Figma là nguồn sự thật.** Thiết kế đã có trong Figma thì lấy đúng từ Figma, không tự vẽ lại.
- **Đổi giao diện lớn → chụp ảnh từng màn (393×852) bỏ ra Desktop cho tôi duyệt TRƯỚC khi deploy.** Không làm cả bộ rồi mới cho xem.

### Deploy
- Sửa thẳng trên `main` + deploy production moonsafe.app (không nhánh/preview). Push GitHub **không** tự deploy, phải chạy lệnh trong `HANDOFF.md`.
- Ví `0xEb2D…52F6` là chủ factory + nhận phí. Không tự dùng ví/DID/tài khoản khác để chạy hành động thật.

---

## Who I Am

I'm a **Vietnamese vibecoder** – I have ideas, not a programming background. I build products by handing off to AI, not by writing every line myself.

- I learn by **actually building**, not from tutorials.
- I'm **decisive and push back fast** when output is off – don't guess and make me review later.
- I **plan carefully in Claude Chat/Desktop**, then hand off to Claude Code to build step by step.
- What I build on Arc: small, useful dapps for **regular people** – simple, mobile-first, explainable in one sentence.

**GitHub**: KattyFury · **Local projects**: `D:\Files\Claude\`

---

## How to Talk to Me

- Respond in **Vietnamese**. Use English for code, technical terms, and proper nouns.
- **No filler**. **Answer directly**. Short task = short answer.
- **Don't assume I know jargon** – explain inline.
- **Multiple approaches → show options, don't pick silently.**
- **Not sure → say so, don't guess.**
- Cần thiết thì xuất spec ra Desktop để tôi đem đi plan với Claude Chat.

---

## How to Write Code

- **Think before coding**: state assumptions before writing the first line.
- **Stay in scope**: I asked to fix one function, fix one function.
- **Ask before**: big refactors, architecture changes, anything touching >3 files.
- **Simplicity first**: no "flexibility" or "future-proofing" I didn't ask for.
- **Summarize after every edit**: what changed, why.
- **Loop until verified**: don't stop at "it should work" – verify (build, chụp màn hình, đọc on-chain).
- SDK lạ (Privy, wagmi, viem…): mở `.d.ts` trong `node_modules` trước, đừng đoán.

## When Editing Existing Code

- **Touch only what you must**; match existing style.
- **Don't refactor what isn't broken**; unrelated dead code → mention, don't delete.
- **Clean up your own orphans** only.
- **The test**: every changed line must trace back to my actual request.

---

## Absolute DON'Ts

- ❌ Pick an approach silently when multiple options exist
- ❌ Write copy/design into code when I asked to discuss
- ❌ Touch files unrelated to the request
- ❌ Push to prod / run irreversible commands without explicit confirmation
- ❌ Hardcode API keys, secrets (keys ở `D:\Files\Claude\.secrets\keys.env`, `.env` không commit)
- ❌ Suggest changing the tech stack unless I ask
- ❌ Stop at "it should work" – verify

---

## HANDOFF.md

Cập nhật `HANDOFF.md` sau mỗi phiên (mục ▶ mới nhất ở trên): việc đã xong, việc chờ tôi quyết, cách làm đã thử mà hỏng.

## How to Know You're Doing It Right

- Diffs contain only what I requested
- Clarifying questions come **before** implementation, not after mistakes
- No re-suggesting decisions already made
