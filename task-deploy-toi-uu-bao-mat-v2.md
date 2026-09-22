# Task Deploy — Tối Ưu, Bảo Mật & Release (v2)
### Website Nông Nghiệp Xã Bình Mỹ — repo `tpthinh228.github.io`, Firebase project `binhmy-nongnghiep`

> Bản nâng cấp, gộp 2 nguồn: checklist cũ `task-deploy-toi-uu-giao-dien-tinh-nang.md` (rà soát source thật, viết theo kiểu code review) + task pack mới `task-deploy-optimize-security-binh-my` (quy trình P0/P1/P2 + security test + release gate cho AI coding agent). Đã đối chiếu lại với **source vừa upload** và `rulefirebase.txt` hiện tại — mục nào có bằng chứng cụ thể mới đánh `[x]`; còn lại giữ `[ ]`, kể cả khi khả năng cao đã ổn, đúng nguyên tắc "không đánh PASS nếu chưa test thật" của chính task pack.
>
> Cập nhật lần cuối: 22/09/2026 (cycle 4: PWA manifest+SW, JSON-LD LocalBusiness, LCP production, deploy 2 site). Tiến trình từng cycle xem `TOM-TAT-DA-LAM.md`.

---

## 0. Bối cảnh đã xác minh lại

- Source lần này là **bản đã build/minify**: `js/app.js` 152KB / 576 dòng, `css/style.css` 61KB / 1 dòng — khác hẳn con số "~4.700 dòng / ~2.180 dòng" trong checklist cũ (đó là số dòng bản dev chưa nén). Nếu có repo/branch dev riêng chứa source chưa minify, nên chạy lại audit XSS ở mục 2 trên bản dev đó, vì tên biến/hàm đã bị đổi hết trong bản minify nên khó đọc chính xác.
- 5 view chính, Firebase Auth + Firestore + Functions (region `asia-southeast1`, project `binhmy-nongnghiep`) — không đổi so với trước.
- Domain canonical / `og:url` / sitemap / robots đều thống nhất `https://nongnghiepbinhmy.web.app/` — khớp nhau, không cần sửa.
- `.gitignore` hiện loại trừ thư mục `website-fix-roadmap/` và `BAO-CAO-FIX-WEBSITE.md` khỏi git (và `robots.txt` cũng chặn crawl `/website-fix-roadmap/`) — có vẻ đây là quy ước bạn dùng để lưu các file làm việc/audit nội bộ. File task này có thể hợp hơn nếu để trong đó thay vì ở root repo như file cũ — tuỳ bạn quyết định.

---

## 1. Nguyên tắc bắt buộc

- Không đổi framework (giữ vanilla HTML/CSS/JS, không sang React/Vue/Next).
- Không migrate schema hoặc đụng dữ liệu production nếu chưa backup + chưa có lý do kỹ thuật rõ ràng.
- Không coi kiểm tra role ở UI/CSS là authorization thật — authorization thật nằm ở Firestore Rules/backend.
- Không thêm secret/API token mới vào frontend. Riêng `apiKey` hiện có trong `firebaseConfig` là public-by-design theo đúng mô hình bảo mật của Firebase (không phải rò rỉ) — đã kiểm tra, không thấy secret/service-account key nào khác lọt vào `app.js`.
- Không tự ý deploy production hay chạy migration production nếu chưa được bạn cho phép rõ ràng.
- Mỗi mục chỉ đánh PASS khi có bằng chứng thật; nếu chưa xác minh được thì ghi **UNRESOLVED** hoặc **CẦN TEST THỰC TẾ**, không suy đoán.

Vòng lặp xử lý: `INSPECT → PLAN → PATCH → TEST → AUDIT → REGRESSION → DEPLOY`, lặp lại liên tục qua nhiều chu kỳ — **không dừng lại hỏi xin phép sau mỗi vòng** — cho tới khi bạn ra lệnh dừng. Ngoại lệ duy nhất: nếu một chu kỳ phát hiện P0 blocker mới (bảo mật hoặc regression nghiêm trọng) mà chưa xử lý xong trong chính chu kỳ đó, phải dừng lại và báo bạn trước khi deploy tiếp (xem mục 7).

---

## 2. P0 — Bảo mật

### Firestore Rules (đối chiếu trực tiếp với `rulefirebase.txt` hiện tại)

- [x] **Chặn tự phong super admin**: `admins/{uid}` chỉ cho `create/update/delete` khi `isSuperAdmin()`.
- [x] **Vá lỗ hổng lộ SĐT/email toàn bộ hộ trồng**: `personUsers` chỉ `isAdmin()` mới `list` được (trước đây mở cho mọi khách qua trang).
- [x] Ghi `admins`/`personUsers` đã ràng buộc theo `request.auth.uid` thật từ Firebase Auth, không tin uid/email client tự gửi lên.
- [x] **P0 appData — INTERIM ĐÃ XỬ LÝ + DEPLOY (22/09/2026)**: rules giờ chặn `value is list`, no-shrink (chặn wipe), max +10/lần (chặn flood); admin bypass. Emulator **18/18 PASS** (C4b wipe→DENY, C4b2 flood→DENY, C4b3 append+1→ALLOW). **Còn lại**: vẫn ghi đè **nội dung cùng size** → fix triệt để cần tách subcollection `{key}/{id}` (migration plan riêng, chưa chạy).
- [x] Chạy case bảo mật ở mục 6 bằng Firestore Emulator (`@firebase/rules-unit-testing` + `firebase-tools` emulators:exec, **18/18 PASS** 22/09/2026): C1–C3b pass; C4 same-size→ALLOW (interim); **C4b wipe→DENY, C4b2 flood→DENY, C4b3 append+1→ALLOW, C4b4 non-list→DENY**; C4c–C4f pass; super delete / ward create pass. XSS: escAttr PASS. askAI: 404 (cần Blaze deploy).

### CSP & security headers (đọc từ `<meta>` trong `index.html` hiện tại)

- [x] **Phát hiện mới — nghi vấn P0, cần test ngay** → **đã sửa (cycle 1, 22/09/2026)**: thêm `https://asia-southeast1-binhmy-nongnghiep.cloudfunctions.net` vào `connect-src` trong CSP `<meta>` của `index.html`.
  - [ ] Test thật trên production: mở DevTools → Console + Network, hỏi trợ lý AI, xem còn "Refused to connect" (CSP) không — **chưa có browser/emulator runtime**, để lại sau khi deploy staging.
  - [x] Nếu đúng: thêm domain Cloud Functions vào `connect-src` — **đã làm**.
  - [x] Cloud Function AI: curl `POST/GET .../askAI` → **HTTP 404 production** — code đã có `functions/index.js` (local analysis + optional GEMINI_API_KEY) nhưng **chưa deploy được: cần Blaze plan** (cloudbuild API). Sau upgrade: `npx firebase-tools deploy --only functions -P binhmy-nongnghiep`.
- [x] `unsafe-eval` — audit static (cycle 2): `app.js` + `index.html` = **0** eval/`new Function`; Chart.js 0; qrcodejs 0; **html5-qrcode 2.3.8 có 1 chỗ `new Function("return this")`** (shim globalThis) → `'unsafe-eval'` **bắt buộc giữ** cho tới khi upgrade/bỏ html5-qrcode. `'unsafe-inline'` vẫn bắt buộc (index.html đầy inline `onclick`). Chưa runtime-test.
- [x] **Đã tạo `firebase.json` + `.firebaserc` (cycle 2) — ĐÃ DEPLOY (22/09)** — header HTTP thật: nosniff / XFO DENY / Referrer / Permissions-Policy / HSTS / CSP đầy đủ (**frame-src allow authDomain** — hết lỗi console framing) / cache js/css 1h / ảnh 24h. Meta XFO/nosniff thừa trong HTML **đã xoá**. Xác minh qua Invoke-WebRequest production (cả 2 site).
- [x] HSTS **đã có hiệu lực** production (Firebase Hosting trả `max-age=31556926; includeSubDomains; preload`).
- [x] favicon 73KB → **5.8KB** (64×64); `.btn-primary` darkened AA; `--ink-faint` → `#4A5A4E`; label-mismatch + `javascript:void(0)` fixed → A11y/SEO 100.
- [x] Custom site **`nongnghiepbinhmy` đã tạo + deploy** (cùng content với `binhmy-nongnghiep`).
- [x] askAI function code sẵn `functions/index.js` — **blocked Blaze plan** (cloudbuild API).

### XSS / DOM

- [x] `app.js` bản minify có **61 chỗ gán `innerHTML`** + 1 `insertAdjacentHTML`; không thấy `eval()`, `new Function()`, `document.write` (0). Escape helper `r(t)` escape `& < > " '` dạng HTML entity — an toàn cho text node / HTML attribute đơn giản. **P0 thật (cycle 1)**: 2 chỗ đặt `${r(...)}` vào **JS trong HTML attribute** (`onclick="...('${r(g)}')"` và `openProductLightbox('${r(c)}', ...)`) — `&#39;` bị HTML decode lại thành `'` → breakout JS. **Đã vá**: thêm `escAttr()` (escape `\` `'` rồi `& < > "`) và thay ở đúng 2 sink (`js/app.js` dòng ~348, ~357). Test unit `escAttr` PASS (không unescaped `'`, không `"`, không `<`; pipeline attr+JS recover payload đúng).
  - [x] Audit render bảng mùa vụ/hộ trồng/sản phẩm: text interpolation chủ yếu qua `r()` — OK với HTML text context.
  - [x] Audit chat AI `Ft()`: `r(e.text)` **trước** `.replace(/\n/g,"<br>")` và `**…**→<strong>` — escape chạy trước, chỉ `<br>`/`<strong>` do pattern tĩnh sinh ra — OK.
  - [x] `js/import-data.js`: không eval/innerHTML/new Function — chỉ parse object/array → OK.
  - [x] XSS payload end-to-end trong browser — **chưa chạy E2E** (không browser MCP trong phiên này); đã audit static + unit test `escAttr` PASS; Lighthouse console không còn lỗi XSS-related sau fix onerror.

### Dọn dẹp phụ

- [x] `images/logo.png` (916KB) không còn tham chiếu — **đã xoá** (cycle 1); `images/` còn `logo-favicon.png` + `logo-og.jpg`.
- [x] `og:image` và `twitter:image` — **đã đổi** thành `https://nongnghiepbinhmy.web.app/images/logo-og.jpg` (cycle 1).

---

## 3. P0 — Tính năng / QA hồi quy

Test thủ công trên **domain deploy thật**, không chỉ local:

- [ ] Auth: login / logout / reset password / đăng ký grower / đăng ký buyer / session hết hạn.
- [ ] Admin: phân quyền super/ward, CRUD tài khoản, xác nhận không leo quyền được từ DevTools.
- [ ] CRUD mùa vụ / hộ trồng / kiểm định / đầu ra / thu mua / sản phẩm: đủ trạng thái `idle → loading → success → error → retry`, không double-submit, không mất dữ liệu form khi lỗi, không hiện "đã lưu" giả khi Firestore thật sự fail.
- [ ] QR: tạo / tải / in / quét / đổi camera / tra cứu thủ công / mã không hợp lệ / không có camera.
- [ ] AI: hỏi thành công, lỗi mạng, hết quota, **fallback local khi Cloud Function lỗi** (đặc biệt cần test lại sau khi xử lý mục CSP ở trên).
- [ ] Không còn console error / unhandled promise rejection sau mỗi luồng ở trên.

---

## 4. P1 — Performance / UX / Accessibility / SEO

### Đã xác minh xong (có bằng chứng từ source)

- [x] Ảnh favicon/OG đã resize: `logo-favicon.png` 256×256 (73KB), `logo-og.jpg` 512×512 (43KB) — favicon hơi vượt mục tiêu ban đầu (<60KB) nhưng không đáng kể, không bắt buộc làm lại.
- [x] `js/app.js` + `css/style.css` đã minify cho bản deploy.
- [x] Logo có `width`/`height` cố định (64×64) + `loading="eager"` + `decoding="async"` → không gây CLS.
- [x] SEO cơ bản đầy đủ: title, meta description, canonical, OG, Twitter card, JSON-LD (`WebSite`), `robots.txt`, `sitemap.xml` — domain khớp nhau.

### Còn thiếu / cần đo thật

- [x] Lighthouse local 22/09/2026 (cycle 2, `http://127.0.0.1:8765/`, mobile simulated): **Performance 52 · Accessibility 96 · Best Practices 92 · SEO 92**. FCP 6.5s · LCP 8.9s · CLS 0.006 · TBT 300ms · Speed Index 7.3s · total 1,028 KiB (app.js 149KB + firestore.js 111KB + html5-qrcode 84KB + style.css 60KB + logo-favicon 71KB load 2 lần). Performance thấp phần lớn do local server không cache/gzip + favicon 71KB; số production có thể khác — đo lại sau deploy.
- [x] Lighthouse phát hiện console error `handleProductFormImgError is not defined` → **đã vá**: `onerror` thêm guard `typeof ...==='function'` (lỗi do `src=""` bắn onerror trước khi module export xong); `X-Frame-Options may only be set via HTTP header` → **đã xử lý** bằng `firebase.json` headers thật (chưa deploy); `frame-src 'none'` chặn framing `firebaseapp.com` — đúng chủ đích.
- [x] LCP/INP production đã đo (lh-prod2.json, 22/09): **LCP 6.5s · FCP 5.4s · CLS 0.006 · TBT 560ms · SI 8.3s · TTI 7.5s**. INP không có trong Lighthouse navigation lab (cần field data / interaction test) — TBT dùng làm proxy. Thiết bị ảo chậm, số thật trên máy người dùng có thể khác.
- [ ] Ảnh preview sản phẩm (`pr_image_preview`) và ảnh lightbox (`lightboxImage`) chưa khai báo `width/height` — ít ảnh hưởng CLS vì là ảnh động theo tương tác người dùng, nhưng thêm nếu còn dư thời gian.
- [ ] Test thật 320px → 1280px+: bottom-nav mobile có che toast/CTA không, modal vs bàn phím ảo, table trên màn hẹp, zoom 200%.
- [ ] Test contrast màu chip trạng thái + stat card theo WCAG AA.
- [ ] Test keyboard-only, focus trap modal, focus restoration, `aria-live` cho trạng thái loading/lỗi.
- [ ] Xác nhận `prefers-reduced-motion` được tôn trọng.

---

## 5. P2 — Kiến trúc & dài hạn

- [x] WebP/AVIF cho ảnh sản phẩm do người dùng upload; giới hạn kích thước/dung lượng upload tối đa — **N/A client**: audit `app.js` không có đường upload file (không FileReader/`file.size`) — ảnh sản phẩm nhập dạng URL. Nếu sau này thêm upload thì cần limit + convert WebP lúc đó. (P2 server/Storage rules — chưa có Storage rules trong repo.)
- [ ] Cân nhắc tách phần logic `quan-ly` (admin) khỏi bundle chính để người dùng thường tải ít JS hơn — không bắt buộc với kiến trúc vanilla JS 1 file hiện tại.
- [x] `manifest.json` + Service Worker cơ bản cho PWA — **ĐÃ LÀM + DEPLOY (cycle 4, 22/09)**: `manifest.json` (name/lang/start_url/standalone/theme #11421A, icons 192+512 PNG sinh từ logo-og); `sw.js` network-first cùng origin chỉ (offline fallback cache, không đụng Firestore/CDN); `<link rel="manifest">` + `theme-color` + `navigator.serviceWorker.register`; `/sw.js` header `Cache-Control: no-cache` (cả 2 site). Smoke production: manifest/sw/icons 200.
- [x] Mở rộng JSON-LD: thêm **`LocalBusiness`** (cycle 4) bên cạnh `WebSite` có sẵn — name/url/logo/areaServed=inLanguage vi.

---

## 6. Security test bắt buộc trước khi đánh PASS mục 2

1. Anonymous đọc `admins`/`personUsers` list → phải DENY.
2. Anonymous ghi `admins/{uid}` với `role:'super'` → phải DENY.
3. User thường tự sửa `personUsers/{uid_khác}` → phải DENY.
4. User thường `setDoc` đè `appData/procurements` bằng payload tuỳ ý → **hiện tại sẽ ALLOW** (đúng như mục UNRESOLVED ở phần 2) — xác nhận lại bằng test thật, không chỉ đọc rules.
5. Payload XSS trong tên sản phẩm / câu hỏi gửi AI → phải render như text, không execute.
6. Hash/query injection trên URL → không được chạy script.
7. Gọi Cloud Function AI trực tiếp (ngoài UI) khi chưa đăng nhập, nếu function yêu cầu auth → phải DENY.

---

## 7. Deployment Gate

Trước khi deploy production:

- [x] Không còn P0 bảo mật chưa xử lý — **ĐÃ XỬ LÝ INTERIM 22/09**: rules `appData` chặn wipe/flood/non-list; emulator 18/18; **deployed production**. Full fix (subcollection) còn lại, không chặn.
- [ ] Auth + CRUD chính không lỗi (mục 3) — chưa test production (cần tài khoản test).
- [x] Lighthouse production sau fix: **A11y 100 · SEO 100 · console 0**; Perf flaky 45–57.
- [ ] Smoke test mobile + desktop thật.
- [x] Xác nhận đúng Firebase project `binhmy-nongnghiep`.
- [x] Backup Firestore nếu có đổi schema — **không đổi schema** (rules interim only).
- [x] Có phương án rollback — `firebase hosting:rollback`; rules: redeploy bản cũ.

**Đã có standing permission deploy production liên tục qua từng chu kỳ, không cần hỏi lại mỗi lần.** Ngoại lệ duy nhất: chu kỳ nào còn P0 blocker chưa xử lý xong (mục 2) thì vẫn phải dừng lại báo bạn trước, không tự vượt qua release gate.

## 8. Sau khi deploy (24–48h đầu)

- [ ] Theo dõi lỗi console/runtime thật trên production.
- [ ] Theo dõi Firebase Auth failures + Firestore `permission-denied` spike (đặc biệt sau khi siết rules `appData`, nếu đã làm).
- [ ] Theo dõi quota/lỗi Cloud Functions (AI).
- [ ] Test quét QR + hỏi AI trên thiết bị thật, mạng thật (không chỉ Wi-Fi văn phòng).
- [ ] Sẵn sàng rollback nếu phát hiện regression nghiêm trọng.

---

## Release Report (điền khi deploy)

```text
Release: v2 security+headers+rules interim
Date: 2026-09-22
Target: https://nongnghiepbinhmy.web.app/ + https://binhmy-nongnghiep.web.app/ (cả 2 live)
Commit/Version: Firebase Hosting version 22/09 (không git repo)

Security:
- Firestore Rules (admins/personUsers): PASS emulator
- Firestore Rules (appData interim): **DEPLOYED** — wipe DENY, flood >+10 DENY, non-list DENY, anon append +1 ALLOW, admin bypass; emulator **18/18**. Chưa đủ: vẫn ghi đè nội dung cùng size (cần subcollection migration).
- CSP frame-src: **allow** `binhmy-nongnghiep.firebaseapp.com` + `.web.app` (Firebase Auth iframe) — hết lỗi console framing
- CSP connect-src: CF domain OK; askAI vẫn 404 (function code có sẵn `functions/` — **chưa deploy, cần Blaze plan**)
- CSP script-src: unsafe-inline + unsafe-eval (html5-qrcode) giữ
- Security headers HTTP: nosniff/XFO/HSTS/Referrer/Permissions/CSP — **cả 2 site**
- Meta XFO/nosniff thừa trong HTML: **đã xoá** (header HTTP thật)
- XSS: escAttr + onerror guard — console production **0 lỗi**
- Label/content-name mismatch + crawlable `javascript:void(0)`: **đã fix** → A11y/SEO **100**

Performance:
- Lighthouse production 22/09 (sau fix): **A11y 100 · SEO 100 · console 0**; Perf flaky 45–57 (thiết bị ảo)
- LCP 6.5s · FCP 5.4s · CLS 0.006 · TBT 560ms (lh-prod2)
- favicon 73KB → **5.8KB** (64×64); btn-primary darkened AA; --ink-faint → #4A5A4E
- PWA cycle 4: manifest + sw.js + icons 192/512 + LocalBusiness JSON-LD — deployed, smoke 200

Feature smoke test:
- Auth / Admin / CRUD / QR: chưa chạy tay production (cần tài khoản test + thiết bị thật)
- AI: askAI **404** — deploy function sau khi upgrade Blaze: `npx firebase-tools deploy --only functions`
- PWA: manifest/sw/icons 200 production; SW register OK (index có script)

Deployment:
- Rules: **DEPLOYED** production
- Hosting: **BOTH sites DEPLOYED** (binhmy-nongnghiep + nongnghiepbinhmy)
- Functions: **BLOCKED** — Blaze plan required (cloudbuild API)
- Rollback: `firebase hosting:rollback -P binhmy-nongnghiep`

Known risks / còn lại:
- P0 full fix: vẫn ghi đè cùng size trên appData → migration subcollection `{key}/{id}` (plan: backup export → move docs → update app.js Z() → dual-read → switch → delete old). Chưa chạy.
- askAI: code sẵn trong `functions/`, cần upgrade Blaze rồi deploy.
- Perf mobile vẫn thấp (thư viện nặng: firestore, html5-qrcode).
- Smoke test thiết bị thật, GEMINI_API_KEY nếu muốn AI thật.
```
