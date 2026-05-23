-- Echo Gallery: saved works table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS echo_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  original_text TEXT NOT NULL,
  core_words JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_words JSONB NOT NULL DEFAULT '[]'::jsonb,
  particles JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode TEXT NOT NULL,
  density NUMERIC NOT NULL DEFAULT 0.6,
  motion NUMERIC NOT NULL DEFAULT 0.4,
  intensity NUMERIC NOT NULL DEFAULT 0.4,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS echo_works_created_at_idx ON echo_works (created_at DESC);
CREATE INDEX IF NOT EXISTS echo_works_mode_idx ON echo_works (mode);
