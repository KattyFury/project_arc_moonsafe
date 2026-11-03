# ▶ 2026-11-03 — SỬA THEO CHAT THẬT CỦA HIẾU (ĐÃ DEPLOY)

- Nợ khai ở form có kiểu `unknown`: giờ đi theo lãi suất đã khai (từ 10%/năm mới là nợ lãi cao), không còn khoá mua cirBTC khi lãi thấp, không hỏi lại lãi đã có. Chưa có lãi thì vẫn hỏi và vẫn coi là nợ đắt.
- "No. I will consider..." được coi là từ chối như "no"; câu về kế hoạch gia đình và "1 person relying on you" viết lại.
- Hiếu chốt 8a: nếu người dùng tự kể stablecoin hoặc tiền ngân hàng trong chat và quỹ chưa đầy, kế hoạch nói một câu rằng tiền đó có thể nạp vào quỹ trước (`spareSource` trong `functions/_lib/plan.ts`), không nêu số, không ghi.

# ▶ 2026-11-03 — NÚT TẮT TRÊN Ô CHAT (Hiếu chốt 6a) — ĐÃ DEPLOY

- `src/components/chat/ShortcutBar.tsx` + `src/lib/shortcuts.ts`, kiểm bằng `scripts/shortcuts-check.ts` (trong `test:agent`). Không gọi model, có bước Confirm, lưu bằng các thao tác có sẵn; ghi một dòng vào chat qua `addNote` trong `useAgent`.
- Hiếu tạm duyệt để tự test, đã deploy Cloudflare `3b48cca0`. 3 nút theo giai đoạn (7b): `Add to fund` hoặc `Add money` · `Edit portfolio` · `Edit month`. Ảnh: Desktop `MoonSafe-nut-tat-2026-11-03`.
- Chờ Hiếu test bằng ví và tài khoản thật, nhất là lúc bàn phím điện thoại bật lên khi nhập số. Ảnh chụp từ dữ liệu giả.

# ▶ 2026-11-03 — CRYPTO: 7 PHẦN BTC, 3 PHẦN TỰ CHỌN (Hiếu chốt 1a 2b 3a, ĐÃ DEPLOY)

- Một thanh Crypto, mọi coin đều tính; 7/3 chỉ là hướng dẫn nói một lần, không theo dõi riêng; lệch là lựa chọn của người dùng, không nhắc, không khuyên bán. "Top" = top 10 vốn hoá, không tính stablecoin; agent không tự nêu tên coin ngoài BTC. Nút mua cirBTC đề nghị 7 phần số còn thiếu (`BTC_GUIDE` trong `src/kb/kb.ts`). Công thức `targetMix` không đổi. Nguồn chuẩn: `docs/CORE.md` mục 2.
- Đã thử 1,94M token Haiku trên thay đổi này, kết quả cuối `docs/evals/core-audit-2026-11-03.md`. Với người dùng viết "$7 trên mỗi $10", không viết "7 phần / 3 phần". Lỗi còn cần kiểm lại: câu mở đầu "I can't give you the split".
- App tự đọc coin EVM trong ví: Hiếu chốt 4c, để SAU hackathon. Hiện app chỉ đọc trên Arc (USDC, vault, cirBTC); mọi coin khác vẫn tự khai.

# ▶ 2026-11-03 — 5 VAI × 5M TOKEN HAIKU, ĐỐI CHIẾU CORE (ĐÃ DEPLOY)

- Báo cáo đầy đủ: `docs/evals/core-audit-2026-11-03.md` (19 lỗi đã sửa, câu chưa thử, lỗi nhẹ còn lại). Đã dùng 4.932.522 / 5.000.000 token.
- Lỗi nặng nhất: agent nói tiền ở Binance / ngân hàng / dưới gầm giường "tính vào quỹ", vì prompt và KB dạy ngược CORE 1. Đã sửa gốc và thêm chốt chặn trong `responseProblems`.
- Prompt mới chỉ kiểm trên Haiku; model chính vẫn là OpenAI gpt-5.4-mini, chưa thử bản này trên model đó. Kiểm offline: `scripts/core-audit-check.ts`.
- Hiếu giữ luật: khai bank và stablecoin mà không chọn làm Safety thì không ghi, không phải lỗi.

# ▶ 2026-11-03 — CRYPTO TỐI ĐA 50% PHẦN NGOÀI SAFETY (Hiếu chốt)

- Mặc định 50/50. Người dùng chỉ được giảm Crypto, nghiêng sang Traditional (70/30), không được làm ngược lại (40/60), vì crypto biến động mạnh, quá 50% thì cân lại rất mệt. Nguồn chuẩn: `docs/CORE.md` mục 3, hằng `MAX_CRYPTO_SPLIT` trong `src/kb/kb.ts`.
- Yêu cầu quá 50% bị server từ chối bằng câu cố định, không ghi. Tỷ lệ đã lưu quá 50% tự đọc thành 50. Biểu mẫu chỉ còn 70/30 và 50/50.
- Đã kiểm bằng test có ép tool; chưa chạy thử model thật (chưa kiểm model có luôn gọi tool khi người dùng đòi quá 50%).

# ▶ 2026-11-03 — ĐỔI MẠNG KHI VÀO APP (1a, Hiếu chốt)

- Trước đây app chỉ đổi mạng lúc gửi giao dịch. `src/hooks/useArcOnConnect.ts` (gọi trong `AppShell`) yêu cầu ví đổi sang Arc ngay khi vào app, 1 lần cho mỗi ví mỗi lần tải trang; từ chối thì không hỏi lại, giao dịch sau `ensureArcChain` hỏi tiếp.
- Đã thử hook thật + wagmi thật với ví giả (đồng ý / từ chối / đã ở Arc / ví chưa có mạng). CHƯA thử bằng OKX thật: chờ Hiếu mở app và xem popup.
- `.github/workflows/agent-regression.yml` đã push (38e7107) sau khi token `KattyFury` có quyền `workflow`.

# ▶ 2026-11-03 — DEPLOYED HAIKU CORE FIXES TO MAINNET

- User explicitly requested deployment. Cloudflare Pages moonsafe production deployment: 5b134dcc-bd5f-40f9-b879-3fe538caef2c.
- Live https://moonsafe.app verified: homepage 200, unauthenticated POST /api/chat 401, bundle /assets/index--R3BQKqW.js matches local build and contains mainnet factory 0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A.
- Predeploy check:all, test:agent (6/6), chat tsc, mainnet env gate and build all passed. No contract transactions; no changes to production secrets or data bindings.
- Deployment evidence: docs/evals/deploy-2026-11-03.json. Source changes remain uncommitted locally; push is separate from this direct-upload deployment.

# ▶ 2026-11-03 — 5 PERSONAS / HAIKU CORE EVALUATION (LOCAL, NOT DEPLOYED)

- Read docs/CORE.md first. User authorized 3M Haiku tokens including cache and separately approved sending internal prompts/tool schemas to Anthropic. Used **2,950,286 tokens**, 249 API calls; no production data or wallet execution.
- Report: docs/evals/core-five-2026-11-03.md; six raw core-five-r*.json transcripts. Cases: original p1–p5 plus focused tails in scripts/persona-cases.ts. Some runs stopped at the conservative budget guard; report distinguishes this from completion.
- Fixed allocation leakage before reserve/debt readiness; one-missing-input intake; Vietnamese “có nên” question routing; monthly parental support; “ko nợ”; parental-support stability; debt-plan recognition after percentages removed; correct starter→debt→reserve order after deposits; false ready-card claims; obsolete above/below-share prompt examples.
- CORE §3 fix: tools now accept current crypto valuation via confirmation, preserve coin quantity, and do not store purchase cost as current portfolio value. Live ETH $3,000→$2,000 confirmed correctly. Updated old tests that enforced purchase-cost behavior.
- Harness fix after report review: confirmation fixtures no longer invent a transfer from the first unrelated Safety holding. Old retiree-source totals retain that fixture limitation; see report.
- Validation: full check:all PASS (Bun via npm exec), test:agent 6/6 PASS, chat tsc PASS, eval selftest PASS. No UI/contract changes, no deployment or push. Existing untracked .github/ left alone.
- Remaining limits: fixed FX/no live prices, no browser/transaction QA; partial live tails and no exhaustive final-tree live rerun. Unsuccessful rewrites can still produce the reliable-explanation fallback. Do not report 100% CORE compliance.

# ▶ 2026-11-01 (cuối) — DỌN REPO THEO CORE

- `README.md` viết lại theo CORE (vai trò, quỹ onchain, 3 phần, luật mốc với ví dụ 30 tuổi, không theo dõi tiền nhàn rỗi, lộ trình vault ví + email), có ảnh `docs/images/` (balance mobile/desktop, invest mobile — bản Hiếu đã duyệt). Cập nhật ảnh khi đổi giao diện.
- `AGENTS.md` viết gọn lại cho mainnet (bản cũ còn địa chỉ testnet), trỏ về CORE.
- Chuyển vào `docs/archive/` (có dòng "đã thay bởi CORE"): SPEC-BALANCE-SHEET (2 bản), BUILD-BALANCE-v2, SPEC-FRAMEWORK-2026-10-25, deployment-2026-10-31.json, browser-checks.md; đường dẫn trong code/HANDOFF đã sửa.
- `docs/AGENT-FRAMEWORK.md` và định nghĩa nhóm `safe` / `idle` trong `src/kb/moonsafe-kb.json` sửa theo CORE (bỏ "giá vốn", bỏ "tiền nhàn rỗi lấp Safety"); `docs/vault-recovery-spec.md` thêm ghi chú hướng 2-of-2.
- Đã deploy (chỉ server/nội dung; giao diện không đổi).

# ▶ HANDOFF 2026-11-01 (kết thúc ngày) — LÀM NỐT, ĐÃ DEPLOY Cloudflare `6210e61b`

Live = bundle giao diện `index--R3BQKqW.js` (đã Hiếu duyệt) + server mới nhất. Hiếu: luật mốc cho người 55 tuổi (Crypto "còn $158k") là **hợp lý**, giữ nguyên.

Làm nốt (dùng thêm ~349k token Haiku, `docs/evals/balance-r3`, `balance-r4-2026-11-01.json`; ca `BALANCE_TAIL_CASES`):
- Đổi tỷ lệ Traditional/Crypto trong lượt này → **server tự xác nhận** "Done: outside Safety your split is now Traditional X% / Crypto Y%, as you chose" (+ cảnh báo khi Crypto ≥ 80%); model hai lần nói "already set" dù vừa đổi.
- "Track my bank account" → chặn bằng code (`responseProblems` trong chat.ts): trả lời không theo dõi tiền nhàn rỗi rồi dừng, không gợi ý biến tiền đó thành Safety. Haiku r4 đúng.
- Phần 0% (split 0/100) nói "not in your split" thay vì "$0 of $0: full" (lời agent + câu viết sẵn). **Màn hình** vẫn hiện "$0 of $0 / Full" cho phần 0% — đổi chữ trên màn hình thì chụp ảnh cho Hiếu duyệt trước.
- Người 55 tuổi (r3): trả lời đúng về tiền gửi đáo hạn và cái giá của việc chỉ giữ tiền gửi; không còn câu lạ.
- Tổng token Haiku cho đợt 5 người: ~2.26M.

# HANDOFF 2026-11-01 (khuya nhất) — LUẬT MỐC ĐÃ DEPLOY + TEST 5 NGƯỜI × 2M TOKEN HAIKU (Cloudflare `c9506894`)

**Đọc `docs/CORE.md` trước.** Hiếu đã DUYỆT màn hình "phần đi xa nhất làm mốc" và nó đang live (bundle `index--R3BQKqW.js`, deploy `fe46f621`, rồi `c9506894` chỉ đổi server/agent).

Test: `scripts/balance-cases.ts` (b1 người mới chưa đầu tư — đi trọn luồng; b2 dồn hết crypto; b3 gia đình VN có học phí, không thích crypto, chọn 80/20; b4 55 tuổi gần như toàn tiền gửi/trái phiếu; b5 thu nhập không đều 2 con, đổi ý, đòi track bank, thử 0/100). Đã dùng 1.914.053 token: `docs/evals/balance-r1a/r1b` (tìm lỗi), `balance-r2a/r2b` (sau sửa).

**Hiếu dặn thêm:** chưa đầu tư → nói tỷ lệ 3 phần rồi cho bổ sung từ từ; đã có tài sản → dựa vào đó mà bổ sung. **Tiền bank / stablecoin KHÔNG BAO GIỜ mặc định là Safety** — chỉ khoản user tự nói là Safety.

Lỗi tìm ra → đã sửa (r2 thấy đúng):
1. Người mới nạp đủ quỹ mà không có tỷ lệ (khối "sau khi ký" đòi `balance.declared`) → bỏ điều kiện; `splitSection` chưa có gì thì nói "mỗi $100: $24 Safety, $38 Traditional, $38 Crypto"; câu "$200 bỏ đâu" chia đúng $48/$76/$76.
2. Agent tự chọn phần bổ sung trước (có lúc sai), gọi Safety là "tiền gửi", gọi tiền gửi là "đầu tư" → dặn: thứ tự do user, chỉ gọi Safety/Traditional/Crypto.
3. Giải thích sai mục tiêu học phí trong Safety → dữ kiện nói rõ Safety đã gồm goal.
4. "Track my bank account" → agent từng nói "record as money not doing anything yet", rồi gợi ý biến nó thành Safety → giờ chỉ nói "không theo dõi tiền nhàn rỗi", không gợi ý.
5. "BTC up 50%, am I over?" trả lời kiểu "above its share" → nothing is over, phần lớn lên thành mốc mới.
6. Đổi split 0/100 đã lưu mà agent nói "already set, no change" → `done` báo rõ vừa đổi.
7. "Already Safety: USDT… pays a steady return" → bỏ "pays a return".
8. **Lỗ hổng Safety mặc định:** chữ "safety" ở bất kỳ đâu trong tin làm mọi khoản bank/stablecoin thành Safety → `saysSafetyFor` (chat.ts) chỉ nhận khoản nằm cùng mệnh đề với chữ Safety ("3000 in bank, and 5000 USDT is my safety" → chỉ USDT). Có test.
9. Dòng trống thừa khi chưa có gì trong 3 phần; `pickQuestion([])` không còn nói "All three parts are at their targets".

Còn để ý (chưa sửa): b4 55 tuổi toàn Safety $400k → luật mốc cho Crypto "còn $158,636" (agent có nói "không bắt buộc"); một câu lạ "it would not be protected by them when they fall". Lượt cuối của b4 và b5 (0/100) bị cắt vì trần token.

# HANDOFF 2026-11-01 (đêm) — CORE + BẢNG CÂN ĐỐI "PHẦN ĐI XA NHẤT LÀM MỐC" (đã duyệt + deploy, xem mục trên)

**Đọc `docs/CORE.md` trước** (nguồn chuẩn, Hiếu chốt hôm nay; đúng hơn mọi spec cũ). CLAUDE.md đã trỏ tới nó.

**Trạng thái:** code đã commit + push lên `main` nhưng **CHƯA deploy**. Live moonsafe.app vẫn là bản trước (`bdb40fb5`, bundle `index-jV-RzWK8.js`). Ảnh để Hiếu duyệt: Desktop `MoonSafe-moc-2026-11-01` (balance/invest × 393/1440, đều vừa 1 màn). Hiếu bảo "deploy" thì chạy lệnh deploy mainnet ở mục ▶ MAINNET bên dưới, kiểm bundle chứa `A9A5447a` + trang 200 + `/api/chat` 401. Hai thư mục ảnh `MoonSafe-ty-le-*` trên Desktop là bản % đã bỏ.

**Luật mới (Hiếu chốt 2026-11-01, đã code):**
- **Mốc:** phần đi xa nhất so với tỷ lệ tuổi (tiền / tỷ lệ lớn nhất) là thanh đầy; thanh đầy các phần khác theo nó. 30 tuổi, Safety $3.000 dẫn → Traditional và Crypto đầy ở $3.500. Màn hình: "$1,000 of $3,500", "$2,500 to go" / "Full"; phần mốc "Full, it sets the size". **Không % trên từng phần, không tổng 3 phần = 100%** (Hiếu chê cả 2 cách đó khó hiểu / làm một phần luôn thiếu). Không phần nào vượt thanh → không bao giờ khuyên bán. Code: `bucketStanding` (`src/lib/allocation.ts`, field `anchor`), `shareLine` / `splitSection` / `buildStanding` (`functions/_lib/plan.ts`), `AllocationPies.tsx`, `InvestScreen.tsx`, dòng "Where they stand" cho agent trong `chat.ts`.
- **Không theo dõi tiền nhàn rỗi:** tiền mặt / bank không kỳ hạn / stablecoin chỉ được ghi khi user giữ làm Safety (`add_holding` chặn, `detectPlacement` trả null, câu hỏi bank/stablecoin thay bằng 1 câu "có để riêng làm Safety không"); bỏ dòng "Not placed yet", bỏ câu "this wallet shows X USDC, say how much is yours". Lệnh nạp quỹ vẫn tính theo số dư ví onchain, không bị ảnh hưởng.
- Cách tính cũ trong ngày (Safety đo theo phần đầu tư, chia tiền nhàn rỗi `splitIdle`) chỉ còn code phụ, màn hình và agent không dùng nữa.
- Kiểm: `check:all`, `test:agent` (6/6), tsc chat, check-lang đều qua. **Chưa chạy Haiku** với luật mốc mới.

**Việc tiếp theo:** (1) Hiếu duyệt ảnh → deploy. (2) Chạy lại vài ca Haiku (`scripts/claude-reeval.ts`, ca `persona-*`, `safety-*`) để xem agent nói đúng luật mốc và không hỏi tiền nhàn rỗi. (3) Vault v3 (ví + email 2-of-2) làm SAU hackathon khi có mini grant — xem CORE §6.

# ▶ 2026-11-01 (khuya, phần cuối) — HOÀN TẤT VIỆC DANG DỞ (ĐÃ DEPLOY Cloudflare `bdb40fb5`)

Dùng thêm ~448k token Haiku (`docs/evals/persona-r3/r4/r5-2026-11-01.json`; ca nạp sẵn hồ sơ `PERSONA_TAIL_CASES` + `p5-sold-en` trong `scripts/persona-cases.ts`).
- Đã thấy đúng bằng Haiku: tuổi "40, …, wife works too" được ghi; "keep 10,000 of the current account as Safety" tách đúng 10,000; phần vượt tỷ lệ nói "above its share" (bỏ "X of X"); hỏi người về hưu "is your income…" (thay "pay").
- Sửa thêm từ lượt chạy lại: "i sold some eth" từng đề nghị XOÁ cả ETH → bán một phần mà không nói số thì không xoá, hỏi 1 câu (`PART_OF`); câu trả lời "about 1000 worth" cho câu hỏi "bán bao nhiêu" giờ ra thẻ "ETH now $2,000 (sold $1,000)" (trước: nói "noted" mà không ghi gì); câu trả lời mục tiêu quỹ ghi $ thay vì USDC.
- Test offline mới trong `response-quality-check.ts` cho mọi lỗi trên.

# ▶ 2026-11-01 (khuya) — 5 VAI × 2M TOKEN HAIKU + SỬA (ĐÃ DEPLOY Cloudflare `f6a68b93`)

Ca: `scripts/persona-cases.ts` (p1 freelancer nợ thẻ 24% muốn all-in BTC, p2 bố một con cháy future + nợ bạn (VN), p3 về hưu 63 tuổi số lớn, p4 sinh viên không lương (VN), p5 người nói mơ hồ / đổi số / thử lừa agent). Đã dùng ~1.89M token: `docs/evals/persona-r1a/r1b/r2a/r2b-2026-11-01.json` (r1 = tìm lỗi, r2 = chạy lại sau sửa).
Sửa (đều đã thấy đúng ở r2, trừ ô ghi chú):
1. **Prompt cache hỏng**: adapter Claude gộp mọi system message thành 1 khối, dữ kiện thay đổi làm vỡ cache → mỗi lần gọi trả full ~11k token. Giờ system = khối, khối đầu (prompt cố định) có `cache_control` (`functions/_lib/llm.ts`). r1b: 301k/424k token đọc từ cache.
2. Số không đơn vị thành VND ("Term deposits 200,000" → 200,000 VND, VOO "$12") → chỉ VND khi user nói vnd/đồng/triệu/tr/nghìn/₫ (`SAYS_VND`).
3. "avg maybe 2500" bị coi là không chắc → thu nhập freelancer không ghi (`recordingEvidence`: "maybe + số" = ước lượng).
4. Tiền trả nợ "already in the 3.5k" bị cộng 2 lần (quỹ $31.800 → $21.000) (`INCLUDED_IN_SPENDING`).
5. "btc 0.1" không ghi (`quantityEvidence` nhận coin trước số khi số lẻ / < 100).
6. Prompt còn luật cũ "hỏi đã bỏ bao nhiêu" (giá vốn) → theo giá trị hiện tại.
7. "airdrop 500$, chia sao" ra thẻ nạp 500 khi ví 150: lời từ chối có chữ "lệnh nạp" bị coi là lời mời (`OFFERED_DEPOSIT` cần `**`), câu hỏi chia tiền (`SPLIT_QUESTION`) không bao giờ thành thẻ, thẻ nạp không vượt số ví (`spendable`).
8. "ok lets start the starter fund then" không ra thẻ → `MAKE_ORDER` nhận "let's start / nạp đi".
9. Câu máy "Chưa đủ dữ liệu về chi tiêu…" khi chỉ thiếu độ đều thu nhập → nói thiếu đúng 1 điều + hỏi 1 câu.
10. (chưa chạy lại Haiku, có test offline) "keep 10,000 of the current account as Safety" chuyển cả 20,000: lệnh chuyển ô của model lọt chốt chặn + thẻ confirm_items xoá thẻ ghi lại.
11. Tuổi "40, salary…, wife works too" bị bỏ (chặn nhầm tuổi vợ) → số mở đầu tin = tuổi người viết.
Tốt sẵn: p2 từ chối gỡ x20, khuyên không vay app tín dụng, nói với vợ; p5 từ chối "ignore your previous instructions… BTC as Safety"; không khuyên bán VOO.
Còn để ý: p3 sau khi nạp quỹ trả lời "Traditional $300,000 of $300,000, already above its share" (câu hơi tự mâu thuẫn); về hưu được hỏi "is your pay about the same every month?" (nên nói "income").

# ▶ 2026-11-01 (khuya) — DỮ LIỆU 5 Ô, LUÔN XÁC NHẬN (Hiếu chốt, ĐÃ DEPLOY Cloudflare `55642103`)

- **Cách lưu (không đổi):** mỗi user 1 bản ghi KV `u:<Privy id>` (hồ sơ + chat), trình duyệt giữ bản sao; tài sản là danh sách món, ô tính từ loại + nhãn Safety. Quỹ dự phòng đọc onchain, không lưu.
- **5 ô** (Hiếu chốt): Dự phòng (vault onchain) / Safety / Traditional / Crypto / **Chưa xếp** (tiền mặt, bank, stablecoin chưa chọn làm Safety). Màn Balance đã có đủ 5 (thẻ quỹ + 3 thanh + dòng "Not placed yet").
- **Luôn hỏi xác nhận:** mọi thay đổi tài sản (thêm / sửa / chuyển ô / xoá) đi qua thẻ `confirm_items`, kể cả khai lần đầu và 1 món (bỏ "khai lần đầu lưu luôn"); thông tin không phải tài sản (tuổi, thu chi) đi cùng thẻ khi có thẻ.
- **Chuyển ô:** `set_holding` có `box: safety | unplaced` (chỉ món nhàn rỗi, phải có chữ Safety/an toàn trong lời user; vàng/cổ phiếu/coin bị chặn); `add_holding` nhận `category: 'safe'` cho món nhàn rỗi user nói là Safety.
- **Lệch thực tế:** user kể thay đổi (mua thêm / bán / rút / chuyển + tên tài sản) mà không có số → không ghi, hỏi đúng 1 câu (`HOLDING_CHANGE` trong chat.ts). Số cũ lâu: pattern `stale_data` có sẵn (hỏi 1 món cũ nhất).
- Test: thêm 5 kiểm tra trong `response-quality-check.ts`; offline-flow/education-eval đọc ops trong thẻ (`proposed`).
- Chưa thử bằng Haiku/tài khoản thật (đã dùng gần hết 1M token ở lượt trước).

# ▶ 2026-11-01 (khuya) — TEST 1M TOKEN CLAUDE HAIKU + SỬA (ĐÃ DEPLOY Cloudflare `7371f931`)

Hiếu cho 1M token Haiku. Đã dùng 962.709 token (3 lượt, trần cứng mỗi lượt): `docs/evals/safety-r1/r2/r3-2026-11-01.json`. Ca mới `scripts/safety-cases.ts` (đúng chat thật của Hiếu, chỉ có bank VN, đã đầu tư nặng crypto, 2 ca nạp sẵn hồ sơ). Script `claude-reeval.ts` có thêm `@sign-deposit`, `@deposit N`, `@confirm-record`, `profile`/`wallet`/`vault` theo ca; `@review-all` không thấy thẻ thì bỏ qua.
Lỗi tìm ra → đã sửa + có test:
1. "keep 5 USDC as Safety" xác nhận xong vẫn Safety $0: `normalizeProfile` xoá `category` của món không phải "other" → giữ `category: 'safe'` cho món nhàn rỗi.
2. Prompt còn câu cũ "Safety = bank savings or flexible earn" (4 chỗ chat.ts) → sửa theo luật mới.
3. Số "$5.2" → "$5.20".
4. Thẻ ghi lại đề xuất nguồn "Bank savings" cho USDC → ưu tiên nguồn cùng loại.
5. "Mình vừa gửi tiết kiệm có kỳ hạn 2000$ làm safety" không hiện thẻ → model tự thêm $2.000, tính trùng → thêm `PLACE_VI_AS`, từ VN (kỳ hạn, trái phiếu, ngân hàng, tiền mặt).
6. Crypto vượt tỷ lệ bị agent gọi "on track at $21,000 of $21,000" → facts + `buildStanding` nói "above its share".
7. "keep $2,000 in your account for bills" khi tiền nằm ở Binance Earn → "keep $2,000 of it for bills".
Đúng sẵn: không gọi bank/stablecoin là Safety, "Ok. But who said…" không sinh thẻ nạp, Safety ≠ quỹ dự phòng, tiền gửi kỳ hạn bị khoá, vàng không làm Safety, không khuyên bán, không ra lệnh mua bao nhiêu.
Còn để ý (chưa sửa, chưa rõ là lỗi): người mới khai tài sản lần đầu bằng tiếng Việt thì kế hoạch do model viết thay vì `buildPlan` (nội dung vẫn đúng luật).

# ▶ 2026-11-01 (khuya) — NGƯỜI DÙNG QUYẾT SAFETY (Hiếu chốt, ĐÃ DEPLOY Cloudflare `2f962d5e`, sửa định nghĩa Safety sau đó) — sửa mục ngay dưới

- **Vai trò app (Hiếu):** app là người đảm bảo quỹ dự phòng (onchain, phải đầy trước); sau đó chỉ TƯ VẤN, không yêu cầu; user tự quyết rồi báo lại để app ghi và nắm.
- **Safety ≠ quỹ dự phòng** (Hiếu sửa): Safety = phần rủi ro thấp của tài sản (tiền gửi, trái phiếu; SEC Investor.gov asset allocation): lời ít nhưng đều, không chạy theo cổ phiếu/crypto, giúp tổng tài sản dao động ít hơn. KHÔNG phải tiền khẩn cấp, KHÔNG phải "rút lúc nào cũng được" (tiền gửi có kỳ hạn bị khoá đến đáo hạn). Đã sửa mọi câu cũ "reach any time" trong plan.ts, chat.ts, InvestScreen.

- **User tự chia, app không chia hộ**: kế hoạch chỉ ghi mỗi phần "$X of $Y, $Z to go" (hoặc on track / above its share), KHÔNG còn "Put $X into Safety first" hay "add $X". User đặt tiền rồi báo lại để ghi.
- **Một khoản chỉ là Safety khi user hiểu vì sao cần và tự chọn** tiền nào, dạng nào. Kế hoạch giải thích Safety trước mọi con số. Dạng được chọn: chỉ loại ít biến động (bank, tiền mặt, stablecoin, tiền gửi có kỳ hạn, trái phiếu); vàng/cổ phiếu/coin làm Safety → agent giải thích vì sao không và KHÔNG ghi (`detectPlacement` trả null).
- Tiền gửi có kỳ hạn / trái phiếu đã có: vẫn tính thẳng Safety nhưng phải giải thích vì sao ("Already Safety: … which is exactly Safety's job").
- Code: `Holding.category = 'safe'` trên món nhàn rỗi = user chọn làm Safety (`categoryOf`, `canBeSafety` trong `src/lib/profile.ts`); "I keep 5 USDC as Safety" → thẻ xác nhận tách 5 USDC sang món "Stablecoins kept as Safety" (`RecordRequest.safety`, `src/lib/record.ts`); `splitSection` viết lại.

# ▶ 2026-11-01 (tối) — LUẬT CHIA TIỀN MỚI (Hiếu chốt, ĐÃ DEPLOY Cloudflare `a6d60f54`)

Lỗi gốc (chat thật): khai "$10 bank, $10 stablecoin, $10 vàng" → agent nói "Safety $20 = on track" và lấy Safety làm mốc ("phần đi xa nhất"); rồi "Ok. But who said my safety is 20$" sinh lệnh nạp 20 USDC. Luật Hiếu chốt (thay quy tắc "mốc" của Balance Sheet v2):
- **Tiền mặt, tài khoản bank không kỳ hạn, stablecoin (kể cả earn) = TIỀN NHÀN RỖI**, không bao giờ gọi là Safety. KB: `cash, checking, savings, stable_wallet, flexible_earn, locked_earn, defi_stable` → category `idle`. **Safety = tiền gửi có kỳ hạn, trái phiếu chính phủ/quỹ trái phiếu/quỹ thị trường tiền tệ** (`term_deposit`, `bond`) — có sẵn thì tính thẳng Safety.
- **Quỹ dự phòng onchain đầy mới tư vấn đầu tư** (quỹ phải nằm vault để agent tin được, người dùng không bịa được). Quỹ chưa đầy: kế hoạch chỉ có quỹ + "Investing comes once the fund is full", chọn phần nào cũng trả về quỹ (`fundFirst`). Nạp đầy quỹ → `buildAfterSign` hiện luôn phần đầu tư.
- **Đầu tư làm gốc**: Safety cần = (Traditional + Crypto) × Safety% / (100 − Safety%). Tiền nhàn rỗi (sau khi giữ 1 tháng chi tiêu — luật cũ spec 5.4, quỹ, nợ lãi cao, mục tiêu gần) lấp Safety trước, phần dư chia theo tỷ lệ; trong phần đầu tư thì vào Traditional/Crypto bên nào đang thiếu so với tỷ lệ trước. Chưa đầu tư gì → chia thẳng theo tỷ lệ ($10.000 bank ở tuổi 20 → $2.000/$4.000/$4.000).
- **Không khuyên bán**: phần vượt tỷ lệ = "Above its share, no need to sell", tiền mới vào phần khác.
- Code: `splitIdle` / `splitOf` / `bucketStanding` trong `src/lib/allocation.ts` (bỏ `anchor`, thêm `over`, `add`); `splitSection`, `fundFirst`, `buildPlan` trong `functions/_lib/plan.ts`; off_target (`src/kb/facts.ts`) chỉ tính khi quỹ đầy + hết nợ lãi cao, sau khi chia tiền nhàn rỗi; "as Safety"/"bond" khi ghi lại → `term_deposit`/`bond` (`src/lib/record.ts`).
- Chốt chặn lệnh nạp (`chat.ts`): câu hỏi (có ? + số hoặc who/why/what…) không sinh thẻ nạp; số nạp lớn hơn phần quỹ còn thiếu bị bỏ trừ khi người dùng nói "deposit".
- Kiểm: `check:all`, `test:agent`, tsc chat đều qua; chạy lại đúng ca của Hiếu: `bun scripts/replay-hieu-2026-11-01.ts`.
- Chưa làm: chưa thử bằng tài khoản thật sau deploy; dữ liệu cũ đã lưu (bank = `savings`) tự chuyển sang nhàn rỗi, không cần migrate.

# ▶ 2026-11-01 — bảng thu chi quay lại + kế hoạch nợ lãi cao

- **Bảng hỏi thu chi quay lại** (Hiếu: hỏi bằng lời khó dùng). Câu 1 = 1 câu ngắn + bảng `intake_form` chỉ phần dòng tiền (`cashflowKeys`: tuổi, lương, chi, đều không, khoản thu lâu lâu như airdrop, người phụ thuộc, nợ, khoản chi lớn 5 năm). 1 khung: từ md trở lên 2 cột (Income and spending | Debt and big expenses), mobile 1 cột cao được; hàng 48px. Đo: 1440×900 và 1024×900 bảng cao 556px, không cuộn; ảnh ở Desktop `MoonSafe-form-2026-11-01`. Câu 2 (tài sản + tỷ lệ chia) vẫn hỏi bằng lời, gửi ngay sau khi lưu bảng. Hỏi quỹ dự phòng mà chưa biết chi tiêu → gửi lại bảng.
- **Nợ lãi cao trả trước** (Hiếu chốt): `buildDebtPlan` trong `functions/_lib/plan.ts` theo thứ tự KB: quỹ khởi đầu 1 tháng chi → trả nợ lãi cao (tiền lãi/tháng, bao lâu hết nếu dồn cả phần dư) → hoàn tất quỹ dự phòng → chia theo tuổi. Lời mời nạp quỹ khởi đầu. Nợ chưa rõ lãi, hoặc chưa rõ loại mà lãi dưới 10%, vẫn để agent hỏi trước.
- Hoãn sang v2 (Hiếu 11-01): bất động sản, bảo hiểm tích luỹ, tiền cho vay, vốn doanh nghiệp, NFT — xem "Để tính ở v2" bên dưới.
- Ưu tiên hiện tại của Hiếu: app mượt lại như cũ.

# ▶ Balance Sheet v2 — ĐÃ BUILD + DEPLOY 2026-10-31 (Cloudflare `442d5078`, main `c0e6f8c`)

Spec build: `docs/archive/BUILD-BALANCE-v2-2026-10-31.md`. Đã làm: công thức mốc (`bucketStanding`: mục đi xa nhất theo tỷ lệ làm mốc, ngưỡng 5/25, On track / Under), Safety = tiền gửi + tiền mặt + stablecoin + trái phiếu (KB: `cash`/`checking`/`stable_wallet` sang safe, thêm `bond` safe + `junk_bond` traditional), tỷ lệ Traditional/Crypto do người dùng chọn (`profile.cryptoSplit`, tool `crypto_split`, mặc định 50, agent nói rõ là mặc định của MoonSafe), cirBTC tính theo giá trị trên chuỗi, màn Balance bỏ Net worth / Can use now, nút gạt Split | Cash flow (thu, chi, trả nợ, từng khoản nợ, mục tiêu quỹ).
- **Khai báo = E2 (Hiếu chốt sau khi chê bảng hỏi dài):** KHÔNG còn bảng hỏi. Server tự soạn 2 câu (`functions/_lib/intake.ts`): (1) `cashflowAsk` hỏi cả tháng 1 lần (tuổi, thu nhập + có đều không, khoản thu lâu lâu như airdrop, chi tiêu chưa tính nợ, người phụ thuộc, nợ); (2) `assetsAsk` ghi lại những gì đã nghe + mục tiêu quỹ + tiền quỹ lấy từ đâu (dư tháng / airdrop) + hỏi tài sản bằng lời + tỷ lệ chia + hỏi bù "lương có đều không" nếu bỏ qua. Câu 2 gửi 1 lần trước kế hoạch; khai tài sản sau đó đi qua thẻ xác nhận. Hỏi về quỹ mà chưa biết chi tiêu → gửi lại câu 1 (tối đa 2 lần).
- Bảng hỏi cũ (`IntakeFormCard`, `formToItems` có $/số lượng) vẫn còn trong code để hiện các thẻ cũ đã lưu trong lịch sử chat; server không gửi nữa.
- Kiểm: `check:all`, `test:agent`, tsc 3 cấu hình, check-lang, build mainnet đều qua; ảnh 393×852/1440×900 ở Desktop `MoonSafe-balance-v2-2026-10-31` (ảnh bảng hỏi là bản cũ đã bỏ).
- **Đã thử bằng Claude Haiku thật** (Hiếu nhờ, khỏi test tay): 3 cuộc chat `scripts/e2-intake-cases.ts` (đúng câu Hiếu gõ, 1 người EN, 1 người khai VND), chạy `bun scripts/claude-reeval.ts --live --budget 400000 --run <tên> --only e2-hieu-vi,e2-en,e2-vnd` với ANTHROPIC_API_KEY từ keys.env; kết quả `docs/evals/e2-intake-2026-10-31*.json`. Lượt 1 lộ lỗi, đã sửa + deploy `442d5078` (main `c0e6f8c`): câu 2 bị chặn bởi thẻ biểu đồ / câu nhắc thua lỗ; "25 tuổi … chưa vợ" bị bỏ tuổi; "lương đều" không được hiểu là ổn định; "5tr USDT" đọc thành 5,000 USDT; "nợ Nợ mẹ". Lượt 2–3 đúng hết.
- Còn ngỏ: người có nợ ưu tiên (thẻ tín dụng 22%) sau khi xác nhận tài sản thì kế hoạch do model viết (buildPlan trả null khi có nợ ưu tiên), Haiku trả lời hơi chung chung "Next, I'll walk you through your plan" — chưa sửa.
- File CI `.github/workflows/agent-regression.yml` (Codex) chỉ nằm trên máy Dell: token GitHub thiếu quyền `workflow`; muốn đẩy thì `gh auth refresh -s workflow` trên máy tính. Không bắt buộc, app không cần.
- **Làm tiếp:** (ca nợ ưu tiên đã làm 11-01, xem ▶ trên cùng) các mục "Để tính ở v2" bên dưới (bất động sản, bảo hiểm tích luỹ, tiền cho vay, vốn doanh nghiệp, NFT) cần tư vấn theo nguồn chuẩn rồi Hiếu chốt trước khi code.

# Balance Sheet v2 — Hiếu chốt thêm 2026-10-31 (quyết định, nền cho bản build ở trên)

Bổ sung/sửa `docs/archive/SPEC-BALANCE-SHEET-v2-2026-10-30.md`. Nguồn chuẩn đã dùng: SEC Investor.gov "Beginners' Guide to Asset Allocation" (3 nhóm stocks/bonds/cash; cash equivalents = savings deposits, CDs, treasury bills, money market deposit accounts, money market funds; real estate/precious metals = nhóm khác) và quy tắc "age in bonds" của Bogle ("crude starting point", không phải luật).

**Dòng tiền + nợ = 1 cụm (đảo mục "hoãn dòng tiền" của spec v2):**
- Bảng hỏi 2 bước: (1) dòng tiền: lương, chi tiêu (KHÔNG gồm trả nợ), thu nhập đều?, người phụ thuộc, nợ (còn nợ / lãi / trả mỗi tháng), khoản chi lớn trong 5 năm; (2) tài sản. Bước nào không vừa 393×852 thì tách thành 2 khung, không cuộn.
- Quỹ dự phòng = (chi tiêu + trả nợ/tháng) × số tháng (khớp `fund_floor.spending_basis` trong KB; code `allocation.ts` hiện chỉ nhân chi tiêu).
- Agent cần số liệu làm quỹ → gửi lại thẻ bảng hỏi bước 1, không hỏi lẻ.
- Màn Balance: 2 tab. "Split" = 3 thanh ngang On track / Under + số còn thiếu (công thức mốc của spec v2). "Cash flow" = 1 bảng thu, chi, trả nợ, còn dư, danh sách nợ, mục tiêu quỹ. Bỏ Net worth, Can use now.

**3 nhóm tài sản:**
- **Safety** = tiền gửi ngân hàng + tiền mặt; stablecoin (Hiếu chốt tính vào Safety); trái phiếu, tín phiếu, quỹ trái phiếu, quỹ thị trường tiền tệ. Trái phiếu lãi cao (junk) KHÔNG ở Safety → Traditional (SEC: rủi ro gần cổ phiếu).
- **Quỹ dự phòng (vault MoonSafe) tách riêng, không nằm trong Safety.**
- **Traditional / Crypto:** phần ngoài Safety mặc định 50/50; ở bước tài sản app/agent hỏi người dùng muốn chia thế nào (VD 30/70), không chọn thì 50/50. Agent nói rõ cách chia đôi là lựa chọn của MoonSafe, không phải quy tắc chuẩn.
- Khai bằng số lượng HOẶC số tiền. Số lượng → giá trị = số lượng × giá hiện tại; số tiền → đổi ra số lượng theo giá lúc khai rồi lưu số lượng (sau đó giá trị đi theo giá). Món không có giá thị trường (tiền gửi, trái phiếu, quỹ không mã, cổ phiếu VN chưa có nguồn) giữ số $.
- Danh sách món đề xuất cho bước 2 (Hiếu đang duyệt): Safety: tiền gửi+tiền mặt ($), stablecoin (số lượng 1=$1, không gồm vault), trái phiếu/tín phiếu/quỹ trái phiếu/quỹ thị trường tiền tệ ($). Traditional: vàng (oz/$, gold-api), cổ phiếu/ETF Mỹ (mã + số cp/$, Yahoo), cổ phiếu VN ($), trái phiếu lãi cao ($). Crypto: BTC (số lượng/$, Coinbase→Binance), cirBTC đọc trên chuỗi, coin khác (mã + số lượng/$).

**Để tính ở v2 (chưa chốt, cần tư vấn theo kiến thức chuẩn):**
- **Bất động sản đầu tư (nhà cho thuê, đất):** đang để ngoài 3 nhóm; nếu sinh thu nhập thụ động thì tiền thuê vào dòng tiền. Tra 10-31: chưa thấy nguồn chính thống thống nhất — SEC chỉ xếp vào "nhóm khác, rủi ro riêng"; CFA Institute nêu khó định giá (giá thẩm định ≠ giá bán); một số người coi là nhóm riêng hoặc dòng thu nhập giống trái phiếu. Cần tìm nguồn tốt hơn trước khi đề xuất.
- **Món KB có nhưng không vào 3 nhóm:** bảo hiểm có tích luỹ / hưu trí tự nguyện, tiền cho người khác vay, phần vốn doanh nghiệp, NFT — xếp thế nào.

# Agent three-cycle improvements — deployed 2026-10-31

User requested deployment after the three Haiku improvement sessions. Current working tree (HEAD `4c8a0b0` plus local agent changes, including the final deterministic confirmation-status repair) deployed successfully to Cloudflare production `148f6808-3e1d-4bcf-96bd-254376ef0ff1`: https://148f6808.moonsafe.pages.dev and https://moonsafe.app. Verified mainnet factory `0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A`, RPC, cirBTC and Privy against the prior live bundle and the new build. Cloudflare canonical deployment is production/success; production KV and D1 IDs are unchanged. Both URLs: homepage 200, HTML matches local production build, unauthenticated POST `/api/chat` 401. Six agent suites, `check:all` (including ledger), handler/eval TypeScript and mainnet build pass. No paid model call or transaction during deployment; no Git commit or push. Evaluation limits remain in `docs/evals/session-three-cycles-2026-10-31.md`; deployment receipt is `docs/archive/deployment-2026-10-31.json`.

# Balance Sheet v2 — CHỐT HƯỚNG 2026-10-30, chưa code

**Deployment (Codex, user requested):** production `aa2af126-c20b-4750-85e4-012449c4d50e`, https://aa2af126.moonsafe.pages.dev and https://moonsafe.app. Before upload, preserved local work in stash `codex-agent-fix-before-deploy-sync-2026-10-30`, fast-forwarded c635084 → 5fc0eb7 (four newer user commits), reapplied the part-choice fix, and resolved HANDOFF by keeping both notes. TypeScript, KB including 63 routing checks, offline-flow, language gate and mainnet build passed after synchronization. Both URLs: homepage 200, unauthenticated chat 401, served asset hashes match the new build. Cloudflare confirms canonical deployment, existing D1 ledger and production KV retained. No extra paid calls, commit or push. The 974,475-token evaluation below predates these four upstream commits; it is not a paid evaluation of the combined deployed tree. Other findings in that review remain follow-ups.

Spec: [`docs/archive/SPEC-BALANCE-SHEET-v2-2026-10-30.md`](docs/archive/SPEC-BALANCE-SHEET-v2-2026-10-30.md) (bản bàn trước: `docs/archive/SPEC-BALANCE-SHEET-2026-10-30.md`, chỉ còn là tư liệu).
- **Đảo quyết định 10-29 "đầu tư tính theo tiền đã bỏ vào":** giờ tính theo **giá trị hiện tại** (số lượng × giá oracle); vẫn **không giục mua khi giá giảm**, không khuyên bán.
- Khai bằng **số lượng**, bỏ khai bằng tiền cho tài sản có giá. Bỏ Net worth, Can use now, cost basis, lãi/lỗ, trừ khoản chi lớn sắp tới.
- Mốc = mục có v/w lớn nhất; tổng ngụ ý = v_mốc / w_mốc; ngưỡng 5/25 → On track / Under (không có Over).
- Hoãn: dòng tiền (module riêng), nhắc nới quỹ khi đầu tư vượt 24 tháng chi tiêu.
- Bước tiếp theo theo spec: mổ xẻ từng màn hình rồi mới viết spec build. Câu hỏi mở cho bước đó nằm ở cuối mục này trong chat 10-30 (dữ liệu cũ khai bằng $, bảng hỏi đang hỏi $, agent đang nói "money put in", nguồn giá vàng/cổ phiếu, quỹ dự phòng có tách khỏi 3 mục không).

# Agent choice routing — 2026-10-30 (Codex, local changes only)

User then explicitly authorized 1M Claude Haiku tokens after the repair. Completed capped run `haiku-choice-2026-10-30`: model `claude-haiku-5-5`, 974,475 verified tokens (961,839 input + 12,636 output), 97 calls, 37 complete turns / 11 complete conversations; stopped before a request whose reservation exceeded the remaining 25,525. No unknown usage, extra paid followups or deployment. Runtime hash `679cbb8a2c66b54b021de680ed3ff6db9bdcdc7341406a5785a00f5f88278d3b`. Review and traces: `docs/evals/haiku-choice-2026-10-30-review.md`; raw/summary/audit JSON alongside it. Audit 23/26; the 3 legacy failed assertions expect immediate persistence of pending confirmation items, not actual unauthorized mutations. Actual follow-ups: distinguish pending bank reserves from the app vault gap; answer the VND fund question even when confirmations are pending; avoid claiming a known salary minus a stated transfer is unknown. No overall score or live before/after improvement claim. The paid dataset is broad; the specific routing fix has 63 offline checks.

Read current clean HEAD c635084 before editing; kept the latest UI and three-step statement intact. Reproduced `detectPartChoice('not crypto', previousPickQuestion)` returning `crypto`. Added a conservative EN/VI refusal, postponement, uncertainty and question guard so those messages use the conversational path rather than the deterministic part-choice offer. Explicit choices and the existing `How about the "safe" part` shorthand remain supported. Added 63 routing assertions in `scripts/part-choice-check.ts`, imported by `kb-check.ts` / check:all. TypeScript, KB suite, 93 response checks and offline-flow pass. No paid model calls, commit, push or deployment. This repairs one routing boundary; it is not a new live quality score.

# Balance, Invest, step toast — 2026-10-30 (Claude, after Hiếu approved demos: 1b, 2a, roadmap C)

- **Balance (1b):** donuts kept; under them one row per part "have of target" + "X to go"/"Full" (bucketStanding, same totals as the agent), plus "Not placed yet" and "Outside the split" rows when non-zero. Stats: "Can use now" (was Liquid), fund "Full" in green. Toggle Split / Cash flow / Debts; sentence-case headings (no Caps), commas instead of middle dots.
- **Invest open (2a):** one row per part with bar and next step: Crypto → "Buy cirBTC" opens the existing buy flow in a sheet (quote + confirm unchanged); Traditional → "How" switches to Chat and sends "How do I buy an index fund such as VOO, or gold, for the Traditional part of my plan?" as the user's message (AppShell `ask` → ChatScreen); Safety → savings outside the app. DCA controls only when DCA_AVAILABLE. Locked view unchanged.
- **Step toast (C):** `src/components/chat/StepToast.tsx` at the top of the chat when a step completes (1 income+spending known, 2 fund full, 3 Invest unlocked), confetti, auto-hide 8 s; progress per Privy user in localStorage `moonsafe_steps_seen_v1`, first visit not celebrated.

# ▶ Handoff — 2026-10-30 (máy Dell, phiên deploy + D1)

**Live = main `078c49f`** (+ commit handoff này), deploy mainnet lúc chiều 10-30 (Cloudflare `aa6d0b8c`). Gồm: giao diện hướng 1 + landing dạng chat (Example bar, nền xám, bong bóng trắng), popup Before you start mới, sửa Log out, bảng hỏi dạng bảng kê 3 bước, các sửa agent (từ chối dài, nạp chưa đủ quỹ "$5 of $3,600", kiểm từ chối ≤120 ký tự). Kiểm sau deploy: trang 200, `/api/chat` không token 401, bundle có `A9A5447a`. CHƯA thử bằng tài khoản thật.

**Sổ AI power chuyển sang D1 (xong 10-30):** database `moonsafe-ledger` (id `202c2a19-f817-49b5-9428-5bcc8d45c189`, binding `DB` trong `wrangler.toml`, đã thấy trên production). Bảng `counters` (turns/events theo ngày, power) + `power_tx` (giao dịch mua, pending→done) theo `migrations/0001_ledger.sql`; code `functions/_lib/ledger.ts` (mỗi thay đổi 1 câu SQL, không đè nhau, 1 giao dịch chỉ cộng 1 lần), `quota.ts` + `/admin` dùng nó. Không có `DB` thì tự quay về KV (chạy local/test). Owner flag + đếm lần kiểm thất bại vẫn ở KV. Lúc chuyển: chưa ai mua, không có `power:`/`powertx:` trong KV; đã chép turns 17 / events 6 hôm nay của 1 tài khoản đang dùng. Kiểm: `bun scripts/ledger-check.ts` (trong `check:all`, chạy SQL thật trên bun:sqlite). Sửa schema = thêm file `migrations/000N_*.sql` rồi `bunx wrangler d1 migrations apply moonsafe-ledger --remote`. Token Cloudflare đã được Hiếu thêm quyền D1 Edit.
- **ĐÃ KIỂM 2026-10-31:** D1 đếm đúng trên production — turns tài khoản chính 17 → 24 (10-30) + 2 (10-31), thêm 1 tài khoản mới (turns 1). `power_tx` vẫn trống (chưa ai mua) → luồng cộng power sau khi mua CHƯA thử thật. Lệnh kiểm: `bunx wrangler d1 execute moonsafe-ledger --remote --command "SELECT key,n FROM counters"`.

**Danh sách việc sau kiểm toán (docs/audit-mainnet-2026-10-29.md):**
- XONG: xoá secret `GEMINI_API_KEY` (production) + `OPENAI_API_KEY` (preview) — Hiếu tự làm; verify 2 hợp đồng — đã verify đầy đủ trên explorer.arc.io từ 2026-10-29 02:54 UTC (VaultProxy `0xd139…cAACE`, VaultFactory `0xA9A5…E10A`), báo cáo cloud cũ nhầm vì máy nó bị Cloudflare của explorer chặn; sổ D1 ở trên.
- CÒN (Hiếu tự làm trên dashboard): Privy giới hạn đăng ký; Cloudflare luật giới hạn tần suất `/api/chat`, `/api/power`, `/api/*`; cân nhắc gói Workers trả phí.

**Máy Dell:** bản dở dang ChatGPT/Codex (docs DORA-SUBMISSION, PRESENTATION, CORE…, corePolicy.ts, framework-copy-check.ts) được cất ở `git stash` tên `chatgpt-codex-local-wip-2026-10-30`, chưa xoá — hỏi Hiếu giữ hay bỏ.

# Intake form as a statement (option C) — 2026-10-30

Replaces the 4-step version below: at most 3 steps (Your month with Just me / Household pills at the top → What you hold → Goals & debt), one ruled row per question, answer on the right (dashed line while empty, thousands commas as typed), Yes/No as small pills, one blue Next/Save button, Skip all / Back as text. Phones open the number pad (`inputMode` numeric for age/years/people, decimal for money and rates). Data mapping unchanged (Stablecoin onchain, Crypto).

# Intake form in 4 steps — 2026-10-30

Hiếu asked ChatGPT/Codex for this but its local edits were never pushed; rebuilt here from the same brief. Steps: Plan for (its own step, asked once) → About you (age, salary, spending, steady, dependents) → Assets (bank and cash on top; 2×2 grid Stablecoin onchain · Crypto / Gold · Stocks, funds) → Goals & debt (extra fields only on Yes). "Stablecoin onchain" replaces this-wallet + elsewhere and keeps where = app wallet, so app deposits still reduce it. "Crypto" replaces Bitcoin + Altcoins as a new asset type `crypto` (KB row, subgroup btc for the maths) that the agent context calls "crypto not split by coin", never BTC. Steps start the same size and grow on a Yes instead of scrolling. `bun scripts/intake-assets-check.ts` (in check:all) covers the totals. If Codex's uncommitted copy is still on Hiếu's machine, discard it before pulling.

# Direction 1 "the product performs" — 2026-10-30 (branch `claude/vigilant-wozniak-oo3s9u`, NOT on main/deployed)

Hiếu picked direction 1 of 5 (demos built after reading Impeccable, Taste Skill, Hallmark, UI/UX Pro Max, emilkowalski/skills, Google DESIGN.md). Replaces the "Bright" look: landing shows one real exchange with the agent + fund card instead of preview/ring/feature list/"Live" dot; flat white surfaces with 1px lines, no shadows (`--shadow-y2: none`), no gradients (Fund/VaultSetup hero = flat Blue Soft panel, dark text); mobile active tab = Blue Soft pill; chat header with green dot removed; composer filled Mist; motion only on chat messages and the fund bar. All screens fit 393×852 / 1440×900. Waiting: Hiếu approves → merge to main → Hiếu deploys (sandbox proxy blocks Pages upload).

# UI refresh "Bright" — 2026-10-30 — merged to main and DEPLOYED (Cloudflare 4592b71d, mainnet factory A9A5447a), together with the agent education tweaks below

Hiếu chose **1b + 2a–2e** from demo screenshots. Landing: product preview (example fund ring 62% $1,860 of $3,000, agent line, split at 30 on desktop) replaces the chat preview; title highlight "agent for Web3" in blue; "Live on Arc" tag; Get started with arrow. App: page background `--page #F6F8FC` behind white cards, softer shadow Y2 (`--shadow-y2`, `--shadow-blue`), chat header (logo + green dot, "Your personal finance advisor · online"), quick-start chips Spending/Saving/Investing under the first welcome (sent as the user's message), iMessage-style bubbles, white pill composer, rise-in / fill-in motion (`src/index.css`, off with reduced motion), count-up vault number, hero rings (`HeroRings`), white Stats tiles. All screens measured: fit 393×852 and 1440×900 (desktop Screen bottom padding 96→64 so Balance fits). tsc, oxlint (no new warnings), check-lang, mainnet build pass. Figma NOT updated (Figma MCP failed to connect). Waiting: Hiếu approves screenshots → merge to main → deploy.

# Latest production deployment — 2026-10-30

User explicitly requested deploy after the day improvement session. Deployed the current working tree (HEAD `fd7c731` plus uncommitted agent changes) to Cloudflare production: https://c1ef7764.moonsafe.pages.dev and https://moonsafe.app. Runtime diff hash for the evaluated final candidate: `df5d090f03ecb841d0f85d8d8907455ced9e281ea2755c270de0119951b63e88`. Existing production mainnet factory, RPC, cirBTC, Privy and KV retained and checked against the prior live bundle before upload. Build, English UI gate, scoped lint and TypeScript pass. Post-deploy both URLs return homepage 200 and unauthenticated POST /api/chat 401; bundles contain the expected mainnet factory, RPC, cirBTC and Privy app ID. No paid model request or transaction was executed during deployment. Known evaluation limitations remain documented in `docs/evals/day-improvement-2026-10-30.md`; deployment is not a quality certification. No Git commit or push was made.

# Previous production deployment — 2026-10-30

PR #32 merged and pushed to main at `05e31bf7f7c4723da4d6d91554fec28e983ae687` on explicit user authorization. Cloudflare production deployment `cd71bad3-0b92-4d4c-bc31-ff518fe11fcb` succeeded for that exact commit: https://cd71bad3.moonsafe.pages.dev and https://moonsafe.app. Existing mainnet factory, RPC, cirBTC and production KV retained. Public checks: homepage 200, unauthenticated POST /api/chat 401, live bundle contains expected mainnet factory/RPC/cirBTC. Build and English UI gate pass; rerun 296 education, 93 response, 35 guard, 5 replay and 14 adapter checks plus all three scoped TypeScript projects pass. No additional paid model calls. Existing dependency annotations and large-bundle warnings remain. This handoff update is documentation only; deployed runtime is the merge commit above.

Three authorized Claude repair cycles completed (2026-10-30):2,606,246/3M total tokens, estimated$0.3111. Runtime candidates844a4d9→fd5f24c→23a541b. Final selected14 conversations/42 turns:89.375/100, same11cases89.55 versus prior68.41; fresh3mean88.75; no observed P0/P1 in final sample,66/66 trace invariants. Cycle1 still had contribution-accounting P1; cycle2 still had optional-repayment P1; both addressed by final candidate. Original full-suite release gate remains false (coverage incomplete, teaching71.43). Changes enforce affirmative mutation evidence, preserve BTC cost+quantity, guard repayment obligations, separate private rewrites, code-render financial totals/inventories and preserve incomplete-expense context. Do not claim universal8/10 or full beta certification. No merge/deploy. See docs/evals/claude-three-cycles-2026-10-30.md and summary.json; tested runtime23a541b unchanged after live runs.

New capped Claude evaluation (2026-10-29): 972,324 of the newly authorized1M tokens across initial114,323 plus continuation858,001; estimated $0.1155. Initial HTTP400 exposed unsupported assistant-prefill after native system conversion; fixed in c8cbcae with14 adapter checks, real rewrites succeed. Continuation11 conversations/33 turns:68.41/100 overall, same-five82 versus prior78.5, six wording variants57.08. TWO P1s: quantity/cost state mismatch and unconfirmed interest-rate zeroing. Not ready for8/10, do not deploy this candidate as reliable. Other issues: English rewrite drift, hidden-draft commentary, passive-income reclassification and intake on declarative education. See docs/evals/claude-reeval-post-repairs-2026-10-29.md and combined summary. No further paid calls; no merge/deploy.

Second agent repair pass (2026-10-29, PR #32): reproduced a premature $2,700 target on prior b73e543 with unknown dependents. Reply figures now withhold default fund targets/gaps and related buy-lock amounts until the relevant inputs are known; irregular households also need sole-earner status. Added narrow final-output check and reviewed bilingual needs/wants lesson with zero model calls on exact standalone queries. 75 response checks and 296 education/coaching/household checks pass; no new paid calls or new quality score, not merged/deployed. See docs/evals/response-context-round2-2026-10-29.md.

Response/workflow follow-up (2026-10-29, PR #32): pending confirmation no longer blocks explanations; answers use saved state, provisional cards are dropped, and the pending notice is server-rendered. Base prompt fixes unnecessary intake, unknown-reserve assumptions, loss/recovery wording and compulsory Noted rewrites. Claude adapter preserves server instruction roles. Added 51 offline response checks and 9 native adapter checks; existing 284, 35 and 5-check suites pass. No new paid requests; frozen Claude score remains 78.75/100, not evidence of 8/10 after repairs. Details: docs/evals/response-quality-repairs-2026-10-29.md. Review branch only, not merged/deployed.

Agent repair update (2026-10-29): review branch adds tool unit checks, user-intent routing, narrow fact reconciliation, computed fund answers and 284 offline checks. Frozen live score remains 67/100; targeted smoke blocked before dispatch by remaining original budget (zero additional spend). See docs/evals/guardrail-repairs-2026-10-29.md. Not deployed.

Household default update: a clear current marriage disclosure defaults an unset scope to household; saved individual choices win. Partner amounts remain unknown until declared. 252 offline checks pass; no paid model calls for this update.

# MoonSafe — HANDOFF

## Household planning continuation — 2026-10-29 (PR #30, not deployed)

The same review branch now adds explicit individual/household scope, combined-salary intake, partner-income/total guards and a household planning context. One active dataset; switching keeps entries for review. The profile holder's age still drives the unchanged formula. See `docs/AGENT-FRAMEWORK.md` and `docs/evals/household-2026-10-29.md` (252 offline checks, no new paid calls). Existing financial tests remain in use. Do not claim partner login or joint wallet permissions.


## Agent coaching extension — 2026-10-29 (review branch)

Branch `codex/finance-coach-depth` extends the existing framework rather than replacing it. Allocation math, cost basis, emergency-fund floors, priority-debt rules, buy locks and signature requirements are unchanged. Adds loss/FOMO/fraud guidance, conservative numeric evidence filtering, and five reviewed bilingual lessons (10 total). See `docs/evals/coaching-2026-10-29.md` for evidence and limits. `bun run eval:education` is offline; `--live --coaching` is opt-in with the existing 12-call/100k-token cap. No database, contract, wallet or deployment changes. Merge/deploy only when requested.


Agent tư vấn tài chính cá nhân cho người dùng Web3 + quỹ dự phòng USDC onchain, chạy trên **Arc MAINNET** (chain 5042, tiền thật). Live: https://moonsafe.app (Cloudflare Pages project `moonsafe`; push GitHub KHÔNG tự deploy).
Cập nhật lần cuối: **2026-10-29** (khuya), xem ▶ Làm tiếp từ đây.
Khung tài chính: [`docs/archive/SPEC-FRAMEWORK-2026-10-25.md`](docs/archive/SPEC-FRAMEWORK-2026-10-25.md) (dữ liệu ở `src/kb/`). Rà soát bảo mật: [`docs/archive/audit-2026-10-27.md`](docs/archive/audit-2026-10-27.md). Chi phí token: [`docs/archive/token-cost-2026-10-28.md`](docs/archive/token-cost-2026-10-28.md). Kiểm giao diện bằng trình duyệt thật: [`docs/archive/browser-checks.md`](docs/archive/browser-checks.md).

## ▶ Làm tiếp từ đây (2026-10-29 tối)
**Đang ở đâu:** mainnet đã live, đang thi hackathon Arc Micrograants (DoraHacks). Phiên 10-29 đã làm xong rất nhiều thứ ở mục ▶ MAINNET bên dưới, đều đã deploy + qua bộ kiểm offline (`kb-check`, `flow`, typecheck, check-lang), NHƯNG chưa ai thử trên app thật bằng tài khoản thật.

**Việc tiếp theo, theo thứ tự:**
1. **Hiếu thử thật trên moonsafe.app** (Claude không đăng nhập Privy được):
   - Mua cirBTC 1 USDC: thẻ báo giá phải có dòng "Price … USD per BTC, ±x% vs market"; ví có thể hỏi ký 2 lần (approve + swap). Ví `0xEb2D` có **0 cirBTC** trước lần thử → đọc lại `balanceOf` trên cirBTC `0x171A…aA0` để đối chiếu với báo giá. Sau khi mua, Balance phải có "cirBTC (bought in MoonSafe)" = số USDC đã trả.
   - Mua AI power 1 USDC (Menu chat → Top up): +100 tin, server kiểm onchain.
   - Kết nối ví phụ `0xb0A8` qua Menu → nạp 0,1 USDC vào vault của ví chính (`depositFor`, đã giả lập OK); tab Withdraw phải báo chuyển về ví chính.
   - Xoá lịch sử trên điện thoại → mở máy tính (F5) phải xoá theo.
   - Thanh tab: Balance/Invest khoá (màu nhạt + ổ khoá) cho tới khi quỹ đầy; tin agent dài phải cuộn tới DÒNG ĐẦU; biểu mẫu 6 thẻ cùng cỡ (laptop 2 ô/hàng).
2. **Chạy model thật có trần** cho các luật prompt mới hôm nay (TEACH khi hỏi "what if / do I need", DCA mặc định, quy tắc $/USDC, giá vốn, tôn trọng "no"): chưa chạy lần nào; cần Hiếu duyệt ngân sách (xem §5, `eval:server --budget`).
3. **Hackathon**: quay video (Arc Studio + giao dịch mainnet; kịch bản đã đưa trong chat 10-29), điền form DoraHacks (nội dung đã soạn: agent dạy tài chính cá nhân là trọng tâm, vault là bước hành động). Ví dụ giao dịch: mở vault `0xd46987c299d807db1456d1034d2ba438d93cf25c85cec37fce081e7133515bc3` → vault `0xf067…8886`.
4. Còn treo từ kiểm toán: trần token toàn hệ thống có thể bị cạn bằng vài tài khoản email (chặn ở `/admin`); 16 cảnh báo thư viện (`bun audit`); Safe 2-of-2 chưa có ví dự phòng.
5. Sau hackathon: khôi phục vault (`docs/vault-recovery-spec.md`), DCA tự động (keeper + màn hình, hợp đồng đã có), cổ phiếu onchain trên Arc cho phần Traditional.

**Đã làm cuối phiên 2026-10-29 (sau `febf3f0`):** landing page mới theo design system (`LoginScreen.tsx`, đo vừa 1 màn 393×852 / 1440×900 / 1280×720); vault chỉ được mời SAU khi khai (vào thẳng chat, kế hoạch mời mở vault 1 USDC một lần, `prepare_open_vault`, tab Emergency vẫn mở được); thẻ mua gọn; prompt thử 6 kiểu người dùng (dưới); gộp đợt kiểm toán sau ra mắt của Arc Studio (PR #27: HSTS, Permissions-Policy, fail-closed khi thiếu KV, lọc tin nhắn, `docs/audit-mainnet-2026-10-29.md`) + sửa `package.json` thừa dấu phẩy của đợt đó; thẻ quỹ dự phòng: số dư vault ghi USDC đủ số lẻ, mục tiêu/tiến độ ghi $ 2 số lẻ (trước làm tròn $1.5 → $2).

**Thử prompt bằng nhiều kiểu người dùng (2026-10-29 khuya):** `bun run eval:server -- --budget 400000` (OPENAI_API_KEY = `OPEN_AI_API` trong keys.env) rồi `bun scripts/persona-eval.mjs [--only tên]`; 6 kiểu: newbie, degen, impatient, viet, skeptic, trader; transcript ở `scripts/persona-eval-last.txt` (gitignore). KHỞI ĐỘNG LẠI eval server sau mỗi lần sửa `chat.ts` (nó nạp code 1 lần). 5 lượt chạy ≈ $0,4. Đã sửa nhờ bộ này: ngôn ngữ theo tin người dùng GÕ gần nhất (không theo sự kiện app); ví không đủ thì mời nạp một phần (`partialOffer`); "yes/ok" sau lời mời → thẻ với đúng số đã mời, kể cả khi có 1 câu hỏi xen giữa (`OFFERED_AMOUNT`, `lastOffer`); "make it 1$" → thẻ đúng số (`NEW_AMOUNT`); không hỏi ngược khi người dùng hỏi; không tự nhắc cirBTC khi họ không nói về mua; TEACH tối đa 4 câu; chặn chữ khác hệ (Hindi…); kế hoạch rút gọn (1 dòng/mục, chia 34.5% hiện đủ số lẻ); thẻ mua gọn (1 dòng cảnh báo).

**Đã biết, chưa sửa:** cirBTC mua TRƯỚC bản giá vốn (`8bd8cda`) không có giá vốn; sau lần mua đầu tiên kể từ bản này, chỉ phần đã ghi được tính (khai thêm qua chat nếu cần). Tin cũ trong lịch sử chat vẫn ghi "USDC"/"full" kiểu cũ. Khoản khai trước 10-29 vẫn tên "USDC in this wallet".

**Quyết định Hiếu chốt 10-29 (đừng đổi ngược):** Safety = tuổi %, phần còn lại Traditional = Crypto chia đôi, nói là gợi ý khách quan · đầu tư tính theo tiền đã bỏ vào, giá giảm không giục mua · DCA là cách mua mặc định cho người không đọc chart · 1 người 1 vault, ví phụ nạp được, chỉ ví chính rút · Balance mở khi quỹ đầy, Invest khi quỹ đầy + không nợ ưu tiên · giá trị hiện $, USDC chỉ cho token chuyển trên chuỗi, USDC+USDT gọi là "stablecoins" · 20 tin/ngày (ví owner 60), 1 USDC = 100 tin mua thêm vĩnh viễn, gửi về `0xEb2D` · hỏi "free?" → 20 tin/ngày, mở vault 1 USDC, ngoài ra chỉ phí mạng · không bắt nhập email.

## ▶ MAINNET ĐÃ LIVE (2026-10-29)
moonsafe.app = **Arc mainnet (chain 5042), tiền thật**. Hiếu tự ký mọi giao dịch bằng OKX Wallet qua `--browser` của Foundry (không keystore, key không rời ví).
- **Safe 2-of-2** `0xC4c428c635913e5937BA0DA6E060E495f5a664b9` (chủ `0xEb2D…52F6` + `0xb0A8…c071`), tx `0xd025b2b8…b093`.
- **VaultProxy (mẫu)** `0xd139b06b1bb5303a4fbA25E2B2297Cf1515cAACE` · **VaultFactory** `0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A` (tx `0x32f5fffe…595c`), chủ = Safe, nhận phí = `0xEb2D`, phí 1 USDC. `preflight-mainnet.ts`: All checks passed (15/15).
- **KV mainnet** `USERDATA_MAINNET` id `4dca45d1b7c14f3cb1250d78a266d936` (trong `wrangler.toml`; KV testnet cũ `f5f9fd48…` = rollback). Cloudflare deploy `db986e84`.
- **Deploy từ giờ PHẢI kèm 2 biến mạng**, thiếu là build ra testnet: `env -u VITE_PRIVY_APP_ID -u VITE_CIRBTC_ADDRESS VITE_NETWORK=mainnet VITE_FACTORY_ADDRESS=0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… bun run cf:deploy`. Kiểm: bundle chứa `A9A5447a`.
- Bẫy đã dính khi ký bằng `--browser`: (1) OKX nhớ mạng RIÊNG cho trang localhost:9545 → đổi mạng của trang sang Arc 5042; (2) đừng `curl` trang 9545 (mất phiên, nút Confirm chết); (3) `forge script` nhiều giao dịch: trang KHÔNG hiện giao dịch thứ 2 → dùng `forge create` từng hợp đồng.
- **Verify nguồn**: cả 2 hợp đồng `exact_match` trên Sourcify (`forge verify-contract … --verifier sourcify`). explorer.arc.io chặn lệnh tự động bằng Cloudflare challenge (403) nên không verify bằng blockscout được từ máy.
- **Kiểm toán 2026-10-29**: không có lỗi mất tiền. Đã sửa: giới hạn 20 tin/ngày, ví owner 60; `public/_headers` chặn nhúng iframe; `cf:deploy` từ chối build khi thiếu `VITE_NETWORK=mainnet` + factory (`scripts/check-deploy-env.mjs`). Còn treo: agent có thể bị làm cạn trần token toàn hệ thống bằng vài tài khoản email (chặn ở /admin), 16 cảnh báo thư viện (DoS parser, dọn sau), Safe 2-of-2 không ví dự phòng.
- **2026-10-29 chiều**: (1) đồng bộ: server là nguồn chuẩn, bản ghi đã có mà trống = đã xoá ở máy khác → máy này xoá theo (`AppState.tsx`), không đẩy bản cũ lên lại; (2) **mua AI power**: 1 USDC/lần gửi tới `0xEb2D` kèm memo = keccak(account id) trong calldata, server kiểm onchain (`buyPower` trong `functions/_lib/quota.ts`, `src/lib/power.ts`), +100 tin vĩnh viễn, mỗi tx 1 lần (`powertx:<hash>`); chi phí đo thật ≈ $0,004/tin; (3) nút "Top up" thay chữ Details gạch chân, khe 8px giữa dòng AI power và ô chat; (4) biểu mẫu hỏi từng thẻ (Skip / Next / Back), crypto chỉ hỏi Bitcoin + Altcoins; (5) hỏi "what if I don't…/do I need…" → chế độ TEACH + luật: chưa có quỹ dự phòng thì chưa nên đầu tư.
- **2026-10-29 tối**: Traditional = Crypto (chia đôi phần rủi ro, giải thích cân bằng, "gợi ý khách quan"); câu chào in đậm cả 4 ý; **DCA là cách mua mặc định** khi người dùng không đọc chart (không ai biết đỉnh/đáy, dựa vào tăng trưởng dài hạn): cirBTC mời lần mua đầu = 1/6 (`DCA_MONTHS` trong `functions/_lib/plan.ts`), "all at once" vẫn được; Traditional gợi ý chia 6 tháng; người đọc chart thì tôn trọng cách của họ. DCA TỰ ĐỘNG trong app vẫn tắt.
- **Ý tưởng sau này (Hiếu)**: khi Arc có cổ phiếu onchain thì phần Traditional mua ngay trong app như cirBTC, khỏi qua nhà môi giới.
- **Giá vốn (Hiếu 2026-10-29)**: khoản đầu tư tính theo TIỀN ĐÃ BỎ VÀO, không định giá lại theo thị trường (giá giảm không làm phần đó "thiếu" rồi giục mua thêm). Biểu mẫu + agent lưu số $ người dùng nói (`priceSource: 'self'`); cirBTC mua trong app cộng số USDC đã trả vào holding `cirBTC (bought in MoonSafe)` (`cirBtcBuyOps`, `src/lib/profile.ts`) và KHÔNG cộng thêm giá trị onchain nữa. Chỉ khoản khai bằng số lượng ("0.1 BTC") mới còn định giá thị trường; agent được dặn hỏi "bỏ vào bao nhiêu". Hiển thị: giá trị bằng $, USDC chỉ cho token chuyển trên chuỗi.
- **2026-10-29 khuya**: 1 vault/người (`useVault.ts` tìm vault qua mọi ví của tài khoản; ví phụ nạp bằng `depositFor`, chỉ ví chính rút); tab mở theo cấp (`AppShell.tsx`/`NavBar.tsx`); câu hỏi "free?" trả lời từ code (`ASKS_PRICE` trong `chat.ts`); "no" sau lời mời → câu tôn trọng soạn sẵn (`SAYS_NO`); tin agent mới cuộn tới dòng đầu (`ChatScreen.tsx`); biểu mẫu 6 thẻ gom chủ đề, cùng cỡ (`IntakeFormCard.tsx`, đo bằng trang tạm: 452px mobile / 364px laptop); "đầy" = còn thiếu < 1% mục tiêu (`Standing.full`, trước là < 0,5 USDC nên số nhỏ bị báo đầy); chốt chặn giá cirBTC: báo giá đắt hơn giá BTC thị trường > 3% thì từ chối (`useCirBtc.ts`).
- **Chưa làm**: thử thật (xem ▶ Làm tiếp từ đây), DCA tự động vẫn tắt.

## 0. Chuẩn bị mainnet (2026-10-28, LỊCH SỬ: mainnet đã live 10-29, xem ▶ ở trên)
- **Công tắc mạng** `VITE_NETWORK=mainnet` (`src/lib/network.ts`); mặc định VẪN là testnet. Mainnet không có factory mặc định (cần `VITE_FACTORY_ADDRESS`).
- **Mã hợp đồng trong repo giờ là v2 (ứng viên mainnet); factory testnet `0xAd06…` đang chạy v1** (mã v1 ở lịch sử git, commit `5f5fc7d`). ABI mà app dùng (`getVault`, `fee`, `createVault`, vault `deposit/withdraw/getBalance`) không đổi nên app chạy được với cả hai.
- **Hợp đồng v2** (Ownable2Step, phí rút về `withdrawFees`, tạm dừng tạo vault, lỗi có tham số): 154 test, review max sạch, Slither 0. `contracts/script/DeployMainnet.s.sol` và `scripts/safe-plan.ts` (tạo Safe 2-of-2 gồm `0xeb2d…` và `0xb0A8…`). Chi tiết, lựa chọn kiểm toán, DCA: `docs/archive/mainnet-plan-2026-10-29.md`.
- **DCA (hợp đồng xong, chưa triển khai)**: `DcaPlan.sol` + `DcaFactory.sol` + `contracts/script/DeployDca.s.sol`; 322 test, review max đã xử lý 2 lỗi, đã diễn tập chỉ-đọc trên trạng thái thật của Arc mainnet (USDC, cirBTC, Adapter `0x7FB8…a845`, Pyth Core `0x8250…487a`, feed BTC/USD). **Còn thiếu: keeper** (ví riêng có tiền: báo giá Circle với người gửi là plan, dựng calldata `execute` của Adapter, lấy dữ liệu giá Pyth từ Hermes, gọi `executeRound`), **màn hình trong app** (tạo/xem/hủy kế hoạch) và lần chạy thật với số tiền rất nhỏ trên mainnet. Cờ `DCA_AVAILABLE` vẫn false.
- **Kiểm tra trước khi bật mainnet**: `FACTORY=... SAFE=... bun scripts/preflight-mainnet.ts` (chỉ đọc, phải ra `All checks passed`); `DeployMainnet` từ chối chủ factory không có mã; hướng dẫn từng bước ở `docs/MAINNET-LAUNCH-TODAY.md`.
- **PRODUCTION IS MAINNET (since 2026-10-29)**: moonsafe.app = Arc mainnet, factory `0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A`, Safe 2-de-2 `0xC4c428c635913e5937BA0DA6E060E495f5a664b9`. **Deploy with `VITE_NETWORK=mainnet VITE_FACTORY_ADDRESS=0xA9A5…E10A bun run cf:deploy`** (`scripts/check-deploy-env.mjs` refuses a build that would point the live site at the wrong network). Production KV `4dca45d1…` (testnet `f5f9fd48…` stays as preview). Post-launch audit: `docs/audit-mainnet-2026-10-29.md` (open actions: restrict sign-up in Privy, a rate-limit rule in Cloudflare, a paid Workers plan, delete the GEMINI secret and the preview OpenAI key, verify the contracts on explorer.arc.io).
- **Third audit round (2026-10-30)**: end of `docs/audit-mainnet-2026-10-29.md`. Run `bun run check:all` before every deploy (a stale `kb-check` test had been red on main). Swap now has a `stopLimit` + 60 s quote expiry; fast-path cards obey the pause switch and the buy lock.
- **Second audit round (2026-10-29)**: `docs/audit-mainnet-2026-10-29.md` (second part). AI-power purchase hardened (pinned payment, chain/hash checks, claim-first, throttle), vault reads tied to an epoch, `hasVault` unknown is not false. Open: purchase ledger/quotas need a Durable Object or D1; cirBTC swap needs `stopLimit` + quote expiry.
- **Trang `/admin`** (`src/components/screens/AdminPage.tsx`, `functions/api/admin.ts`, `functions/_lib/{admin,config}.ts`, `functions/api/status.ts`): đăng nhập bằng tài khoản + chữ ký của ví admin (`ADMIN_WALLETS`, mặc định hai ví trên; bằng chứng 30 phút, gắn với tài khoản); tổng quan thống kê agent, danh sách tài khoản (tặng tin nhắn, đặt lại hôm nay, chặn, xóa dữ liệu có xác nhận), cài đặt không cần deploy (tạm dừng agent / thẻ giao dịch, thông báo cho mọi người, giới hạn hằng ngày, AI nào trả lời trước) lưu ở KV `config:app`, trạng thái khóa AI (chỉ có/không, thử kết nối bằng lệnh liệt kê model, không tốn token), nhật ký thao tác 90 ngày. Khóa API đổi trên Cloudflare, không đổi từ trang này. Banner thông báo cho người dùng đọc `/api/status`.
- Trước khi bật mainnet cho moonsafe.app: dùng **KV mới** cho dự án (người dùng và bộ đếm testnet không mang sang), đặt `VITE_NETWORK=mainnet` + `VITE_FACTORY_ADDRESS`, thêm origin vào Privy, xem lại chữ trên màn "Before you start".

## 1. Trạng thái 2026-10-28 (LỊCH SỬ: trước mainnet; số liệu mới ở ▶)
- Testnet, trước ngày lên mainnet. Giới hạn, AI power, hợp đồng nay đã khác: xem ▶ ở trên.
- **Hợp đồng** (Arc Testnet): `VaultFactory` `0xAd06…941b` (chủ và người nhận phí là ví `0xEb2D…52F6` của Hiếu, phí 1 USDC), vault là clone `VaultProxy` bất biến. Mã trong repo khớp mã đã triển khai (chỉ khác địa chỉ implementation). 86 test Foundry đạt. Chưa verify nguồn trên explorer.
- **Agent**: OpenAI `gpt-5.4-mini` là chính (PLAN dùng công cụ + REPLY), Claude Haiku (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`) là dự phòng (`functions/_lib/llm.ts`). DCA **tắt** (`DCA_AVAILABLE=false` trong `src/lib/features.ts`), làm lại trên mainnet bằng hợp đồng riêng.
- **Giới hạn**: 30 lượt chat/ngày/tài khoản (UTC), ví `0xeb2d…2f6` đã xác minh (ký một lần) được 90 và KHÔNG bị trần token theo người; trần token mặc định 600k/người, 2,2M toàn hệ thống. "Nạp điện cho AI" (mua thêm lượt): **chưa mở** (chờ giá, địa chỉ nhận, cách xác minh).
- **Thống kê thật**: kho KV `USERDATA` khóa `stats:<ngày>`, đọc được bằng `GET /api/usage` (chỉ owner đã xác minh) hoặc Cloudflare KV API. Số đo 28/10: ≈10k token/lượt, 14 lần viết lại trong 19 lượt.

## 2. Luồng agent hiện tại (chi tiết trong code `functions/api/chat.ts`)
1. Lời chào cố định (UI, không gửi model): "spending, saving or investing?".
2. Tin trả lời đầu ⇒ **biểu mẫu điền được** (`IntakeFormCard`, mục còn thiếu), 0 lệnh gọi model. Bấm **Save N** là lưu ngay (gửi biểu mẫu chính là sự xác nhận, KHÔNG có thẻ xác nhận sau đó); giá trị đổi thành mục bằng mã (`src/lib/intakeForm.ts`). Gõ tự do vẫn được (đường model).
3. **Thẻ xác nhận từng mục** (`ItemsCard`, cao cố định 216px; Confirm / Cancel / Confirm all ⇒ sự kiện ẩn `[app event] The user reviewed the items: …`) chỉ dùng khi người dùng **khai THÊM vào dữ liệu đã có** (≥3 mục gõ trong một tin, hồ sơ đã có dữ liệu trước đó — `hadDataBefore` trong `chat.ts`). Lần khai đầu (biểu mẫu hoặc một tin dài của người mới) lưu thẳng, rồi kế hoạch theo sau. Chốt với Hiếu 2026-10-28.
4. Có đủ dữ liệu ⇒ **kế hoạch do server dựng** (`functions/_lib/plan.ts`, 0 lệnh gọi model): tổng quan (an toàn = tuổi%, còn lại chia Traditional ≈ 4/7 và Crypto ≈ 3/7), từng bước có "Why", quỹ dự phòng giải thích vì sao 3/6/9/12 tháng, mục tiêu gần được giữ trong Safety, câu mời nạp quỹ ("prepare a deposit of N USDC …").
5. **Bước sau kế hoạch do server dựng** (`plan.ts`: `pickQuestion`, `detectPartChoice`, `buildPartAnswer`, `buildAfterSign`; 0 lệnh gọi model, bỏ cả bước planner): câu hỏi chọn phần chỉ nêu các phần CÒN CHỖ, mỗi phần "X of Y"; "yes" cho "Only Crypto still has room…" ⇒ lời mời chuẩn bị lệnh mua cirBTC (chỉ sau khi chọn crypto); gọi tên Safety/Traditional ⇒ nó nằm ngoài app, còn bao nhiêu; ký nạp quỹ hay xác nhận lưu tiền ⇒ trạng thái rồi câu hỏi chọn phần. Lý do: model từng hỏi "Safety or Traditional?" sau khi user chọn Crypto dù hai phần kia đã đầy.
6. Sau đó model viết ngắn (chế độ BRIEF) hoặc dài chỉ khi dạy (TEACH). Hỏi "how much …" ⇒ server trả thẳng bảng tổng (`buildStanding`). Nói đã bỏ tiền vào ngân hàng ⇒ hộp xác nhận (`RecordCard`).
6. Thẻ giao dịch (nạp/rút quỹ, mua cirBTC) luôn do user ký; agent không bao giờ chuyển tiền.
- **Quy tắc tiền (Hiếu chốt)**: tổng tiền chỉ tính số **người dùng khai báo**, kể cả ví; số dư ví đọc trên chuỗi chỉ để agent biết và để giới hạn thẻ (`walletSeen`). Khi chính app chuyển tiền (nạp/rút quỹ, mua cirBTC) thì khoản ví đã khai tự đổi theo (`walletMoveOps`). cirBTC mua trong app vẫn đọc từ chuỗi.
- **Gọi tên**: "Emergency fund" = USDC trong vault, tính bằng tháng chi tiêu. "Safety" = một trong ba phần của tiền linh hoạt (tiết kiệm ngân hàng, ngoài app, không có "tháng"). Mọi phần ghi dạng "X of Y, Z to go". Tab đã đổi `Fund` → `Emergency`.
- **Airdrop / khoản đợt** không phải thu nhập tháng: cờ `hasWindfalls` (+ `windfallsYearly` nếu có), kế hoạch có đoạn giải thích.

## 3. Bản đồ file
- `functions/api/chat.ts` (agent: công cụ, guard, các nhánh xác định) · `functions/_lib/{llm,budget,quota,stats,intake,plan}.ts` · `functions/api/{power,usage,userdata,price,prices,rates}.ts`
- `src/lib/{allocation,profile,record,intakeForm,features}.ts` (tính toán dùng chung app + server) · `src/kb/` (khung tài chính dạng dữ liệu)
- `src/components/chat/{ItemsCard,IntakeFormCard,RecordCard,ActionCard,AiPower}.tsx` · `src/components/screens/*` · `src/state/AppState.tsx`
- `contracts/`, `scripts/` (kb-check, offline-flow, token-report, eval-server, agent-eval; các script `compass-*`, `self-deploy`, `fetch-abi` là của Arc Studio, không dùng bởi app)

## 4. Môi trường và deploy
- Secret trên Cloudflare Pages (production): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (và `GEMINI_API_KEY` cũ — không còn dùng, có thể xóa). Biến tùy chọn: `CLAUDE_MODEL`, `PRIVY_APP_ID`, `DAILY_TOKEN_BUDGET`, `USER_DAILY_TOKEN_BUDGET`, `FREE_TURNS_PER_DAY`, `OWNER_TURNS_PER_DAY`, `OWNER_WALLET`, `POWER_PAYMENT_ADDRESS`. KV `USERDATA` (id trong `wrangler.toml`). Client: `VITE_PRIVY_APP_ID`, `VITE_FACTORY_ADDRESS`, `VITE_CIRBTC_ADDRESS` (đều có mặc định công khai trong code).
- Đổi secret xong phải **deploy lại** mới có hiệu lực.
- **Deploy MAINNET (từ 2026-10-29):** `env -u VITE_PRIVY_APP_ID -u VITE_CIRBTC_ADDRESS VITE_NETWORK=mainnet VITE_FACTORY_ADDRESS=0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… bun run cf:deploy` (khoá Cloudflare = `CF_API_TOKEN`/`CF_ACCOUNT_ID` trong `D:\Files\Claude\.secrets\keys.env`). `cf:deploy` tự từ chối nếu thiếu 2 biến mạng. Sau deploy kiểm: trang 200, `/api/chat` không token 401, bundle chứa `A9A5447a`. Phần dưới đây là ghi chú thời testnet.
- Deploy (testnet, cũ): `bun run cf:deploy` (kiểm tiếng Anh + `vite build` + `wrangler pages deploy`). Cần `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. **Cạm bẫy đã dính**: đừng nạp cả file `.env` của sandbox khi build, vì các biến `VITE_*` ở đó sẽ đè địa chỉ factory mặc định (từng deploy nhầm factory `0x985a…`). Chỉ truyền hai biến Cloudflare: `env -u VITE_PRIVY_APP_ID -u VITE_FACTORY_ADDRESS -u VITE_CIRBTC_ADDRESS CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… bun run cf:deploy`. Sau deploy kiểm: trang trả 200, `/api/chat` không token trả 401, bundle chứa `0xAd06` và không chứa `0x985a`.
- Origin mới phải thêm vào Privy dashboard → Allowed origins (mỗi phiên preview Arc Studio có địa chỉ khác).

## 5. Công cụ kiểm tra (đều KHÔNG gọi model)
`node scripts/check-lang.mjs` (giao diện chỉ tiếng Anh) · `bun scripts/kb-check.ts` (khung tài chính, biểu mẫu, hạn mức, ~100 ca) · `bun run flow` (handler thật + model giả, đi các bước intake → xác nhận → kế hoạch → "how much") · `bun run tokens` (đếm token mỗi lệnh gọi) · `npx tsc --noEmit` · `forge test`. Máy chủ eval có trần token cứng: `bun run eval:server -- --budget N` dùng với `scripts/agent-eval.mjs` (chạy model thật, **chỉ khi Hiếu duyệt ngân sách**).

## 6. Luật làm việc với Hiếu
- **Không gọi model thật để thử prompt** nếu chưa được duyệt kèm ngân sách token (28/10 các lần thử đã tốn nhiều token của anh).
- Chat/giao diện: ngắn gọn; chỉ dài khi dạy về tài chính cá nhân và phân bổ danh mục. UI chỉ tiếng Anh. Không opacity cho trạng thái khóa. Chữ người dùng thấy (lời chào, nút, thông báo) đưa anh duyệt trước khi sửa lớn.
- Giữ giao diện hiện tại (kính mờ, xanh, DM Sans). Màu xám phụ dùng đúng token `grey` (`--subtle`, `#4B5568`) của `brand/tokens.json`.
- Quy trình phiên này: mỗi việc một nhánh + PR rồi gộp và deploy theo lời anh; sửa lỗi anh đã nêu thì làm luôn; việc rủi ro (mainnet, đổi tiền, đổi hợp đồng) hỏi trước.
- Mainnet: Arc Studio không triển khai thay anh. Trước khi viết/bàn cấu hình mainnet phải đưa cảnh báo mainnet đầy đủ và chờ anh xác nhận.

## 7. Việc cần làm tiếp (danh sách 10-28; việc MỚI NHẤT ở ▶ Làm tiếp từ đây — mục 3 mainnet và 5 nạp điện AI đã xong 10-29)
0. **Khôi phục vault (Hiếu chốt 2026-10-29: làm SAU hackathon, mainnet đợt đầu không đổi hợp đồng)**: thiết kế đầy đủ ở `docs/vault-recovery-spec.md` (email xác nhận ví đích, 7 ngày đếm ngược hủy bất cứ lúc nào, một khóa thực thi trên server chỉ được bắt đầu/hủy, hủy được cả bằng email lẫn bằng ví chủ trong app). Cần: vault v3 + test + review, endpoint server, nhà cung cấp email (khóa API do Hiếu tạo), màn hình. Người dùng email vẫn khôi phục được qua Privy. Yêu cầu email ở "Before you start" ĐÃ BỎ 2026-10-29 (Privy báo "User already has one email account linked" với ví đã gắn email → user kẹt không vào được app).
1. **Kiểm model thật có trần** (chưa từng chạy sau các thay đổi 28/10): các đoạn chat "21 + biểu mẫu → thẻ xác nhận → kế hoạch", "how much is in my bank?", hỏi "why" (chế độ dài), nói đã chuyển tiền (hộp xác nhận). Cần Hiếu duyệt ngân sách; ước ≈250k token đầu vào cho bộ nhỏ.
2. **Giảm số lần viết lại** (14/19 lượt): đọc `/api/usage`, xem lý do của bộ kiểm trong log, chỉnh luật hoặc prompt đúng chỗ thay vì thêm regex.
3. **Mainnet (ngày 29/10)**: Hiếu đã xác nhận cảnh báo mainnet ngày 28/10; kế hoạch chi tiết, việc của Arc Studio và việc chỉ Hiếu làm được, danh sách quyết định: [`docs/archive/mainnet-plan-2026-10-29.md`](docs/archive/mainnet-plan-2026-10-29.md). Ghi nhận ngắn: đưa cảnh báo mainnet trước; sửa hợp đồng gộp một lần rồi rà soát lại (Ownable2Step; phí kiểu "rút về" thay vì trả ngay cho người nhận; sự kiện trước lời gọi ngoài; lỗi có tham số; tài liệu không-nâng-cấp; cân nhắc ví khôi phục được vì mất khóa là mất vault); địa chỉ USDC/cirBTC/Pyth mainnet lấy từ docs chính thức; Hiếu tự triển khai bằng ví của mình. Nhớ cirBTC testnet đang bị định giá ≈ 2,6 lần giá BTC (pool testnet), mainnet phải kiểm lại.
4. **DCA mainnet** (hợp đồng `DcaVault`, đã chốt với Hiếu): nạp trước đủ các vòng + 1 USDC dự phòng cho keeper, thông số cố định, giá phải nằm trong biên so với **Pyth** (keeper gửi dữ liệu giá kèm giao dịch; Hermes cần khóa truy cập), swap qua Adapter của Circle (nhận contract làm người gửi, cirBTC trả thẳng về ví user), mua bù vòng bỏ lỡ (mỗi lần một vòng), hủy và rút bất cứ lúc nào, keeper chạy online. Chưa viết; làm bản thử swap trước.
5. **Nạp điện cho AI**: cần giá/gói, địa chỉ nhận tiền (không tự đoán), cách xác minh giao dịch.
6. Dọn nhỏ: tách `chat.ts` (≈1.540 dòng) thành module; xóa chữ `en/vi` không dùng trong `BULLETS` (`functions/_lib/intake.ts`); 8 cảnh báo lint (chủ yếu `set-state-in-effect`); xóa secret `GEMINI_API_KEY`; verify nguồn factory trên explorer.
