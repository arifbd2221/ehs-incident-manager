# Regulatory Source Material

This directory holds owner-supplied authoritative reference material for regulation-driven work items. Per memory `feedback_regulatory_truth.md` and `docs/compliance-notes.md` §10, **regulatory specifics (deadlines, category enumerations, schedule lists, portal URLs, prescribed CSV/PDF layouts) must not be invented from model memory.** Implementation work that depends on a list in this directory must pause until the relevant subdirectory is populated.

When a source is added, link it from the relevant work item in `docs/implementation-plan.md` and tick the gate state in `roadmap.md`.

## Directory layout + what each gate needs

### `osha/`
For **WI-02** (OSHA 300A PDF + ITA CSV):
- The OSHA Injury Tracking Application (ITA) upload CSV template — exact column order, header names, and any documented validation rules. A reference upload-spec PDF from osha.gov is acceptable.
- An example of a filled OSHA 300A paper form for visual-layout reference (any year).

For **WI-01** (OSHA 300 PDF) and **WI-03** (OSHA 301 PDF):
- An example of a filled OSHA 300 log and an OSHA 301 form for layout reference. These forms have stable layouts; the prescribed format is in 29 CFR Part 1904 Appendix A.

### `riddor/`
For **WI-04** (RIDDOR Reg 5 + 11 logic):
- **Reg 5** (non-workers) — HSE's authoritative reading of Regulation 5: which non-worker outcomes are reportable. The plain text of Reg 5 (statutory instrument) plus any HSE guidance note is sufficient.
- **Reg 11** (gas incidents) — Regulation 11 plain text plus HSE's guidance on what counts as a gas incident.
- **Reg 7 / Schedule 2** (dangerous occurrences) — full Schedule 2 list. Needed to extend the partial list in `riddor.js` line 23.
- **Reg 8 / Schedule 1** (occupational diseases) — full Schedule 1 list. Needed to extend the partial list in `riddor.js` lines 45–50.

For **WI-05** (RIDDOR F2508 PDF):
- A visual reference of the HSE F2508 online form — either a saved PDF/screenshot of the live form, or the form-field spec from HSE.

### `safework-nsw/`
For **WI-06** (SafeWork NSW notification engine + form + PDF):
- **WHS Act 2011 (NSW)** s.36 enumeration of "serious injury or illness" categories.
- **WHS Act 2011 (NSW)** s.37 enumeration of "dangerous incidents."
- Official **Notify SafeWork NSW** form (or its field spec) — what fields appear, conditional sections, declaration text.
- **ANZSIC code list** — CSV of all ANZSIC 2006 codes + descriptions. Australian Bureau of Statistics publishes this; the full list is large (thousands of rows) but the platform must lookup against it for the PCBU section.

## How to drop sources

1. PDFs / screenshots / official forms → drop in the relevant subdirectory with descriptive filenames (e.g. `riddor/schedule-2-dangerous-occurrences.pdf`).
2. CSV / lookup data → drop as `.csv` with a header row. Add a one-line `.md` sibling describing the source URL + retrieval date.
3. After dropping, leave a note in the next session's prompt — "WI-04 sources populated, proceed."

## Hallucination flag: not yet populated

As of 2026-05-11, this directory is empty (only this README and three empty subdirs). All four hallucination-risk WIs are blocked until owner populates the relevant subdirectory.
