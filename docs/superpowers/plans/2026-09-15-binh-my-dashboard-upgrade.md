# Bình Mỹ Dashboard Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone upgraded copy of the Bình Mỹ agricultural dashboard with a substantially clearer responsive interface while preserving the existing application behavior.

**Architecture:** Keep the current app as the source of truth and create a sibling copy named `binh-my-dashboard-upgraded`. Preserve `app.js` and `import-data.js` behavior, then improve the copied visual layer through semantic CSS tokens and targeted markup additions that reuse existing handlers and IDs. Validate the copied app with the existing Node tests and static compatibility checks.

**Tech Stack:** Static HTML, CSS, browser ES modules, Firebase Web SDK 10.13.0, Chart.js 4.4.4, html5-qrcode 2.3.8, qrcodejs 1.0.0, Node.js test scripts.

**Spec:** `docs/superpowers/specs/2026-09-15-binh-my-dashboard-upgrade-design.md`

## Global Constraints

- The original root web files remain unchanged.
- Preserve Firebase authentication, Firestore flows, Chart.js, QR, AI, import/export, modal flows, and inline-handler contracts.
- Preserve existing data shapes, element IDs, global handler names, and `import-data.js` behavior.
- Do not introduce emoji icons; use the existing SVG symbol family.
- Keep visible focus states, logical tab order, reduced-motion support, and readable mobile layouts.
- Do not swallow Firebase, import, QR, or form errors.
- Do not overwrite an existing destination folder silently.

---

### Task 1: Create the Isolated Application Copy

**Files:**
- Create: `binh-my-dashboard-upgraded/index.html`
- Create: `binh-my-dashboard-upgraded/style.css`
- Create: `binh-my-dashboard-upgraded/app.js`
- Create: `binh-my-dashboard-upgraded/import-data.js`
- Create: `binh-my-dashboard-upgraded/test-global-handlers.mjs`
- Create: `binh-my-dashboard-upgraded/test-import-data.mjs`
- Create: `binh-my-dashboard-upgraded/cần xoá phần dư.png` when present in the source

**Interfaces:**
- Produces a self-contained browser app with the same relative script and stylesheet paths as the source.
- Produces a copied test harness that can be run from the new directory.

- [ ] **Step 1: Confirm the destination does not already exist**

Run from `C:\Users\Tan\Downloads\tpthinh228.github.io-main`:

```powershell
if (Test-Path '.\binh-my-dashboard-upgraded') { throw 'Destination already exists; refusing to overwrite it.' }
```

Expected: no output and exit code 0.

- [ ] **Step 2: Copy the web files and local asset**

```powershell
New-Item -ItemType Directory -Path '.\binh-my-dashboard-upgraded' | Out-Null
Copy-Item '.\index.html','.\style.css','.\app.js','.\import-data.js','.\test-global-handlers.mjs','.\test-import-data.mjs' -Destination '.\binh-my-dashboard-upgraded'
if (Test-Path '.\cần xoá phần dư.png') { Copy-Item '.\cần xoá phần dư.png' -Destination '.\binh-my-dashboard-upgraded' }
```

Expected: all listed files exist under the new folder.

- [ ] **Step 3: Verify the source files were not modified**

```powershell
Get-FileHash '.\index.html','.\style.css','.\app.js','.\import-data.js'
Get-FileHash '.\binh-my-dashboard-upgraded\index.html','.\binh-my-dashboard-upgraded\style.css','.\binh-my-dashboard-upgraded\app.js','.\binh-my-dashboard-upgraded\import-data.js'
```

Expected: each source hash matches its copied counterpart before any upgrade edits.

- [ ] **Step 4: Run the copied baseline tests**

```powershell
Push-Location '.\binh-my-dashboard-upgraded'
node .\test-global-handlers.mjs
node .\test-import-data.mjs
Pop-Location
```

Expected: both scripts print their `checks passed` message.

### Task 2: Upgrade the Design System and Responsive Shell

**Files:**
- Modify: `binh-my-dashboard-upgraded/style.css`

**Interfaces:**
- Keeps all existing selectors and state classes used by `index.html` and `app.js`.
- Adds semantic tokens and responsive rules without changing JavaScript contracts.

- [ ] **Step 1: Add semantic tokens and base layout primitives**

Add or refine `:root`, `body`, `.wrap`, heading, input, button, table, and focus rules so the copied app uses:

```css
:root {
  --canvas: #f5f7f3;
  --surface: #ffffff;
  --surface-soft: #eef5ed;
  --ink: #17231b;
  --ink-soft: #5d6d62;
  --line: #dce6dd;
  --paddy: #238a4e;
  --paddy-deep: #17643a;
  --river: #2563a6;
  --papaya: #d96b1f;
  --danger: #c43d3d;
  --radius-panel: 18px;
  --shadow-panel: 0 18px 45px rgba(23, 35, 27, 0.08);
}
```

Use semantic variables inside components instead of new raw color literals.

- [ ] **Step 2: Improve the application frame**

Refine topbar, brand, sticky behavior, main content spacing, section transitions, and desktop max-width rules. Keep the existing markup-compatible class names and ensure the page remains usable if a section has long text.

- [ ] **Step 3: Establish responsive breakpoints**

Add mobile-first rules at approximately 560px, 820px, 1024px, and 1280px for:

- one-column dashboard panels on narrow screens;
- wrapped toolbars and controls;
- full-width form controls on mobile;
- readable table overflow contained within `.table-wrap`;
- sticky controls that do not cover focused content.

- [ ] **Step 4: Add interaction states**

Ensure buttons, links, inputs, rows, chips, dropdowns, modals, and loading states have visible hover, active, disabled, and focus-visible states. Use transform/opacity for motion and preserve the existing reduced-motion media query.

- [ ] **Step 5: Run the copied tests**

```powershell
Push-Location '.\binh-my-dashboard-upgraded'
node .\test-global-handlers.mjs
node .\test-import-data.mjs
Pop-Location
```

Expected: both tests pass because CSS changes do not alter handler contracts.

### Task 3: Improve Dashboard and Data-Management Presentation

**Files:**
- Modify: `binh-my-dashboard-upgraded/index.html`
- Modify: `binh-my-dashboard-upgraded/style.css`

**Interfaces:**
- Existing buttons continue to call their current inline handlers.
- Existing IDs referenced by `app.js` remain unchanged.
- New decorative elements use the existing SVG `<symbol>` icons and `aria-hidden="true"`.

- [ ] **Step 1: Identify the primary dashboard regions**

Use the existing `id`, `class`, and section structure to locate the hero, KPI/stat cards, chart/activity panels, section navigation, toolbars, tables, modals, toast, and loader. Do not rename selectors referenced by `app.js`.

- [ ] **Step 2: Add hierarchy without duplicating business logic**

Wrap only presentation groups that need layout control. Add concise section labels, helper text, or status wrappers where needed, but reuse the existing data-rendering containers and action buttons. Any new action must call an existing handler rather than add a parallel implementation.

- [ ] **Step 3: Improve navigation clarity**

Keep the existing navigation destinations and active state logic. Style the desktop navigation as a clear sidebar/topbar hierarchy where the current structure allows it; on mobile, keep labels visible and allow wrapping or controlled horizontal navigation without page-level horizontal overflow.

- [ ] **Step 4: Improve data tables and toolbars**

Apply consistent section headers, search/filter grouping, status chip contrast, row-action spacing, empty states, and contained horizontal scrolling. Preserve table IDs, `data-*` hooks, sort handlers, and pagination/filter behavior.

- [ ] **Step 5: Improve forms and modals**

Keep existing modal IDs and close/cancel handlers. Add or refine visible labels, helper/error spacing, modal focus appearance, close affordances, loading button states, and responsive modal sizing without changing submit logic.

- [ ] **Step 6: Run the copied tests and static handler check**

```powershell
Push-Location '.\binh-my-dashboard-upgraded'
node .\test-global-handlers.mjs
node .\test-import-data.mjs
Select-String -Path '.\index.html' -Pattern 'app.js','style.css'
Pop-Location
```

Expected: tests pass and the page still references the copied local `app.js` and `style.css`.

### Task 4: Validate the Finished Copy and Compatibility

**Files:**
- Modify: `binh-my-dashboard-upgraded\README.md` if a local usage note is useful

**Interfaces:**
- Final deliverable is the copied and upgraded site at `binh-my-dashboard-upgraded\index.html`.
- Source project files remain unchanged.

- [ ] **Step 1: Run all existing copied tests**

```powershell
Push-Location '.\binh-my-dashboard-upgraded'
node .\test-global-handlers.mjs
node .\test-import-data.mjs
Pop-Location
```

Expected: both tests pass.

- [ ] **Step 2: Check required files and references**

```powershell
$required = 'index.html','style.css','app.js','import-data.js','test-global-handlers.mjs','test-import-data.mjs'
foreach ($file in $required) {
  if (-not (Test-Path (Join-Path '.\binh-my-dashboard-upgraded' $file))) { throw "Missing $file" }
}
Select-String -Path '.\binh-my-dashboard-upgraded\index.html' -Pattern 'src="app.js"','href="style.css"'
```

Expected: no missing-file error and both local references are present.

- [ ] **Step 3: Confirm the original application files are unchanged**

Compare the original files against the pre-copy hashes captured in Task 1, or use:

```powershell
git diff -- .\index.html .\style.css .\app.js .\import-data.js
```

Expected: if the directory is not a Git repository, use the saved pre-copy hashes instead; no source file should contain the upgraded changes.

- [ ] **Step 4: Perform the browser UX pass**

Open `binh-my-dashboard-upgraded\index.html` in a browser and inspect at approximately 375px, 768px, 1024px, and desktop width. Confirm:

- no page-level horizontal overflow;
- primary actions remain visible and usable;
- keyboard focus rings are visible;
- modal close/cancel paths remain available;
- tables scroll only inside their table wrapper;
- long Vietnamese labels wrap without clipping;
- reduced-motion mode suppresses nonessential transitions.

- [ ] **Step 5: Record the result**

If the repository remains non-Git, do not create a commit. Report the upgraded folder path and the validation results directly.
