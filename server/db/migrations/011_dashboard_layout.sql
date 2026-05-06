-- Add dashboard_layout JSON column to users table for customizable dashboard widget preferences
ALTER TABLE users ADD COLUMN dashboard_layout TEXT DEFAULT NULL;
