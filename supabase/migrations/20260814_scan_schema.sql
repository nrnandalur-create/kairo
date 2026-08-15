-- S&P 500 RSI scan — shared market-wide data (not per-user), same shape as
-- the existing `setups` table (cron/job writes server-side via service role,
-- clients read directly with the anon key).

CREATE TABLE IF NOT EXISTS scan_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_date      DATE NOT NULL,
  status         TEXT CHECK (status IN ('running','done','failed')) DEFAULT 'running',
  total          INT NOT NULL,
  cursor         INT NOT NULL DEFAULT 0,
  processed      INT NOT NULL DEFAULT 0,
  failed_count   INT NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_date ON scan_jobs (scan_date, started_at DESC);

CREATE TABLE IF NOT EXISTS scan_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID REFERENCES scan_jobs(id),
  scan_date    DATE NOT NULL,
  ticker       TEXT NOT NULL,
  company_name TEXT,
  sector       TEXT,
  price        NUMERIC,
  rsi          NUMERIC,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scan_date, ticker)
);
CREATE INDEX IF NOT EXISTS idx_scan_results_date_rsi ON scan_results (scan_date, rsi ASC);

ALTER TABLE scan_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_results ENABLE ROW LEVEL SECURITY;

-- Same "anyone reads" pattern as `setups` — writes stay service-role-only
-- (no insert/update/delete policies).
CREATE POLICY "anyone reads scan_jobs" ON scan_jobs FOR SELECT USING (true);
CREATE POLICY "anyone reads scan_results" ON scan_results FOR SELECT USING (true);
