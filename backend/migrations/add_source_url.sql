-- Migration: Add source_url column to jobs table
-- Run this against your PostgreSQL database:
--   psql -U rebit -d rebit -f backend/migrations/add_source_url.sql

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'source_url'
    ) THEN
        ALTER TABLE jobs ADD COLUMN source_url VARCHAR;
        RAISE NOTICE 'Column source_url added to jobs table';
    ELSE
        RAISE NOTICE 'Column source_url already exists';
    END IF;
END $$;