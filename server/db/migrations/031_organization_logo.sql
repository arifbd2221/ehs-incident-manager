-- 031_organization_logo.sql — WI-01 carry-forward: organisation logo
-- embedding for the regulator PDF renderers.
--
-- Adds a single optional column `logo_path` to organizations. The value
-- stored is a basename only (e.g., "4e5a8b1c-9d2e-...png") — the actual
-- file lives under server/uploads/ where the rest of the platform's
-- attachment files live. The PDF renderers resolve the full path at
-- render time via `path.join(UPLOAD_DIR, organization.logo_path)`.
--
-- Format restriction is enforced at the upload route (PNG / JPG only —
-- pdfkit can embed both). No CHECK constraint on the column because the
-- format may legitimately be NULL when no logo has been uploaded.
--
-- Per the standing additive-only directive (memory
-- feedback_no_structural_changes): this is an ALTER TABLE ADD COLUMN on
-- an existing table. The owner explicitly requested the WI-01 carry-
-- forward work in this session.

ALTER TABLE organizations ADD COLUMN logo_path TEXT;
