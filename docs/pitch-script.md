# Safelync — Slide-by-Slide Pitch Script

Companion to `docs/pitch.html`. ~12–15 minutes when read at a normal pace; trim freely. Each section below maps to one slide. The **bold opener** is your first line — the part the audience hears while the slide animates in. Then the **body** is your talking track. The **transition** is the bridge into the next slide.

Target audience: EHS buyers (Heads of Safety, Compliance Directors, CFO-adjacent risk owners) plus internal stakeholders. Tone: confident, specific, no jargon left unexplained.

---

## Slide 1 — Title

**Opener:** "This is Safelync — by SDS Manager."

**Body:** "It's an incident management platform built for workplaces that have to satisfy more than one regulator. United States OSHA, United Kingdom RIDDOR, Australia SafeWork NSW. The premise: capture the incident once, hand the operator every regulatory output that follows."

**Transition:** "Let me show you why we built it."

---

## Slide 2 — The problem

**Opener:** "Today, an injury at a manufacturing site gets re-typed five times."

**Body:** "A worker fills out a paper form. A supervisor copies it into a spreadsheet. The EHS team starts an internal investigation in a separate tool. Someone logs into a regulator portal — OSHA's ITA, the HSE's website, the SafeWork NSW notify form — and re-enters the same information. Then the corporate KPI deck gets updated again at month-end. Each one of those hops loses fidelity, adds latency, and breaks the chain of custody an auditor cares about. By the time an inspector arrives and asks *show me what you reported and when*, the answer lives in five places, none of them signed, none of them tamper-evident."

**Transition:** "We collapse that pipeline."

---

## Slide 3 — The promise

**Opener:** "Capture once. Three jurisdictions of paperwork. Done."

**Body:** "Here's what that looks like in practice. A worker reports the incident on a phone or laptop. Safelync produces, automatically, the OSHA 300 row, the 300A column update, the 301 detail PDF, the ITA CSV for electronic submission, a RIDDOR notification record, a SafeWork NSW notification, and a generic record-copy PDF. The worker also taps body parts and picks severity on a 5-by-5 matrix — that routes the case onto the right workflow track and fires the right CAPA process. When they hit submit, every regulator deadline is computed, the countdown surfaces in the UI, and a tamper-evident audit entry is written."

**Transition:** "That's the promise. Three things separate us from everything else on the market."

---

## Slide 4 — Three differentiators

**Opener:** "Three things nobody else does — together."

**Body:** "**One**: multi-jurisdiction by design. US OSHA 1904, UK RIDDOR 2013, AU WHS Act 2011 — all wired into the same data model. Not a per-customer integration. A multi-national doesn't pay for three separate implementations.

**Two**: regulator-grade evidence. Every regulatory specific in the code is cited verbatim from primary sources. The annual OSHA 300A summary is snapshotted at certification time into an immutable table — so post-cert mutation can't drift the signed document. The activity log is a SHA-256 hash chain per organisation, append-only, immutable.

**Three**: the operator never sees the compliance machinery. The interface is a body map, a kanban board, a voice intake, a real-time KPI dashboard. The regulatory engine runs silently underneath."

**Transition:** "Let me walk you through the surface, then drop into a few of the deeper differentiators."

---

## Slide 5 — Capture (1 of 8)

**Opener:** "Capture starts with the incident wizard."

**Body:** "Eight incident types — injury, illness, near-miss, property damage, environmental release, unsafe condition, observation, dangerous occurrence. A clickable 3-D body map with four views: front, back, left, right. The 5-by-5 risk matrix computes severity from likelihood times consequence, and you can override the auto-classification with a reason that goes into the audit log. Voice intake is a global FAB — transcribed and mapped to form fields, with a review card before submit. The wizard is jurisdiction-aware — RIDDOR fields appear only for UK sites, SafeWork NSW fields only for AU. No clutter. And multi-person incidents are a first-class concept: one event, many affected persons, each with their own injury record and treatment chain."

**Transition:** "Once it's captured, what happens next is automatic."

---

## Slide 6 — Triage & routing (2 of 8)

**Opener:** "Severity isn't just a label — it's a workflow."

**Body:** "Severity S1 or S2 — Track A. Critical. Full investigation required, mandatory 5-Whys analysis, root cause documented, CAPA required with an independent verifier. Severity S3 — Track B. Moderate. Light investigation, CAPA optional based on closure gates. Severity S4 or S5 — Track C. Auto-closes observations and minor incidents, but still records them for trend analysis. The classification fires *at capture time*, not at the end of the workflow. Recordability and reportability flags are emitted instantly, so the regulator clock starts ticking on the right minute."

**Transition:** "From triage, two boards run the operational lifecycle."

---

## Slide 7 — Investigation & CAPA (3 of 8)

**Opener:** "Two kanbans. One rule."

**Body:** "The investigation board has four lanes — pending, in progress, awaiting CAPA, closed. Drag-drop with lane-transition validation. Built-in 5-Whys analyser, root-cause flagging, an investigation team with roles, and direct CAPA assignment out of the investigation. The CAPA board uses the same kanban model: pending, in progress, pending verification, closed. Overdue tasks light up red, due-soon amber. And the rule that matters: **owner cannot equal verifier**. That's enforced at the database trigger level. No one can rubber-stamp their own corrective action — not from the UI, not from the API, not from the database. The schema says no."

**Transition:** "Now the part the regulator cares about — the reports surface."

---

## Slide 8 — Reports table (4 of 8)

**Opener:** "This is where the compliance engine becomes visible."

**Body:** "Nine artifacts, generated from the same captured incident. United States: OSHA Form 300 Log as a 13-column landscape PDF, citing 29 CFR 1904.29. Form 300A — both draft and certified modes — under 1904.32. Form 301, the individual incident report. ITA CSV with byte-for-byte parity to OSHA's official template, under 1904.41. The 1904.39 severe-injury flow with 8-hour and 24-hour clocks. United Kingdom: RIDDOR F2508 record covering Regulations 4 through 11. Australia: SafeWork NSW notification, the record copy of the s.35-to-s.39 phone-and-written notification process. And cross-cutting: the universal generic incident PDF, and the audit log export.

A new touch — every report has an *All sites* filter for org-wide rollups. But where the regulation forbids cross-site aggregation — OSHA 300 and 300A are per-establishment under 1904.30(a) — Safelync prompts for a single site and quotes the citation. We never silently aggregate where the regulator says no."

**Transition:** "Let me drop into the 300A because that's the lighthouse for how we handle certified documents."

---

## Slide 9 — Deep dive: OSHA 300A snapshot

**Opener:** "Certify once. Frozen forever."

**Body:** "When an EHS lead certifies the annual 300A summary, Safelync writes the column totals — all twelve of them — into an immutable snapshot table. From that moment forward, the certified view reads the snapshot, displays the green CERTIFIED badge, and reproduces the document exactly as it was signed. The draft view, which has a red DRAFT stamp, reads live aggregation. The verbatim 1904.32(b)(3) affirmation is embedded in the PDF. The certifier-title is validated against the four-key regulatory allowlist. This is exactly what 29 CFR 1904.32(b)(5) requires — and it's something most competitors quietly violate. Their 300A regenerates from live data every time it's opened, which means editing an underlying incident silently mutates the historical record. Ours doesn't."

**Transition:** "The certification is one half of the regulator-clock story. The other half is the deadlines."

---

## Slide 10 — Deadlines (5 of 8)

**Opener:** "The countdown nobody else has."

**Body:** "A unified deadline aggregator rolls up every applicable regulator clock per incident. United States: OSHA 1904.39 — 8 hours for a fatality, 24 hours for hospitalisation, amputation, or eye loss. United Kingdom RIDDOR — *without delay* for fatalities and dangerous occurrences, 10 days for over-7-day injuries, 15 days for diseases, 14 days for gas incidents. Australia SafeWork NSW — *immediately* by phone under s.38, then 48 hours for the written report *after the regulator requests it* — anchored on the request, not the incident. Most competitors get that one wrong. Every list row in the product gets a most-urgent badge. Every detail page shows the full deadline stack, urgency colour-coded. The inspector stops asking *did you notify?* — the answer is on the screen."

**Transition:** "Two more workflow surfaces, then the integrity story."

---

## Slide 11 — Override approval (6 of 8)

**Opener:** "The two-person rule."

**Body:** "OSHA recordability and RIDDOR reportability are the most-contested fields in an incident record. They're also the most-audited. So when a worker challenges *should this really be recordable?*, the request goes into an approvals queue. A supervisor reviews. The decision lands in the activity log with field-level diffs. The constraint enforced at the database trigger: requester cannot equal decider. Self-approval is impossible. There's a whitelist of override-able fields, so nobody can quietly flip something they shouldn't be touching. The audit trail is intact whether the override is approved, rejected, or withdrawn."

**Transition:** "Speaking of audit trail."

---

## Slide 12 — Audit log (7 of 8)

**Opener:** "Tamper-evident by construction."

**Body:** "Every state change in the system writes an activity-log row. SHA-256 hash chain per organisation — each row hashes the previous hash concatenated with the canonical row content. Anyone can recompute the chain and prove no row was edited after the fact. Append-only — DELETE is blocked at the trigger level. Immutable once hydrated — a BEFORE UPDATE trigger stops re-hashing. The row captures who, when, IP address, user agent, and a field-level diff of every change. Exportable as CSV for inspector requests. This is the slide they'll remember — because every regulator audit eventually asks for the activity trail, and Safelync hands over a mathematically verifiable one."

**Transition:** "There's a long tail of supporting surfaces that turn this into a real product, not just a compliance gadget."

---

## Slide 13 — Supporting surface (8 of 8)

**Opener:** "Don't underestimate these."

**Body:** "The dashboard surfaces TRIR, DART, LTIR, severity rate, open incidents, overdue CAPAs, PM compliance — animated count-ups, a stop-work alert banner that broadcasts across pages. Risk Register with the same 5-by-5 matrix, tracking inherent versus residual risk. Assets and Maintenance — preventive, calibration, inspection schedules with overdue tracking. Documents with folder hierarchy, version history, polymorphic linking back to the incidents they reference. Sites and roles — multi-site with NAICS, HSE establishment ID, parent-site hierarchy. Six roles with route-level enforcement. Inspections with a publish-draft-archive template lifecycle. Global search. Notifications panel. A learning module with guided scenarios. CSV imports for users, sites, assets, and work hours. Empty-state onboarding proven by three test tenants — one US, one UK, one AU. This is a complete EHS platform, not a single-purpose tool."

**Transition:** "So where does that put us against the alternatives the room is probably already paying for?"

---

## Slide 14 — Vs incumbents

**Opener:** "Where Safelync wins — pick whichever the room cares about."

**Body:** "Against **spreadsheets plus a regulator portal**: spreadsheets don't compute 1904.39 deadlines, don't hash-chain their history, and don't refuse to let an owner verify their own CAPA. We do all three.

Against **single-jurisdiction SaaS** — Origami, Intelex, EHS Insight: one capture for three regulators is built into our schema, not bolted on per customer. A multi-national doesn't pay for three implementations.

Against **enterprise GRC suites** — Cority, VelocityEHS, Enablon: a hash-chained audit log, verbatim section citations on the rendered PDFs, snapshot-on-certify — these are usually six-figure consulting deliverables. We ship them in-product, no nine-month rollout.

Against **SafetyCulture-style ops apps**: we match their UX — body map, kanban, voice intake, real-time KPIs — *plus* the regulatory engine they don't have."

**Transition:** "If the room is wondering whether this is real, here's the receipts slide."

---

## Slide 15 — Proof points

**Opener:** "*Is this real?* — Yes."

**Body:** "33 schema migrations. Six PDF renderers in production — Form 300, 300A, 301, the ITA CSV, the SafeWork NSW record copy, and the generic incident report — plus the RIDDOR F2508 coming next. 118-plus automated tests across nine end-to-end suites and five unit suites — every regulatory engine has a regression gate. The OSHA ITA CSV has a byte-for-byte parity test against OSHA's official template — if OSHA updates the template, our test fires immediately. Every regulatory specific in the code is cited verbatim — 1904.29, 1904.32, 1904.39, 1904.41, RIDDOR SI 2013/1471, WHS Act 2011 NSW s.35 to s.39, HSE INDG453. Nothing was invented. Every category, every deadline, every form layout came from the primary regulatory source. Three empty test tenants exercise the cross-framework smoke matrix."

**Transition:** "Now — what's not done."

---

## Slide 16 — What's next

**Opener:** "What's coming."

**Body:** "Near term: the RIDDOR F2508 PDF, gated on getting the HSE visual reference; that's the seventh PDF and the renderer pattern is proven six times already. A first-login walkthrough plus sample-data toggle for new tenants. Recurring inspections and training cadence — reuses the asset-maintenance schedule pattern.

AI assist — the plumbing is already in product: voice intake transcribes into the wizard fields. Next moves: 5-Whys suggestions driven by prior incidents in the same body region or asset type; prompt-driven autofill where the system asks targeted questions and the AI normalises free text; video-to-incident — extending the voice pipeline to accept video.

Beyond that: additional jurisdictions — Canada, EU member states — workers' comp first-report integration, and a mobile-native field app."

**Transition:** "If we're going live, here's the eight-step path I'll run."

---

## Slide 17 — Live demo

**Opener:** "The eight-step click-through."

**Body:** "I'll log in as Priya — the COO of SDS Manager Inc. Her org has four sites: Cleveland in the US, Sheffield in the UK, Dallas in the US, and Sydney in Australia. So we cover all three jurisdictions from one tenant.

Step one: dashboard. Call out the animated KPIs and the stop-work banner.

Step two: new-incident wizard — injury type, body map, 5-by-5 matrix, submit. Watch the regulatory flags get computed live.

Step three: download the OSHA 300 PDF, the 300A draft, and the 301 — all generated from the same captured data.

Step four: investigations kanban — drag a card, open the 5-Whys panel on the scaffold-fall investigation.

Step five: CAPA kanban — try to verify your own corrective action; watch the database trigger reject it.

Step six: reports. Pick *All sites* — TRIR and DART roll up across the four-jurisdiction org. Then switch to the Sydney site to surface the SafeWork NSW notification, with the overdue countdown.

Step seven: audit log — export CSV — show the field-level diffs and the hash chain.

Step eight: approvals queue — recordability override — two-person decision lands in the log.

End on the audit log. That's the slide they'll remember."

**Transition:** "And that's Safelync."

---

## Slide 18 — Closing

**Opener:** "One capture. Three regulators. Zero retyping."

**Body:** "Inspector-grade evidence, on demand. EHS teams stop typing the same incident five times. Auditors get a hash-chained trail they can verify. The CFO gets TRIR, DART, and LTIR on one dashboard. The worker who reported it — they tap a body map and hit submit. That's the product. Thank you — let's take questions."

---

## Timing guide

| Pace | Total | Per slide (avg) |
|---|---|---|
| Quick (read fast, trim) | ~8 minutes | 25–30 seconds |
| Standard (recommended) | ~12 minutes | 40 seconds |
| Deep dive (with audience questions) | ~20 minutes | 60+ seconds |

Strongest two slides for emphasis: **Slide 9 (300A snapshot)** and **Slide 12 (Audit log)**. Slow down on those. Speed up on slides 5–7 — they're surface-level features the audience can absorb visually.

## Anticipated questions

- **"What's the pricing model?"** → Defer: "Happy to discuss after the demo — pricing depends on org size and which jurisdictions you need; let's first make sure the fit is right."
- **"How long is implementation?"** → "Empty-tenant signup is minutes. Full data migration for a multi-site org is typically two to four weeks, mostly your data, not our setup."
- **"What about [my favourite regulator]?"** → "We currently ship US OSHA, UK RIDDOR, and AU SafeWork NSW. Canada and EU member states are on the roadmap. New jurisdictions follow our verbatim-extraction pattern — we don't ship a regulator until we've cited the source."
- **"Is the data encrypted at rest?"** → "Yes — SQLite is the development substrate; production deployments use Postgres with encryption at rest and TLS in transit. The hash chain works in both."
- **"Can I export everything if I want to leave?"** → "Yes — every report has a CSV export and there's a full org-wide data export via the API. No lock-in by design."
- **"Who owns the data?"** → "You do. We're a processor. Standard DPA terms."
