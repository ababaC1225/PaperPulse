CREATE TABLE IF NOT EXISTS papers (
  paper_id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  normalized_title TEXT NOT NULL CHECK (length(trim(normalized_title)) > 0),
  conference TEXT CHECK (conference IS NULL OR conference IN ('CVPR', 'ICCV', 'ECCV')),
  year INTEGER CHECK (year IS NULL OR year BETWEEN 1980 AND 2100),
  abstract TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  original_url TEXT,
  canonical_url TEXT,
  source_name TEXT,
  source_record_id TEXT,
  doi TEXT,
  authors_json TEXT NOT NULL DEFAULT '[]',
  data_status TEXT NOT NULL
    CHECK (data_status IN ('complete', 'missing_fields', 'duplicate', 'fetch_failed')),
  missing_fields_json TEXT NOT NULL DEFAULT '[]',
  retrieval_error TEXT,
  retrieved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS papers_title_conf_year_unique
  ON papers(normalized_title, conference, year)
  WHERE conference IS NOT NULL AND year IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS papers_doi_unique
  ON papers(doi)
  WHERE doi IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS papers_source_record_unique
  ON papers(source_name, source_record_id)
  WHERE source_name IS NOT NULL AND source_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS papers_url_unique
  ON papers(canonical_url)
  WHERE canonical_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS papers_conference_year_idx
  ON papers(conference, year);
CREATE INDEX IF NOT EXISTS papers_status_idx
  ON papers(data_status);

CREATE TABLE IF NOT EXISTS search_candidates (
  candidate_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS search_candidates_expiry_idx
  ON search_candidates(expires_at);

CREATE TABLE IF NOT EXISTS import_jobs (
  job_id TEXT PRIMARY KEY,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_items (
  item_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES import_jobs(job_id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  input_value TEXT NOT NULL,
  normalized_input TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'processing', 'successful', 'duplicate', 'missing_fields', 'failed')),
  paper_id TEXT REFERENCES papers(paper_id) ON DELETE SET NULL,
  candidate_json TEXT,
  failure_reason TEXT,
  retry_eligible INTEGER NOT NULL DEFAULT 0 CHECK (retry_eligible IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT import_items_job_row_unique UNIQUE (job_id, row_number)
);

CREATE INDEX IF NOT EXISTS import_items_job_idx
  ON import_items(job_id, row_number);
CREATE INDEX IF NOT EXISTS import_items_job_status_idx
  ON import_items(job_id, status);

CREATE TABLE IF NOT EXISTS response_cache (
  cache_key TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status INTEGER NOT NULL,
  headers_json TEXT NOT NULL,
  body TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS response_cache_expiry_idx
  ON response_cache(expires_at);
