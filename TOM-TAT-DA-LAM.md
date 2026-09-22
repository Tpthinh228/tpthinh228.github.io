# Tóm tắt đã làm — Task Deploy v2 (Bình Mỹ)

**Ngày:** 22/09/2026 · **Project:** `binhmy-nongnghiep` · **Sites:** https://nongnghiepbinhmy.web.app/ + https://binhmy-nongnghiep.web.app/

## Tiến trình (lưu lại)

| Cycle | Việc đã xong | Trạng thái |
|-------|--------------|------------|
| 1 | CSP connect-src CF; og:image absolute; CDN pin; escAttr 2 sink XSS (test PASS); xoá logo.png 916KB; emulator rules lần đầu | ✅ |
| 2 | `firebase.json` + `.firebaserc` (2 site, headers, cache); audit unsafe-eval; Lighthouse local **52/96/92/92**; fix `onerror` typeof | ✅ |
| 3 | frame-src allow authDomain; contrast/label/void(0) → A11y+SEO **100**; favicon 73→5.8KB; **rules appData interim 18/18**; deploy rules + hosting 2 site; tạo site `nongnghiepbinhmy`; `functions/` code sẵn | ✅ |
| 4 | PWA `manifest.json` + `sw.js` + icons 192/512 + no-cache; JSON-LD LocalBusiness; LCP production điền task; smoke manifest/sw 200; deploy lại 2 site | ✅ |
| — | Release Report + checkbox task file cập nhật; `TOM-TAT-DA-LAM.md` | ✅ |

**Đang chờ (blocked):** ① Blaze → deploy functions (askAI 404) ② phép migration `appData` subcollection ③ tài khoản test → smoke Auth/CRUD/QR tay.

**Checkpoint file:** `task-deploy-toi-uu-bao-mat-v2.md` (checkbox + Release Report) · `TOM-TAT-DA-LAM.md` (file này). Rollback: `firebase hosting:rollback -P binhmy-nongnghiep`.

## Bảo mật (P0)

- **Firestore Rules — DEPLOYED**:
  - `admins`/`personUsers`: chỉ super/admin; chặn tự phong quyền, chặn lộ SĐT.
  - `appData` **interim**: chặn wipe (no-shrink), flood (>+10/lần), non-list; admin bypass; anon append +1 vẫn cho. Emulator **18/18 PASS**.
  - **Còn hở**: ghi đè nội dung cùng size → cần migration subcollection `{key}/{id}` (chưa chạy, cần phép).
- **CSP + security headers (HTTP thật, cả 2 site)**: nosniff, XFO DENY, HSTS, Referrer, Permissions-Policy, CSP đầy đủ (`frame-src` allow authDomain Firebase Auth; `connect-src` allow Cloud Functions). Meta XFO/nosniff thừa trong HTML đã xoá.
- **XSS**: vá 2 sink JS-in-attribute bằng `escAttr()` (unit test PASS); `onerror` guard `typeof`.
- **unsafe-eval**: giữ (html5-qrcode 1 chỗ `new Function` shim); 0 eval ở app code.

## Performance / A11y / SEO

- Lighthouse **production** (sau fix): **A11y 100 · SEO 100 · console 0 lỗi**; Perf 45–57 (thiết bị ảo).
- LCP 6.5s · FCP 5.4s · CLS 0.006 · TBT 560ms.
- favicon 73KB → **5.8KB**; contrast AA (`--ink-faint`, `.btn-primary`); label-mismatch + `javascript:void(0)` fixed.
- Xoá `logo.png` 916KB; CDN pin version (Chart.js, qrcodejs, html5-qrcode).

## Mới thêm (cycle 4)

- **PWA**: `manifest.json` + `sw.js` (network-first, offline cache) + icons 192/512 + register; `/sw.js` = `no-cache`.
- **JSON-LD**: thêm `LocalBusiness`.
- Smoke production: manifest/sw/icons **200**.

## Bảng so sánh — mỗi lần update & lợi ích hiệu suất

| Cycle | Update | Lợi ích hiệu suất / chỉ số |
|-------|--------|----------------------------|
| 0 (baseline) | Chưa fix gì — Lighthouse local đo trước | **Perf 52 · A11y 96 · BP 92 · SEO 92**; FCP 6.5s · LCP 8.9s · TBT 300ms · SI 7.3s · tổng **1.028 KiB**; favicon 71KB load 2 lần; console có lỗi `handleProductFormImgError` |
| 1 | Xoá `logo.png` **916KB** (không tham chiếu) | Repo gọn nhẹ; không còn rủi ro load nhầm; giảm dung lượng deploy |
| 1 | CDN pin version (Chart.js 4.4.1, qrcodejs 1.0.0, html5-qrcode 2.3.8) | Cache CDN ổn định giữa các lần tải; tránh breaking change lặng |
| 1 | `escAttr()` vá 2 sink XSS | Không đổi perf; **bảo mật** (unit test PASS) |
| 2 | favicon 73KB → **5.8KB** (64×64) | **−67KB** mỗi lần load favicon; local trước khi fix favicon vẫn 71KB × 2 →贡献 lớn vào 1.028 KiB |
| 2 | `firebase.json` headers + cache 1h/24h | Repeat visit: js/css/ảnh serve từ cache HTTP → **nhanh hơn lần 2+** |
| 2 | Fix `onerror` guard (`typeof`) | Console **0 lỗi** → BP không bị trừ; không còn exception chặn luồng render |
| 3 | Label-mismatch + `javascript:void(0)` + contrast AA | **A11y 96 → 100 · SEO 92 → 100** (production); không đổi Perf |
| 3 | Meta XFO/nosniff thừa xoá | Header HTTP thật thay; tránh cảnh báo devtools; không đổi perf |
| — | **Lighthouse production lần 1** (sau fix HTML/CSS) | **Perf 0.57 · A11y 100 · BP · SEO 100**; FCP 4.7s · LCP 4.9s · CLS 0.006 · TBT 360ms · **700 KiB** (đã nén/gzip so 1.028 KiB local) |
| — | **Lighthouse production lần 2** (sau CSP frame-src fix) | **A11y 100 · SEO 100 · console 0**; LCP 6.5s · FCP 5.4s · TBT 560ms · SI 8.3s · CLS 0.006 — Perf **flaky 45–57** do thiết bị ảo chậm (benchmarkIndex thấp), không phải regression thật |
| 4 | PWA: `manifest.json` + `sw.js` (network-first, offline cache) | Lượt 2+: asset cùng origin **phục vụ từ cache khi offline**; install app-like; **không đổi Lighthouse Perf** (vẫn network-first khi online) |
| 4 | Icons 192/512 + `theme-color` + `LocalBusiness` JSON-LD | PWA installable; **SEO** rich-result potential; không đổi perf |

**Tóm tắt xu hướng:** A11y/SEO/ console → **100/100/0** (cycle 3); payload **1.028 → 700 KiB** (favicon + gzip); CLS giữ **0.006** suốt; Perf lab vẫn 45–57 do throttling ảo — **lợi ích perf thật** nằm ở cache HTTP + SW offline, không phải score.

| Hạng mục | Trạng thái |
|----------|------------|
| Firestore rules | **DEPLOYED** |
| Hosting (2 site) | **DEPLOYED** |
| Functions (askAI) | **BLOCKED** — cần Blaze plan |
| Rollback | `firebase hosting:rollback -P binhmy-nongnghiep` |

## Còn lại / chờ bạn

1. **Upgrade Blaze** → deploy `functions/` (askAI đang 404).
2. **Cho phép migration** `appData` → subcollection (fix cùng-size overwrite).
3. **Tài khoản test** → smoke Auth/CRUD/QR production tay.
4. P2 chưa làm: tách bundle admin, WebP (không có upload client — N/A), theo dõi 24–48h sau deploy.

Chi tiết đầy đủ: `task-deploy-toi-uu-bao-mat-v2.md` (Release Report ở cuối).
