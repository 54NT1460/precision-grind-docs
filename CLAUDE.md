# Precision Grind — Document Automation App

Owner: Tr4d3, Precision Grind (plumbing/electrical contractor), operating under
BG The Holding Company Corp. (511263), Moca, Puerto Rico.

Working style: short and direct, execute without questioning, explain system
steps clearly. Iterative fixes preferred over rebuilds.

## Stack

- **Frontend:** static `index.html` + `js/app.js`, deployed on GitHub Pages
- **Backend:** Google Apps Script (`gas_backend.js`) + Google Sheets
- **Devices:** iPhone, iPad (primary), laptop — all Safari/iOS-first
- **PDF generation:** jsPDF (bundled/loaded in index.html), builds 4 doc types

## Sync architecture (do not violate this boundary)

Only three things sync via Google Sheets: **Clients, Docs (recentDocs),
Counter**. Everything else is local-only (`localStorage`, per device):

- `Materials` (~340 items) — local only
- `LaborRates` (~96 items) — local only
- `docDetails` (full line-items/fields per saved doc, keyed by doc id) —
  local only, powers Duplicar/Convertir-a-Factura on the device that created
  the doc. If a doc synced in from another device, its full detail won't be
  there — `duplicateDoc`/`convertCotToFactura` degrade gracefully with a
  toast in that case.

**Why:** Google Sheets sync was unreliable for large catalogs (data
corruption, reverted changes). Keeping sync scope to lightweight,
frequently-shared data is the stable architecture. Do not add Materials or
LaborRates back into any sync call, and be careful about growing what's
inside `recentDocs` — it's the one synced list that grows unbounded over
time, so keep entries summary-only (num/client/total/paid/date/id), never
full item arrays.

### Counter integrity

`counterValue(c)` turns `{year, quarter, seq}` into one comparable number
(`year*1000 + quarter*100 + seq`). The counter may **only move forward**.
`pullFromSheets` never lets a sync (even `force=true`) pull the counter
backward — if local is ahead of Sheets, it pushes local up instead. This
was a real bug (counter briefly reverted from 302 to 301) — do not
reintroduce a raw `seq >` comparison or a bare `force` overwrite on the
counter.

Format: `YY-Q##` (e.g. `26-301` = 2026, Q3, seq 01). Certificado de
Garantía auto-generates alongside every factura with the same number +
`"C"` suffix.

### Pricing

`vendor price × 1.115 (IVU) × markup` (markup default 1.25, adjustable in
Settings). **Labor is IVU-exempt** — `calcHdPrice()` checks the row's
`type` select and skips the 1.115/markup multiplier when `type==='labor'`.
Switching a row's type dropdown re-runs `calcHdPrice` so this stays
correct if someone changes their mind mid-entry.

## Recent session — what changed

1. **Sync rebuild** (previous session): bounded sync to Clients/Docs/Counter
   only, stripped Materials/LaborRates from all Sheets calls, fixed a
   3-of-5 broken modal-overlay-tap-to-close bug, fixed counter regression.
2. **This session** — feature build:
   - IVU exemption for labor line items (`calcHdPrice`)
   - Deposit quick-fill: "50%" button on Factura (dollar amount) and on
     Cotización's deposit description (text preset)
   - Document duplication: `duplicateDoc(id)` — clones any doc's fields +
     items into a fresh form of the same type
   - Cotización → Factura conversion: `convertCotToFactura(id)` — maps
     cot-* fields to fac-* fields, carries items, resets date/paid/deposit
   - **Paid invoice marking flow**: `toggleDocPaid(id)` lets you mark any
     already-saved factura as paid/pending after the fact (not just at
     save time) — tappable badge in both the Home recent list and the new
     Historial view. Pushes `{paid, paidDate}` to Sheets via the existing
     `update` action if connected.
   - New **Historial** view (nav + home dashboard card): full document
     list, search by client/número, filter (Todos/Pendientes/Pagadas),
     inline Duplicar / Convertir-a-Factura actions.
   - Data model addition: every doc now has a unique numeric `id`.
     Legacy `recentDocs` entries without one get backfilled on load
     (`loadLocal()`), so old data keeps working.

### Known limitation to flag

`updateSheets('Docs', id, {...})` only works if the Docs sheet in Google
Sheets already has an `id` column. Sheets header row is fixed the first
time a sheet is written to non-empty — if the Docs sheet was created
before this session (no `id` field), older synced rows can't be updated
remotely by id until the sheet is re-initialized. Fix: run
"⬆ Subir clientes a Sheets" (`writeAllToSheets`) once — it clears and
re-pushes all of `recentDocs` (now including `id` for every local doc
after the migration backfill), which re-creates the header row correctly.

## Deferred (discussed, not yet built)

- Inventory list document type (cantidad ordenada/recibida + vendor links,
  modeled on the FM/Alternative Therapy mechanical inventory format)
- Backup/export all local data (materials + labor + clients) to one JSON
- Client quick-stats (total facturado, last doc date) on the client card

## File map

- `index.html` — all views/modals/CSS, one file
- `js/app.js` — all logic; grep `^function \|^async function` for the map
- `gas_backend.js` — Apps Script backend, generic per-sheet
  (`getSheet`/`clearSheet`/`appendBatch`/`update`/`deleteRow`), no changes
  needed here for anything in this doc — it's sheet-agnostic already
- `data_materials_combined.json` — reference data (HD store 6407 Mayagüez
  + HQJ Plumbing), not loaded automatically, used for manual catalog import
