# Bình Mỹ Dashboard Upgrade Design

## Goal

Create an isolated upgraded copy of the existing Bình Mỹ agricultural management
web app while preserving all current product behavior. The original root files
remain unchanged; the upgraded site lives in a new sibling directory.

## Scope

- Copy the current web application files and required local assets into
  `binh-my-dashboard-upgraded`.
- Preserve Firebase authentication, Firestore data flows, Chart.js charts,
  QR scanning/generation, AI actions, import/export, modal flows, and existing
  inline-handler contracts.
- Preserve existing data shapes, element IDs, global handler names, and
  `import-data.js` behavior unless a compatibility fix is required.
- Upgrade the visual layer and interaction polish only.

## Visual Direction

Use a field-operations command-center direction:

- Desktop: clear sidebar navigation with a compact sticky topbar.
- Mobile: responsive topbar and horizontally accessible navigation without
  horizontal page overflow.
- Dashboard: stronger hero hierarchy, one primary action, readable KPI cards,
  chart/activity grouping, and clearer empty/loading states.
- Data sections: consistent section headers, toolbars, filter/search controls,
  table density, status chips, and row actions.
- Modals/forms: consistent spacing, focus states, labels, errors, loading
  feedback, and clear cancel/escape paths.
- Palette: semantic tokens based on paddy green, river blue, harvest orange,
  and a restrained violet accent.
- Typography: retain the existing Inter + Space Grotesk pairing and improve
  scale, line-height, wrapping, and numeric alignment.
- Icons: keep the existing SVG symbol family; do not introduce emoji icons.

## Accessibility and Responsive Requirements

- Keep visible keyboard focus indicators and logical tab order.
- Preserve `aria-*` labels and add labels to any newly introduced icon-only
  controls.
- Respect `prefers-reduced-motion`.
- Keep primary controls at least 44px high where practical.
- Maintain readable 16px mobile body text and avoid horizontal page scrolling.
- Ensure sticky/fixed UI does not obscure focused or scrollable content.
- Preserve semantic color meaning with text or icon support, not color alone.

## Implementation Strategy

1. Copy the existing app into the new directory without modifying the source.
2. Compare the copied files and establish a compatibility baseline with the
   existing tests.
3. Apply the visual upgrade primarily in the copied `style.css`, making only
   targeted `index.html` changes where structure is needed for navigation or
   accessibility.
4. Keep `app.js` behavior unchanged unless a copied-page selector or handler
   requires a compatibility adjustment.
5. Run the existing Node tests against the copied application and perform
   static checks for required handlers and referenced assets.

## Error and Compatibility Handling

- Do not swallow Firebase, import, or QR errors.
- Preserve current toast, inline error, loading, and modal feedback patterns.
- If a new visual control wraps an existing action, it must call the same
  existing handler rather than duplicate business logic.
- If a copy operation encounters an existing destination, stop rather than
  overwrite it silently.

## Validation

- Confirm the new folder contains the expected web files and assets.
- Run `node test-global-handlers.mjs` and `node test-import-data.mjs` from the
  upgraded folder.
- Verify the original root files are unchanged.
- Inspect the copied page at desktop and mobile widths for overflow, focus
  visibility, readable wrapping, and preserved primary actions.
