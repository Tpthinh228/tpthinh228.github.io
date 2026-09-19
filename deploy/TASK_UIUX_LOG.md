# UI/UX Optimization Log — Bình Mỹ

## Đã hoàn thành

### 1. Design Tokens (`:root`)
| Token | Giá trị | Mục đích |
|-------|---------|----------|
| `--sp-1` → `--sp-8` | 4px–32px | Spacing scale chuẩn |
| `--r-sm/md/lg/xl` | 7px–18px | Border radius scale |
| `--shadow-md/lg` | box-shadow | Shadow depth levels |
| `--ease` | cubic-bezier(0.25,0.1,0.25,1) | Transition easing chung |
| `--dur-fast/normal/slow` | 0.12s/0.2s/0.35s | Transition duration |
| `--touch-min` | 44px | Touch target minimum |

### 2. Accessibility
- Thêm `<a class="skip-link">` đầu `<body>` — hiện khi bấm Tab, cho phép keyboard user nhảy thẳng đến nội dung chính

### 3. Button Touch Target
- Tất cả `.btn` có `min-height: 44px`, `display: inline-flex`, `align-items: center`
- `.btn-sm` có `min-height: 34px`

### 4. Form Input Consistent
- `min-height: 44px` cho tất cả `select/input/textarea`
- Focus ring: `box-shadow: 0 0 0 3px var(--paddy-tint)` + `border-color: var(--paddy)`

### 5. Modal Close Button
- `min-width/min-height: 44px`
- Hover background: `var(--canvas)`
- Flex centering

### 6. Toast Mobile Fix
- Toast stack: `bottom: calc(64px + safe-area + 12px)` — không đè bottom nav
- Toast full-width trên mobile: `left: 12px; right: 12px`

### 7. Transition Consistent
- Cards (`.stat-card`, `.proc-card`, `.product-card`) dùng `--dur-normal` / `--ease`
- Quick-nav items, action cards, stat pills, subtabs — tất cả dùng token chung

### 8. Mobile Touch Polish
- `-webkit-tap-highlight-color: transparent` trên: bottom nav, action cards, stat pills, quick-nav items

---

## Chưa làm — Liệt kê theo ưu tiên

### Ưu tiên cao

#### 1. Skeleton Screens (Loading Placeholder)
- **Tác dụng:** Thay空白 khi load dữ liệu bằng shape mờ nhấp nháy → giảm cảm giác chậm, tăng perceived performance
- **Khi cần:** Firestore load >500ms, mạng yếu
- **Effort:** Thêm CSS skeleton animation + HTML placeholder div

#### 2. ARIA Audit Toàn Bộ Modals
- **Tác dụng:** Screen reader đọc đúng: focus trap trong modal, Escape đóng modal, `aria-label` trên buttons thiếu text, `role="dialog"` đúng chuẩn
- **Khi cần:** Có user khiểm thị, kiểm tra a11y compliance
- **Effort:** Review từng modal (~15 modals), thêm focus trap JS

#### 3. Form Inline Validation Realtime
- **Tác dụng:** Hiện lỗi ngay khi nhập sai (sdt thiếu số, email sai format) thay vì phải bấm Lưu mới thấy
- **Khi cần:** Tỷ lệ nhập sai form cao
- **Effort:** Thêm JS validation on input event + error message elements

### Ưu tiên trung bình

#### 4. Typography Overhaul
- **Tác dụng:** Chuẩn hóa cỡ chữ, khoảng cách dòng, font-weight theo hierarchy rõ ràng (h1 > h2 > body > caption)
- **Khi cần:** Chữ quá to/nho, header không nổi bật
- **Effort:** Review và cập nhật font-size/line-height cho headings, body, caption

#### 5. Form Redesign
- **Tác dụng:** Label trên input (không ngang), group related fields, progress indicator cho multi-step
- **Khi cần:** Form dài, user dễ nhập sai, form hẹp trên mobile
- **Effort:** Redesign HTML structure + CSS

#### 6. Lazy Loading Images
- **Tác dụng:** Ảnh sản phẩm chỉ load khi scroll đến → giảm initial load, tiết kiệm bandwidth
- **Khi cần:** >20 product cards, ảnh lớn
- **Effort:** Thêm `loading="lazy"` vào img tags

#### 7. Image Blur-up Effect
- **Tác dụng:** Ảnh nhỏ mờ load trước, ảnh thật thay → cảm giác mượt hơn
- **Khi cần:** Nhiều ảnh chất lượng cao
- **Effort:** Thêm placeholder blur + CSS transition

### Ưu tiên thấp

#### 8. Micro-interactions Chi Tiết
- **Tác dụng:** Ripple effect khi bấm nút, slide-in khi mở modal, stagger animation khi list load → app "sống" hơn
- **Khi cần:** Tăng trải nghiệm premium, so sánh app đối thủ
- **Effort:** Thêm CSS/JS animations

---

## File thay đổi

| File | Thay đổi |
|------|----------|
| `css/style.css` | Thêm tokens, skip-link, touch targets, toast fix, transitions |
| `index.html` | Thêm `<a class="skip-link">` |
