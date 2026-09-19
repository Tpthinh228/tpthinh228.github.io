# PROJECT_KNOWLEDGE.md — Bình Mỹ农业平台

## 1. Tổng quan dự án

- **Tên:** Nông nghiệp xã Bình Mỹ — Nông nghiệp kết nối
- **Loại:** Pure HTML/CSS/JS (no build tools, no framework)
- **Hosting:** Firebase Hosting (`nongnghiepbinhmy.web.app`)
- **Backend:** Firebase (Firestore, Auth, Functions)
- **Ngôn ngữ:** Tiếng Việt (UI), English (code comments)

## 2. Kiến trúc file

```
├── index.html              # Single-page app (~1883 dòng)
├── css/
│   └── style.css           # Tất cả CSS (~2215 dòng)
├── js/
│   ├── app.js              # Main logic (~4691 dòng) — Firebase, auth, CRUD, UI rendering
│   └── import-data.js      # Helper import dữ liệu test (37 dòng)
├── images/
│   └── logo.png            # Logo Bình Mỹ
├── fonts/                  # Font directory (empty or custom)
├── deploy/                 # Tài liệu triển khai
│   ├── TASK_UIUX_LOG.md    # Log các việc UI/UX đã/làm chưa làm
│   └── PROJECT_KNOWLEDGE.md # File này
└── TASK_UIUX_OPTIMIZATION_BINH_MY.md  # Task gốc yêu cầu UI/UX
```

## 3. Design System hiện tại

### CSS Variables (`:root`)
| Loại | Tokens |
|------|--------|
| Màu sắc | `--canvas`, `--surface`, `--ink`, `--ink-soft`, `--ink-faint` |
| Chính | `--paddy` (xanh lá), `--river` (xanh dương), `--papaya` (cam), `--bloom` (tím) |
| Mỗi màu có 3 cấp | base, `-deep` (đậm), `-tint` (nhạt nền) |
| Đường kẻ | `--line` |
| Nguy hiểm | `--danger` |
| Shadow | `--shadow`, `--shadow-sm`, `--shadow-md`, `--shadow-lg` |
| Spacing | `--sp-1` đến `--sp-8` (4px base) |
| Border radius | `--r-sm/md/lg/xl` |
| Transition | `--ease`, `--dur-fast/normal/slow` |
| Touch | `--touch-min: 44px` |

### Font
- **Heading:** Space Grotesk (500/600/700)
- **Body:** Inter (400/500/600/700)

### Responsive Breakpoints
| Width | Layout |
|-------|--------|
| ≥768px | Desktop — topbar, quick-nav-bar, desktop tables |
| ≤767px | Mobile — bottom nav, mobile cards, mobile search |
| ≤640px | Mobile small — stacked modals, smaller typography |
| ≤480px | Product grid 2 columns |
| ≤340px | Product grid 1 column |

## 4. Component System

### Navigation
- **Desktop:** Topbar sticky + Quick nav bar (horizontal scroll)
- **Mobile:** Bottom dock 6 items (Trang chủ, Sản phẩm, QR center, Kiểm định, AI, Thêm)
- **QR Button:** Center-highlighted với pulse animation

### Cards
- **Product card:** Image + badges + title + price + cert + actions
- **Proc card:** Media + status badge + quantity + price + location + actions
- **Stat card:** Number + label + icon
- **Mobile action cards:** Icon + title + subtitle grid

### Forms (Modals)
- Overlay system: `.overlay` → `.modal`
- Mobile: slides up from bottom (bottom sheet)
- Auth modals: center-positioned (`.overlay-center`)
- ~15 modals: season, household, quality, output, procurement, product, buy, apply, QR scan, QR detail, QR print, help, auth, password, accounts

### Tables
- Desktop: `.table-wrap` with sticky headers
- Responsive: `overflow-x: auto`

### Feedback
- Toast stack (bottom-right, repositioned for mobile)
- Smart alert panel (danger/warning/info/success)
- Form validation: `.field.has-error` + `.field-error-msg`

## 5. Business Logic (từ app.js)

### Collections Firestore
- `seasons` — Mùa vụ
- `households` — Hộ trồng
- `qualityTests` — Kiểm định chất lượng
- `outputs` — Đầu ra / giao dịch
- `procurements` — Tin thu mua
- `products` — Sản phẩm đang bán
- `admins` — Tài khoản cán bộ

### Auth Roles
- `super` — Quản trị viên xã (toàn quyền)
- `ward` — Cán bộ ấp (giới hạn theo ấp)
- `grower` — Hộ种植 (đăng bán sản phẩm)
- `buyer` — Quán ăn/Chợ (đăng tin cần mua)

### Features
- CRUD seasons, households, quality, outputs, procurements, products
- QR code scan (html5-qrcode) + manual lookup
- QR code generate + print (qrcodejs)
- Product detail modal with timeline
- AI chat (trợ lý nông nghiệp)
- CSV export
- Test data import (JSON)
- Offline detection
- Chart.js yield visualization

## 6. External Libraries (lazy-loaded)
| Library | Purpose |
|---------|---------|
| Chart.js 4.4.4 | Yield charts |
| html5-qrcode 2.3.8 | Camera QR scanner |
| qrcodejs 1.0.0 | QR code generation |

## 7. What AI đã học được

### Patterns
1. **No build tools** — edits directly to CSS/JS/HTML, no compilation
2. **Firebase modular SDK v10** — imports from gstatic CDN, not npm
3. **Mobile-first bottom nav** — `position: fixed; bottom: 0` với safe-area-inset
4. **Desktop/Mobile split** — CSS classes `.desktop-only-*` / `.mobile-only-*` với media queries 768px
5. **Overlay modal system** — `.overlay.show` + `.modal` với slide-up animation on mobile
6. **Form validation pattern** — `field.has-error` + `field-error-msg.show` + inline error messages
7. **Icon system** — SVG `<symbol>` + `<use href>` — không dùng icon font

### Anti-patterns cần tránh
1. **Không đổi Firebase config** — apiKey, projectId đã hardcode
2. **Không xóa features** — task yêu cầu giữ nguyên logic
3. **Không đổi data structures** — Firestore schema đã có sẵn
4. **Không thêm dependencies** — pure HTML/CSS/JS, không npm

### Keyboard shortcuts
- Tab navigation: skip-link → topbar → quick-nav → main content
- Escape: đóng modal
- Enter: submit form, trigger button

## 8. Files đã sửa trong session này

| File | Thay đổi |
|------|----------|
| `css/style.css` | +56 -19 dòng: tokens, a11y, touch targets, toast fix |
| `index.html` | +2 dòng: skip-link |
| `deploy/TASK_UIUX_LOG.md` | Mới: log UI/UX tasks |
| `deploy/PROJECT_KNOWLEDGE.md` | Mới: file này |

## 9. Git Info
- **Repo:** `https://github.com/tpthinh228/tpthinh228.github.io`
- **Branch:** `main`
- **Latest commit:** `86c3428` — UI/UX improvements
- **Hosting:** Firebase Hosting
