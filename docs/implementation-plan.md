# Reliability implementation plan

Baseline verified against `ac94421`. Keep the static HTML/CSS/JavaScript architecture. Each phase gets focused commits and a separate pull request; do not merge or deploy without review.

| Phase | Scope | Priority and dependencies |
| --- | --- | --- |
| 1 — Reliable records | Preserve split correction metadata; make Results authoritative after finishing; persistent plan/exercise IDs and conservative legacy migration; visible save failures with retry; correct CSV quoting and formula protection; Node regression tests and PR checks. | Essential data correctness; establishes regression coverage for later changes. |
| 2 — Imports and recovery | Reject empty/invalid plans before replacement; define repeated-day handling and recompute zone totals from accepted rows; full versioned backup/restore with validation and confirmation; verify vendor advisories and vendor a maintained SheetJS release with license/provenance. | Essential integrity/security follow-up. Real representative XLSX/XLS files and official release verification required. |
| 3 — Runtime reliability | Require all core cache assets before activation; defer version switching during active timing; handle clock changes, interval cleanup and released wake locks. | Essential poolside reliability. Depends on phase 1 regression coverage; needs real offline/update and tablet validation. |
| 4 — Usability and maintenance | Allow zoom, keyboard/focus behavior for dialogs, field labels and touch targets. Extract small parsing/storage/timing/results modules only where the tests and change frequency justify it. | Accessibility is worthwhile follow-up; module extraction is optional, with no framework or bundler planned. |

## Verification of review findings

- `finishLiveSession` copied an explicit subset of split fields, dropping `originalCum`, `corrected`, and `correctedAt`. Reproduced before the Phase 1 fix.
- Live edit/move/delete handlers accepted finished sessions, and finishing again recreated saved results from the stale copy. Reproduced before the Phase 1 fix.
- IDs were `day_session_row`; the result editor preselected them and refreshed result snapshots from the current plan. Reproduced with replacement and row insertion before the Phase 1 fix.
- `saveState` swallowed errors and callers immediately displayed success. Reproduced with quota/access errors before the Phase 1 fix.
- CSV used JSON string escaping rather than CSV escaping. Phase 1 tests cover double quotes, commas, multiline cells and formula prefixes; a browser download was independently parsed with Python's CSV reader.
- Import inspection confirms that `applyPlan` has no nonempty-plan validation and repeated day headers reset the day's rows without resetting accumulated zone totals. Phase 2 will reproduce and fix these with fixtures.
- `index.html` still references SheetJS 0.18.5 remotely. Verify the exact fixed version and official artifacts against both advisories in Phase 2; no claim of resolving this security concern in Phase 1.
- Service worker inspection confirms `Promise.allSettled`, immediate `skipWaiting`, and cache-first assets. Timer code uses wall-clock timestamps and lacks a wake-lock release handler; discard does not clear its interval. These remain Phase 3 work.
- The viewport disables zoom, and dialogs lack keyboard/focus management. Phase 4 will validate accessibility in a real browser.

## Phase 1 decisions and migration

- Finished Live sessions link to Results rather than displaying an editable stale split copy. All user-facing Live mutation handlers also reject finished state, including stale modal callbacks. Starting another session requires the existing “Iniciar próximo exercício” action.
- A plan gets a persisted `planId`; each non-header exercise gets its own persisted `id`. Replacing a plan creates new identity, while accumulation and row insertion retain existing identity. Results retain exercise snapshots and cannot change exercise unless the user explicitly selects a destination in the result editor.
- The existing storage key remains readable. Loading assigns IDs to legacy plan rows and persists them. Historical positional IDs become detached historical identities: the app cannot infer their original week safely. Legacy active-session snapshots remain resumable and detached from current plan rows. Existing results are not deleted or rewritten from a new plan. Explicit result reassignment remains available.
- Migration preserves existing correction metadata; metadata already discarded by older releases cannot be recovered. Do not run old and new app versions concurrently against the same browser storage. Export existing results before rollout; full-state backup/restore remains Phase 2.
- Failed writes retain the current state in memory and display a persistent alert until a successful write. Retry saves the current state without finishing/logging again. A browser-supported leave-page warning reduces accidental loss. CSV exports saved-result records currently in memory, including an unsuccessfully persisted finish; it is **not** a backup of plans, athletes, zones, or unfinished sessions.
- CSV uses UTF-8 with BOM, quoted fields with doubled quotes, literal cell newlines, and CRLF records. Formula-leading values receive a leading apostrophe (including signed target-difference text). `CorrigidoEm` is appended to the existing columns. Consumers using fixed column counts or interpreting apostrophe-prefixed fields must accommodate this.
- The service worker cache version is bumped so the changed assets can be installed. The broader activation/update policy remains unchanged and requires Phase 3.

## Validation scope

Run `node --check app.js`, `node --check sw.js`, and `node --test tests/*.test.cjs` on Node 24. The tests use the built-in Node test runner and simulated DOM/storage APIs; no package installation or build step is required. CI runs the same commands with read-only repository permissions.

Phase 1 also received a Chromium browser smoke check: all six tabs, athlete entry, plan selection, timer/split correction, finish/read-only Live, explicit reassignment default, injected storage failure and retry, reload persistence, CSV download, and service-worker registration. The downloaded CSV was parsed using Python's standard library. Browser tooling was supplied by the development environment and is not an application dependency.

Not validated: physical tablets, installed-PWA upgrades between releases, OS suspension/clock changes, Excel imports, full backup/restore, or remote GitHub Actions execution. No linter, type checker, or build tool is configured in this repository.
