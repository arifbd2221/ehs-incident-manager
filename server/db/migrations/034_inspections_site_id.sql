-- Add site_id to inspections for site-scoped filtering
ALTER TABLE inspections ADD COLUMN site_id INTEGER REFERENCES sites(id);

CREATE INDEX IF NOT EXISTS idx_inspections_site ON inspections(site_id);
