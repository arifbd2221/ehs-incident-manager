# Phase 2 Roadmap

Live task tracker. Tick boxes as tasks land. Each task gets one focused commit.

## Wave 1 — Foundation ✅ complete

- [x] **T1.1** Migration runner + `_schema_migrations` table — commit `c7d0be4`
- [x] **T1.2** Bump multer → 2.x + install `@anthropic-ai/sdk` — commit `6f56829`
- [x] **T1.3** Migration 001 — 9 new tables + 25 risk_matrix rows — commit `d3a4a27`
- [x] **T1.4** Migration 002 — incident column adds + `reported_by` rebuild — commit `c2c2494`
- [x] **T1.5** Migration 003 — capa polymorphic + `investigation_id` rebuild + CHECK — commit `07944db`

## Wave 2 — Site / Asset / Document / EntityLink ✅ complete

- [x] **T2.1** Site CRUD (`POST/PATCH/DELETE /api/sites`) — commit `6a881c1`
- [x] **F2.1** Sites admin page + `api/sites.js` + Sidebar nav — commit `d4786a8` (later redesigned upstream by `ef1cc50`)
- [x] **T2.2** Asset CRUD — commit `982c39c`
- [x] **F2.2** Assets module pages + nav + routing — commit `907a3b4` (later redesigned upstream by `b27b352`)
- [x] **T2.2b** Custom asset categories (`/api/asset-categories` + migration 004 + auto-seed trigger) — commit `982c39c`
- [x] **F2.2b** Asset detail rebuild + category picker w/ "+ New" inline — commit `907a3b4`
- [x] **T2.3** EntityLink endpoints + service + asset-detail enrichment — commit `982c39c`
- [x] **F2.3** Site → Asset cascade in wizard + incidents POST accepts `asset_id` — commit `a58f8a7`
- [x] **T2.4** Document module (CRUD + multipart upload + linking via entity_links) — commit `ec1c292`
- [x] **F2.4** Documents library page + upload modal + nav — commit `d1540c4` (later redesigned upstream by `b27b352`)
- [x] **F2.5** Document linking on investigation evidence — commit `0837e2a`

## Wave 3 — Incident extensions ✅ complete

- [x] **T3.1** Service foundations: `body_parts.js` + recordability/riddor split + `auto_classify.js` — commit `7053b7b` (severity-floor refinement in `661e9b0`)
- [x] **T3.2** `incidents.js` POST extends: `body_parts_affected`, `is_anonymous`, `prior_incidents_count` + new `POST /classify-preview` endpoint — commit `302cf7a`
- [x] **T3.3** Stop-work endpoints + state machine + down-route guard — commit `1de6eb5`
- [x] **F3.3** STOP WORK button (TopBar) + active dashboard banner — commit `f18d712`
- [x] **F3.1** Body map wiring (`InjuryForm` uses `BodyMap3D`) — commit `73db417`
- [x] **F3.2** Anonymous toggle in wizard Step 1 — commit `73db417`
- [x] **F3.4** Trending banner + auto-classification suggestion on wizard Step 2 — commit `73db417`
- [x] **T3.4** `POST /incidents/:id/recordability-verify` (5-gate decision) — commit `29d390e`
- [x] **F3.5** EHS recordability verification card on incident detail — commit `2aa3e3b`

## Wave 4 — CAPA polymorphic ✅ complete

- [x] **T4.1** CAPA polymorphic: `POST /capas` + `POST /incidents/:id/create-capa` + assign-capa source_type — commit `465a5dd`
- [x] **F4.1** "+ New CAPA" button with source picker on CAPA list — commit `18eeb68`

## Wave 5 — Voice intake ✅ complete

- [x] **T5.1** `services/voice_extract.js` (Anthropic SDK + tool-use schema) — commit `5d5d98e`
- [x] **T5.2** `POST /incidents/voice-extract` endpoint + `voice_extractions` write + activity log — commit `8b5f609`
- [x] **F5.1** Voice intake confirmation flow (Web Speech transcribes in browser, BE extracts structure) — commit `108f08f`

## Wave 6 — Polish + seed ✅ code complete (F6.2 is a manual walkthrough)

- [x] **T6.1** Hygiene: multer 2.x cleanup + OSHA 300 `injury_type` granularity + FK error scrubbing — commit `75fb1ef`
- [x] **T6.2 + T6.3** Demo seed rewrite (foundation + incident graph) — bundled in commit `48e29ff` (the seed is one atomic transaction; splitting would have left a half-written, broken seed)
- [x] **F6.1** 300A sign-off button on Reports page — commit `511dab9`
- [ ] **F6.2** End-to-end demo path walkthrough in browser — *manual; run `SEED_FORCE=1 node db/seed.js`, then click through the 10 beats per plan-phase-2.md §5*

## Wave 7 — Deferred enhancements

- [x] **E7.1** **Custom fields per asset type** — SafetyCulture-style. Migration 005 + asset_category_fields table + assets.custom_fields JSON + CRUD endpoints + validation hook + FE category-fields editor + dynamic form rendering on asset create/edit + display card on detail.
  - BE: commit `d4d4b2b`
  - FE editor modal: commit `cab263c`
  - FE dynamic form + display: commit `da0e3fe`

## Phase 3 — Productionization (user-driven backlog, captured 2026-05-06)

User observations after clicking through the Phase 2 build. Treat as an
actual app, not a hackathon. Order shifts based on user direction; nothing
here ships without explicit go-ahead.

### Navigation / pages
- [x] **P3-N1** **Site details page + hierarchy** — `/admin/sites/:id` with breadcrumb, sub-sites, recent incidents/assets, compliance, workforce. Migration 015 adds `parent_id` to sites (originally landed as 012; renumbered to 015 after main merged its own 012_template_cover_image in parallel). BE: cycle/self/depth-cap (5 levels) validation on POST/PATCH, child-blocks-delete on DELETE, enriched `GET /api/sites/:id` returns parent + ancestors + children + counts + recents + work_hours total. FE: stacked-cards detail page with `sd-*` page-scoped styles in `sites.css`, clickable list cards with "Sub-site of …" parent chip, "Parent site" select in the General section of the site modal that excludes self + descendants to prevent cycles from the UI. Login demo grid gains a Worker (Wendy) row so role gates are click-testable.
- [x] **P3-N2** **Document folder structure** — folders/sub-folders for documents — commit `12862f8` (BE: migration `010_document_folders` + `/api/folders` CRUD + folder_id filter on docs; FE: breadcrumb, site filter, "+ New folder", folder tiles in grid + list, kebab rename/delete with content-count warning, native HTML5 DnD doc → folder / folder → folder / either → breadcrumb; Drive-style global search at root, scoped inside folders; folder navigation in the link-from-library modal on investigations).
- [x] **P3-N3** **Document preview** — inline PDF/image/video/audio preview without leaving the page — commit `1873bb2` (Drive-inspired redesign on origin/main, merged in `eeafa48`).

### Cross-entity linking + history
- [x] **P3-L1** **Back-tracking everywhere** — "where is this referenced?" on inspections / CAPAs / incidents / assets / docs. The `entity_links` table already exists; consistent surfacing across all detail pages.
  - **Initial chunk:** shared `referencesFor()` service + `GET /api/links/references?type=X&id=Y` endpoint; reusable `<ReferencedByCard>` component dropped into `AssetDetail`, `IncidentDetail`, `InvestigationDetail`, `CAPADetail`. Four buckets (incidents/investigations/capas/documents) merging direct FKs (e.g., `incidents.asset_id`, `capas.incident_id`) with polymorphic `entity_links` rows in either direction.
  - **Follow-up (this commit):**
    1. **Inspections back-tracking** — `'inspection'` added to `LINKABLE_TYPES` in `entity_links.js` and `PARENT_TABLES` in `routes/links.js`. New `inspectionsReferencing()` (poly-only — no direct FK between inspections and other entities). `referencesFor()` now returns an `inspections` bucket on every entity, and `<ReferencedByCard>` mounted on `InspectionReport.jsx` so an inspection can see its own back-references.
    2. **Assets bucket** — added `assetsReferencing()` (uses `incidents.asset_id` as direct FK + polymorphic links) so an inspection can see "Assets I inspected" / a document or CAPA can see linked assets. Six buckets total (incidents/investigations/capas/documents/inspections/assets).
    3. **Documents detail surfacing** — chose the inline path. `<ReferencedByCard>` mounted inside the Drive-style preview modal between content and footer; new `.dpv-references` CSS slot caps it at 220px max-height with overflow scroll so the modal layout stays bounded.
    4. **Link / unlink post-creation + clickable rows** — `referencesFor()` now returns `link_id` on every row (NULL on direct-FK rows like `incidents.asset_id`, populated on polymorphic `entity_links` rows). `<ReferencedByCard>` gains a "+ Link" button in the header and a hover-reveal × on every poly row, both gated to elevated. Clicking the button opens new `<AddLinkModal>` (type chips + debounced search of the chosen list endpoint + click-to-link); unlink calls DELETE /api/links/:id then refreshes via a tick counter. **Also retro-added the missing `.refby-*` CSS** — the original P3-L1 ship had row classes referenced in JSX with no styles anywhere in the tree, so rows had no cursor/hover and the click affordance was invisible. New `.refby-*` (~140 lines) and `.alm-*` (~155 lines) sit at the bottom of `styles.css`, all design-token references.
- [x] **P3-L2** **Media on investigations** — attachments card on investigation detail (parallel to UX-A on incidents) — commit `e75e8ce` (FE-only; BE polymorphic route already supported `entity_type='investigation'`). Follow-up `77a2eab` aligned upload to UX-A's worker-can-upload behavior. Page-scoped `.invd-attach-*` styles mirror UX-A's `.idet-attach-*` design (hover-reveal red ×, dashed CTA empty state). Bug-fix folded in: rendering read `a.original_name` / `a.size` but schema columns are `filename` / `size_bytes` — never exercised before because nothing seeded investigation attachments.

### Audit
- [ ] **P3-A1** **Proper activity logging + audit export** — wider coverage (every mutation writes a row), consistent shape, filterable + exportable. Compliance framing: OSHA / HSE / ISO 45001 inspectors can request the chain of custody for any record on demand.
  - **Done in 4 chunks (uncommitted at end of session):**
    1. **Foundation** — migration `013_activity_log_widen` (CHECK adds asset/document/folder/site/user/link), shared `services/activity_log.js` (`writeActivity` + `diffFields` for old/new diffs in metadata). Wired into `sites.js` (3 routes), `assets.js` (3, plus `asset_archived` / `asset_restored` distinct from `asset_updated`), `documents.js` (3, plus `document_moved` when only `folder_id` changes), `folders.js` (3, plus distinct `folder_renamed` / `folder_moved` / `folder_updated` actions), `links.js` (2), `auth.js` (3 — registered / profile_updated / password_changed; login intentionally skipped as noise). 15 audit rows verified end-to-end.
    2. **Admin config + partial-coverage gaps** — migration `014_activity_log_admin_types` (CHECK adds asset_category, answer_set). Wired into `asset_categories.js` (8 actions covering category + per-field CRUD + reorder), `answer_sets.js` (3, with options before/after diff in metadata). Filled gaps in `investigations.js` (delete five-why preserves removed Q/A in metadata; team_member_added), `templates.js` (PATCH metadata + items_updated rollup), `inspections_routes.js` (PATCH metadata with `status_at_edit` flag — item-level PUT skipped because the route already enforces 409 immutability after completion).
    3. **Audit-log export endpoint + Reports tab** — `GET /api/reports/audit-log` (paginated) and `GET /api/reports/audit-log/export.csv` (UTF-8 BOM + RFC 4180 escaping; `Content-Disposition: attachment`). New "Audit Log" card on the Reports page (slate/gray `rt-audit` accent). The export itself writes an `audit_log_exported` row with the filters used → tamper-evident chain of custody.
    4. **Polish** — entity-number resolver (accepts `INC-2026-0150` / `CAPA-048` / `AST-2026-00001` etc., case-insensitive, falls back to entity_type/id on bogus prefix). Role-narrowed: audit endpoints require `ehs_officer` / `ehs_manager` / `admin` only (supervisor blocked). Multi-select pickers for actions (grouped by entity_type with select-all per group), entity types (flat), and actors (flat). Distinct-actions endpoint feeds the dropdown. Popover portal'd to `document.body` because `.rpt-panel` has `overflow: hidden`; scrollable body, `position: fixed`, repositions on scroll/resize.
  - **Intentionally deferred:**
    - Per-answer inspection-item logging (`#9` from the audit survey) — the route's status='in_progress' guard returns 409 for completed/abandoned inspections, so a successful mutation can't reach a state worth auditing. Code comment in `inspections_routes.js` documents where to add the log if the route is ever loosened.
    - Verb normalization (`#10`) — cosmetic only; would touch every existing log call site and risk silent breakage if any FE/dashboard filters on `action` strings.

### Org / multi-tenancy
- [ ] **P3-O1** **Concept of organization** — proper multi-tenant model. Today there's a single org row in the seed; needs sign-up, invite flows, switching, isolation tests.
- [ ] **P3-O2** **Org + site members management** — see who belongs where, move users between sites, role changes with audit, invite-by-email.

### AI assistance
- [ ] **P3-AI1** **Auto-fill investigation (AI + manual modes)** — five-Why suggestions, root-cause prompts, contributing-factors checklist, recommended CAPAs.
- [ ] **P3-AI2** **Prompt-driven autofill** — system asks targeted questions ("Was the press locked out?"), user answers free-text, AI normalizes into structured fields.
- [ ] **P3-AI3** **Video → incident report** — extend the existing voice-intake flow (Phase 2 T5.1 / T5.2 / F5.1) to accept video. Pipeline: video upload → audio extracted → transcript (Whisper or similar) → re-use `services/voice_extract.js` (Anthropic tool-use schema) → structured incident draft + same confirmation UX as voice. Visual frames could later feed a separate hazard-detection model — out of scope for v1.

### Operational features
- [ ] **P3-OP1** **Asset maintenance** — schedules, due dates, last-done, escalations to CAPA when overdue.
- [x] **P3-OP2** **Inspection module** — full inspection lifecycle (templates → schedule → run → findings → CAPAs) — commit `918279a` (origin/main; merged in `eeafa48`). Pages: `/inspections`, `/inspections/:id` editor + report; routes `/api/inspections`, `/api/answer-sets`; migrations `008_templates_inspections` + `009_template_versioning`.
- [x] **P3-OP3** **Templates** — reusable templates with versioning + Google-Forms-style builder — commit `918279a` (origin/main; merged in `eeafa48`). Pages: `/templates`, `/templates/:id/edit`; route `/api/templates`.
- [ ] **P3-OP4** **Scheduling** — recurring inspections, calibrations, training, walkthroughs; calendar view + reminders.
- [ ] **P3-OP5** **Risk register / risk assessment module** — distinct from the 5×5 matrix used by `ReportWizard.jsx` (which scores incidents *post-event*). This is a *proactive* register: identify hazards at sites/assets, assess L×C, assign mitigations, periodic review, link to incidents/CAPAs that arose from a given risk. Likely needs `risks` + `risk_assessments` tables, `risk_review_due` field, and entity_links wiring. Big enough to be its own phase — scope before starting.

### Onboarding + data import
- [ ] **P3-OB1** **User onboarding flow** — first-login walkthrough, sample data toggle, role-tailored "what to do first".
- [ ] **P3-OB2** **CSV import** — users, sites, assets, work_hours, etc. With dry-run + error report.
- [ ] **P3-OB3** **Document versioning** — supersede a doc with a new file while keeping the audit trail of prior revisions.

### Regulatory expansion
- [ ] **P3-RG1** **Australian regulation** — third regulator alongside US OSHA (300/300A/301) and UK HSE/RIDDOR. Add `country='AU'` support on sites and integrate Safe Work Australia's notifiable-incident workflow. Each AU state has its own Work Health & Safety Act (e.g., NSW WHS s38, Vic OHS Act 2004 s37) with different categories (death, serious injury/illness, dangerous incident) and notification deadlines (immediately for death/serious; written follow-up within 48h–7d depending on state). Schema: likely `notifiable_incidents` table joining incident + state + category + phone_notified_at + written_submitted_at + reference_number; new report variant on the Reports page; per-state submission deadline tracking on the dashboard.

---

## Backlog — productionization UX (treat this as an actual app, not just demo polish)

These came out of the post-Wave-4 review. The shared theme is **"the incident record lives — investigators keep it accurate as facts emerge, every change is auditable."** OSHA 1904.33 explicitly expects amendments within the 5-year retention window, so none of this is a recordkeeping risk as long as the activity log captures who/what/when.

### Editable Incident Detail (one cohesive bundle)

- [x] **UX-A** **Post-report attachments** — add + delete with audit. Photos surface hours/days later; capturing them at submission only is a real gap. — commit `ba14826`
- [x] **UX-B** **Inline notes on activity timeline** — `POST /incidents/:id/note` + composer + distinct amber styling for note rows + Cmd/Ctrl+Enter to post + optimistic prepend. Commit `31f8be7`.
- [ ] **UX-C** **Editable description / area / department / body parts** on the detail page. PATCH already supports all of these BE-side; UI is what's missing. Use field-level edit affordances rather than a giant edit-mode toggle.
  - **Done:** description (textarea in "What happened" card), area + department (input in Quick Facts; department added as new fact-row, both shown to elevated even when empty with "(not set)" placeholder). Inline `<DescEdit>` and `<FactEdit>` components in `IncidentDetail.jsx`; small `idet-edit-*` page-scoped CSS for trigger button + edit-row footer + empty-state styling. Edit gated to elevated roles (`canEdit`).
  - **BE compliance gap closed:** PATCH `/incidents/:id` now writes an `incident_updated` activity_log row with field-level `{from, to}` diff in metadata for any change to title / description / area / specific_location / department / immediate_actions_taken. Severity continues to log `severity_overridden` separately. Closes the OSHA 1904.33 amendment-trail gap that previously made non-restricted edits silent. New action wired into `IncidentDetail` timeline icon/dot-class helpers.
  - **Open:** body parts editing — needs BodyMap3D integration on the detail page (separate component surface from the wizard's flow).
- [x] **UX-D** **Add/edit witnesses post-creation** — BE: three new routes on `incidents.js` (POST/PATCH/DELETE `/incidents/:id/witnesses[/:wid]`), all gated to elevated, all writing `witness_added` / `witness_updated` / `witness_removed` activity_log rows with full witness data (or field-level diff for updates) in metadata. FE: `WitnessModal.jsx` (dual-purpose add/edit, mirrors AssignModal's `idet-modal-*` pattern), Witnesses card placed in the sidebar between Reporter and Triage state, list of `<div className="idet-witness">` cards with name + contact + collapsed-style statement + edit/remove triggers (elevated only), empty state with prompt copy. Page-scoped `.idet-witness-*` CSS in `incidents.css` (~50 lines, all design-token references). New activity actions wired into `tlIcon`/`tlDotClass`. Worker role gets 403 surfaced as toast.
- [x] **UX-E** **Severity override UI** — `SeverityOverrideModal` (new file, mirrors AssignModal's `idet-modal-*` pattern, zero new CSS), "Override severity" trigger button in IncidentDetail header-actions row (only visible to elevated roles, hidden when status=Closed). Sev `<select>` + required-reason textarea, confirm disabled until severity differs and reason is non-empty. Sends PATCH `/incidents/:id` with `severity` + `severity_override_reason`; BE writes `severity_overridden` activity-log row with old→new + reason in metadata. Worker role gets 403 surfaced as toast.

### Quick wins (independent, can land any time)

- [x] **UX-F** **Global search jump-to in TopBar** — `globalSearch` API hits `/api/incidents|investigations|capas` with `search=` param; categorized dropdown in `SearchResults`; debounced 300ms; keyboard `/` focus, ↑/↓ navigate, Enter open, Esc close; click-to-navigate; loading + empty states; status chips; auto-closes on route change. Page-scoped `.sr-*` styles in `styles.css`. (Implemented earlier; roadmap entry was stale.)
- [x] **UX-G** **CAPA due-date color coding** — pills on kanban + list (red ≤2d & overdue, amber ≤6d, muted else). Commit `48ca9b2`.
- [x] **UX-H** **Cross-page stop-work banner** — slim pulsing red bar above TopBar in ProtectedLayout, polls every 30s, click → first active stop-work. Commit `48ca9b2`.

### Deferred (cool but expensive — revisit only if other beats are solid)

- "Similar incidents" panel on IncidentDetail (semantic match by site + body part + window).
- OSHA 301 PDF export.
- Trending dashboard widgets ("3 incidents at Press 4 this month, +200%").
- Keyboard shortcuts (`?` help, `g i` incidents, `n` new incident).

## Known issues (investigate later, not blocking)

- [x] **BUG-001** ~~"Failed to create category" error~~ — fixed by the upstream AssetsList redesign (`b27b352`). Verified 2026-05-06 against the live Vite proxy: new unique name → 201, active duplicate → 409 with friendly message, case-insensitive duplicate → 409, predefined name → 409, soft-deleted reactivation → returns row with active=1. No reproducer left.

## Pre-Wave-3-design-system-rules violations (carried, do not fix per user direction)

The following Wave 2 FE files were authored before the new `CLAUDE.md` design system was added on main (`317b4c4`). They use `--sds-text-*` tokens (instead of `--sds-fg-*`), `.btn-ghost` (not in canonical set), and inline modals (no `createPortal`). Upstream redesigns at `ef1cc50` (Sites) and `b27b352` (Assets + Documents) have **already replaced** the Wave 2 versions, so most of these are no longer present in the repo. Wave 3 work follows the design rules from the start.

---

## State

- **Branch**: `backend` — pushed through `8b3359d` (P3-L1 follow-ups). All work this session committed and pushed. Working tree clean.
- **Phase 2**: code complete. Only F6.2 (manual demo walkthrough) outstanding.
- **Wave 7**: E7.1 done.
- **Productionization backlog** (UX-A through UX-H): **A, B, D, E, F, G, H done. C done except body-parts editor (deferred — needs BodyMap3D integration outside the wizard).**
- **BUG-001**: closed.
- **Phase 3** (P3-* items): **N1, N2, N3, L1, L2, A1, OP2, OP3 all done.**
  - **Open** (not started): O1, O2, AI1, AI2, AI3 (video intake), OP1, OP4, OP5 (risk register), OB1, OB2, OB3, RG1 (Australian regulation).
- **Migrations applied**: 001–015 (008 templates+inspections + 009 template_versioning from main, 010 document_folders, 011 dashboard_layout from main, 012 template_cover_image from main, 013 activity_log_widen + 014 activity_log_admin_types from backend, 014a fixup that renames the legacy site_hierarchy entry, 015 site_hierarchy — renumbered from the original 012).
- **Running**: dev servers via `cd server && node --watch index.js` (BE :3001) and `cd client && npm run dev` (FE :5173). Demo accounts in seed.

## Most recent session — 2026-05-06 (evening) — P3-N1 + L1 prototype + A1 foundation + new roadmap items

Session shipped P3-N1 (site detail page + hierarchy) end-to-end, then prototyped P3-L1 back-tracking across four detail pages, then delivered the P3-A1 compliance audit-logging stack in four chunks (foundation, admin config + gaps, audit export, multi-select polish + role gate). Pulled `origin/main` mid-session bringing dashboard customisation + assets/incidents redesigns. Three new roadmap items added at the user's direction (P3-AI3 video intake, P3-OP5 risk register, P3-RG1 Australian regulation).

| Area | What changed | Commit / status |
|---|---|---|
| P3-N1 site detail + hierarchy | Migration 015 (parent_id; originally 012, renumbered after this session's main merge), enriched `GET /api/sites/:id` (parent + ancestors + children + counts + recents), cycle/depth/cross-org validation. New `/admin/sites/:id` page with stacked-cards layout (`sd-*` page-scoped styles); list cards become clickable; "Sub-site of …" parent chip; parent-picker in modal that excludes self+descendants. Login demo grid gains Wendy (worker) for role-gate click-testing. | `25ad9af` (pushed to `origin/backend`) |
| Merge from main | PR #6 merged earlier (`52479ba`); pulled main into backend (`d38cbc0`) bringing dashboard customisation (`8328863`), assets page redesign (`260584e`), incidents page redesign (`38597f4`). Migration 011 (`dashboard_layout`) auto-applied. | `d38cbc0` (pushed) |
| P3-L1 back-tracking prototype | New `referencesFor()` service + `GET /api/links/references?type=X&id=Y`. Shared `<ReferencedByCard>` component dropped into AssetDetail / IncidentDetail / InvestigationDetail / CAPADetail (one import + one JSX line per page). Refby card groups by Incidents / Investigations / CAPAs / Documents; click-through navigates. Open follow-ups: inspections aren't in `LINKABLE_TYPES`; documents have no detail page. | uncommitted |
| P3-A1 chunk 1 (foundation) | Migration 013 (CHECK widened), `services/activity_log.js` helper, sites + assets + documents + folders + links + auth all log compliance-relevant mutations with field-level diff metadata. | uncommitted |
| P3-A1 chunk 2 (admin + gaps) | Migration 014 (asset_category + answer_set), asset_categories full CRUD + per-field operations logged, answer_sets (options before/after captured), filled investigation/template/inspection partial-coverage gaps. | uncommitted |
| P3-A1 chunk 3 (export endpoint + UI) | `/api/reports/audit-log` + `/audit-log/export.csv` (UTF-8 BOM, RFC 4180), new "Audit Log" card on Reports (slate-gray `rt-audit`), filterable preview table + CSV download. Export logged → tamper-evident. | uncommitted |
| P3-A1 chunk 4 (polish) | Entity-number resolver (INC-/INV-/CAPA-/AST-/DOC-/INS-), audit-role gate (ehs_officer/manager/admin only — supervisor blocked), multi-select pickers (actions grouped + select-all-per-group, entity types flat, actors flat), `MultiPicker` component portal'd to body to escape `.rpt-panel` `overflow:hidden` clip. | uncommitted |
| Roadmap updates | Added **P3-AI3** (video intake), **P3-OP5** (risk register / risk assessment — distinct from the 5×5 incident-scoring matrix), **P3-RG1** (Australian regulation — Safe Work Australia notifiable-incident workflow alongside OSHA + RIDDOR). Updated P3-L1 description to call out the inspection + document-detail open follow-ups. Updated P3-A1 description with all four chunks + the deferred items (`#9` per-answer, `#10` verb-normalisation). | this commit |

**Honest hallucination report at end of session** (per user-requested "what's your hallucination risk?" pattern):
- **Low risk on BE**: every endpoint exercised via curl with multiple parameter combinations, every audit row inspected by id, role gates verified for Elena (ehs_manager) / Marcus (supervisor) / Wendy (worker), CSV format inspected.
- **Medium-high risk on FE**: the `MultiPicker` component, the portal'd popover with computed `getBoundingClientRect` positioning, scroll-fix, indeterminate checkbox state, disabled state styling — none of these were click-tested in a browser. Build clean + HMR clean confirms parse correctness, not visual correctness.
- **Stale-cache risk**: `ActionPicker` was renamed to `MultiPicker` mid-session; if the user has Reports open in a browser tab, hard-refresh before judging visuals.

## Most recent session — 2026-05-06 (afternoon → evening)

Session shipped the document folder system, fixed the demo seed's missing PDFs, repaired the broken investigation link-modal, then delivered P3-L2 (media on investigations) end-to-end. Multiple pulls from `origin/main` folded in the templates + inspections feature, the Drive-style documents redesign + preview, and the premium UI overhaul (auth/profile rewrites, animated nav icons, kanban hover-expand) — all without disturbing local work. Two PRs merged (#5, #6).

| Area | What changed | Commit / PR |
|---|---|---|
| Document folder system (P3-N2) | Migration 010 + `/api/folders` CRUD + folder_id filter on docs; FE breadcrumb, site filter, "+ New folder", folder tiles in grid + list, kebab rename/delete with content-count warning, native HTML5 DnD doc → folder / folder → folder / either → breadcrumb; Drive-style global search at root, scoped inside folders; folder navigation in the link-from-library modal on investigations | `12862f8` (PR #5) |
| Demo seed: real PDFs on disk | Seeded sample docs now write valid 1-page PDFs to `server/uploads/` and persist `stored_filename` so download/preview work on a fresh `SEED_FORCE=1` reseed (previously returned 404 because `stored_filename` was NULL) | bundled in `12862f8` |
| Investigation link-modal repair | Switched the broken `docs-modal-*` classes (deleted upstream by `b27b352`) to the standard shared `.modal-*` shell so the modal actually renders | bundled in `12862f8` |
| Folder system from main | Documents page Drive-inspired UI + inline preview (`1873bb2`), templates + inspections module (`918279a`), inspection redesign + template conditional logic (`9e34bfb`) | merged in `eeafa48` and `ee91f6b` |
| Premium UI overhaul (from main) | Split-screen auth, tabbed profile, global polish (566-line `styles.css` rework), animated nav icons (`86c305f`), kanban hover-expand (`ac92b88`) | merged in `0b75795` |
| Roadmap ticks | P3-N2, P3-N3, P3-OP2, P3-OP3 ticked | `189f942` |
| P3-L2 media on investigations | Mirror of UX-A: "+ Add files" header button, hover-reveal red × delete, dashed CTA empty state, activity-log entries, role-gated delete (uploader OR elevated). Page-scoped `.invd-attach-*` CSS mirrors UX-A's `.idet-attach-*` design — explicitly authorized by user. Field-name bug fix (`a.original_name` → `a.filename`, `a.size` → `a.size_bytes`) folded in. | `e75e8ce` (PR #6) |
| Search-input collapse fix | Search field in link-from-library modal was shrinking to intrinsic width; added `flex: 1; min-width: 0` so it spans the row left of the 160px type dropdown | `ab2313f` (PR #6) |
| L2 worker-upload alignment | Removed the `canEdit &&` gates so workers can upload investigation attachments (matches UX-A behavior); per-row delete still gated on `canDeleteAttachment` (uploader OR elevated) | `77a2eab` (PR #6) |

Two PRs merged into `main`: **#5** (folder system + seed fix + investigation link-modal repair, merged at `18940c7`) and **#6** (L2 media + search fix + worker-upload alignment, status open at end of session — merge if not already). After PR #6 lands, main = backend.

## Most recent session — 2026-05-07 — UX backlog cleanup + P3-L1 closure

Session shipped the entire remaining UX backlog (UX-C/D/E + ticked F) and closed P3-L1 with link/unlink + missing CSS. Pulled `origin/main` mid-session bringing investigations redesign + ComboBox/SmartTextarea components + accessibility passes.

| Area | What changed | Commit |
|---|---|---|
| Merge from main | 7 commits from main folded in (investigations redesign `0fb699c`, kanban hover-fix `79d66e9`, ComboBox + SmartTextarea `1782fa6`, accessibility `da194fd`, etc.). Used `-X theirs` so main's UI/UX wins on conflicting hunks; backend feature additions (ReferencedByCard mounts, audit-log card, site-detail page, `/admin/sites` page tip) survived as non-conflicting hunks. | `f313722` |
| UX-E severity override modal | New `SeverityOverrideModal.jsx` mirrors AssignModal's `idet-modal-*` pattern (zero new CSS). "Override severity" trigger in incident detail header-actions row, gated to elevated. Sev `<select>` + required-reason textarea; BE already wired severity_override / _by / _reason and writes severity_overridden activity_log row. | `dffaf1f` |
| UX-C inline-edit description / area / department | `<DescEdit>` + `<FactEdit>` components in IncidentDetail. Field-level edit affordance via small `idet-edit-trigger` pencil. Department added as a first-class fact-row. **Closed compliance gap**: PATCH /incidents/:id now writes incident_updated activity_log row with field-level diff metadata, so non-restricted edits aren't silent (OSHA 1904.33 amendment trail). New action wired into timeline icon helpers. Body-parts editor deferred. | `ff465d8` |
| UX-D witnesses post-creation | BE: 3 new routes (POST/PATCH/DELETE `/incidents/:id/witnesses[/:wid]`), all gated to elevated, all logging witness_added / witness_updated / witness_removed with full data + diff in metadata. FE: dual-purpose `WitnessModal.jsx`, Witnesses card placed between Reporter and Triage state in the sidebar, hover-reveal × on rows for elevated. Page-scoped `.idet-witness-*` CSS. | `d87ea04` |
| P3-L1 follow-ups | `inspection` added to `LINKABLE_TYPES` + `PARENT_TABLES`. New `inspectionsReferencing()` (poly-only) + `assetsReferencing()` (uses incidents.asset_id direct FK + poly). Six buckets total. Every row carries `link_id` (NULL on direct-FK). `<ReferencedByCard>` gains "+ Link" header button + hover-reveal × per poly row. New `<AddLinkModal>` (type chips + debounced search + click-to-link, sends both `search` and `q` params because endpoints are inconsistent — bug caught in testing). Mounted on InspectionReport.jsx and inside the document preview modal. Document rows deep-link to `/documents?folder=N` (DocumentsList consumes via `useSearchParams` and walks parent_id for breadcrumb). **Retro-added `.refby-*` CSS (~140 lines) — original P3-L1 ship had row classes referenced in JSX with zero CSS anywhere in the tree, making click affordances invisible.** New `.alm-*` (~155 lines) for the modal. | `8b3359d` |
| Roadmap | Ticked UX-C, UX-D, UX-E, UX-F (already-implemented), P3-L1; itemized P3-L1 follow-up sub-chunks; updated `## State` section to reflect this session's pushes. | this entry |

## Quick re-orientation for a fresh session

1. Read this `roadmap.md` first — full status with commit SHAs.
2. Read `plan-phase-2.md` if you need design rationale for any Phase-2 wave.
3. Read `~/.claude/projects/-Users-rukaiyafahmida-Downloads-SDS-Manager-Incident-Management-System-project-ehs-incident-manager/memory/MEMORY.md` for user preferences and project context.
4. `git fetch origin && git status` — `backend` should be at `8b3359d`, working tree clean. `origin/backend == backend`.
5. Boot: `cd server && node --watch index.js` and `cd client && npm run dev`. Login as `elena@sdsmanager.com / password123`.
6. **What's likely next** (in user-priority order):
   - **Body-parts editor** to fully close UX-C — needs BodyMap3D integration outside the wizard flow.
   - **Remaining P3 themes**: org/multi-tenancy (O1/O2), AI assistance (AI1/AI2/AI3 video), ops (OP1 maintenance / OP4 scheduling / OP5 risk register), regulatory (RG1 Australia), onboarding (OB1/OB2/OB3).
7. **Operating norms** (per user feedback during Phase 2 + Phase 3):
   - Treat as an actual app, not hackathon polish.
   - Each task = one focused commit + push to `origin/backend`.
   - Always leave dev servers running at the end so the user can click-test.
   - Don't claim FE success without actually exercising the UI; "Vite transforms cleanly" alone is not proof.
   - **Never override or overdo UI/UX** — reuse existing classes/tokens; no new CSS or inline styles unless the feature genuinely needs new visual treatment, in which case **ask first**. If you do add page-scoped CSS, follow the prefix convention (`idet-` incident detail, `invd-` investigation detail, `dp-` documents page, `tp-` templates list, `ie-` inspection editor, etc.).
   - **After every multi-step Edit on JSX/JS**, verify the file actually parses — run `cd client && npx vite build` or grep the Vite log for "SyntaxError"/"Failed to" lines, not just timestamp markers. Babel parse errors don't always abort HMR; the trailing log entry can be a stale "hmr update" while the file is silently broken.
