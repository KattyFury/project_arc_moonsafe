# Kiểm giao diện bằng trình duyệt thật (sandbox Arc Studio, không cần sudo, không gọi model)

Dùng khi cần đo layout/chiều cao/tràn chữ thay vì đoán. Không tốn token.

1. `mkdir -p /tmp/pw && cd /tmp/pw && bun add playwright-core` rồi `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw/browsers bunx playwright-core install chromium-headless-shell`.
2. Thiếu thư viện hệ thống (không có sudo): `apt-get download` các gói `libnss3 libnspr4 libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxi6 libxcb1 libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 libgbm1 libxkbcommon0 libdrm2 libwayland-server0 fonts-dejavu-core` với `APT_CONFIG` trỏ vào thư mục /tmp (cần `apt-get update` vào thư mục đó), giải nén bằng `dpkg-deb -x` vào `/tmp/libs`.
3. Đặt `LD_LIBRARY_PATH=/tmp/libs/usr/lib/x86_64-linux-gnu:/tmp/libs/lib/x86_64-linux-gnu` và `FONTCONFIG_FILE` (một `fonts.conf` trỏ `<dir>` tới `/tmp/libs/usr/share/fonts`). KHÔNG có font thì Chromium chết với "SkFontMgr not implemented" hoặc đo chữ sai.
4. Chạy `bunx vite --port 5174 --host 127.0.0.1` trong repo, tạo `harness.html` + `src/harness.tsx` import đúng component cần xem (ví dụ `IntakeFormCard`, `ItemsCard`, `Stats`), điền/nhấn bằng playwright, đo `getBoundingClientRect`, chụp ảnh. XÓA harness trước khi commit.
5. Lưu ý: phải mở trang hai lần (lần đầu Vite tối ưu phụ thuộc rồi tải lại), và không `pkill -f "vite --port 5174"` (khớp luôn shell chạy lệnh).
6. Font DejaVu rộng hơn SF Pro nên chữ ở đây dài hơn thật một chút: nếu vừa ở đây thì vừa trên máy người dùng.
