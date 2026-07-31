-- ── JobStatus enum safety net ───────────────────────────────────────
-- 'uploaded' already exists on this value in every environment (it was
-- added directly via ALTER TYPE by the backend's old init_db(), before
-- that code was removed). schema.prisma has always declared it, but no
-- migration ever created it — this closes that gap. IF NOT EXISTS makes
-- it a no-op anywhere it's already present.
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'uploaded';

-- ── Drop abandoned columns ───────────────────────────────────────────
-- Leftover from an abandoned YouTube-cookies feature. Never in
-- schema.prisma, never in the backend's SQLAlchemy models — added
-- directly to the database outside both ORMs and never used since.
ALTER TABLE "app_settings"
DROP COLUMN IF EXISTS "youtubeCookiesSize";

ALTER TABLE "app_settings"
DROP COLUMN IF EXISTS "youtubeCookiesUpdatedAt";

-- Brings two columns/constraints that the backend was previously adding
-- itself via raw ALTER TABLE (in database.py's init_db) under Prisma's
-- ownership instead. Written to be safe to run against a database that
-- already has them (existing deployments) or doesn't (fresh ones).

-- ── pipeline_lock_at ─────────────────────────────────────────────────
-- Single-flight lock so only one pipeline task runs per job at a time.
ALTER TABLE "jobs"
ADD COLUMN IF NOT EXISTS "pipeline_lock_at" TIMESTAMPTZ;

-- ── pipeline_steps de-dupe + unique constraint ──────────────────────
-- Remove duplicate (job_id, stage) rows before the constraint is added,
-- otherwise the ADD CONSTRAINT below fails outright on any database
-- that already has duplicates from the old race condition. Keeps the
-- "best" row per group: complete > failed > running > pending, tied
-- broken by most recent started_at then id.
DELETE FROM "pipeline_steps"
WHERE
    id IN (
        SELECT id
        FROM (
                SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY
                            job_id, stage
                        ORDER BY
                            CASE status
                                WHEN 'complete' THEN 4
                                WHEN 'failed' THEN 3
                                WHEN 'running' THEN 2
                                ELSE 1
                            END DESC, started_at DESC NULLS LAST, id DESC
                    ) AS rn
                FROM "pipeline_steps"
            ) ranked
        WHERE
            rn > 1
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_pipeline_step_job_stage'
    ) THEN
        ALTER TABLE "pipeline_steps"
            ADD CONSTRAINT "uq_pipeline_step_job_stage" UNIQUE ("job_id", "stage");
    END IF;
END $$;