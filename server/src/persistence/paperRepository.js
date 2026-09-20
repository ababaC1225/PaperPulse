import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { analysisEligibility } from '../domain/cleaning.js'

function json(value, fallback = []) {
  if (value == null) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function stablePaperId(record) {
  const identity = record.doi || `${record.normalized_title}|${record.conference || ''}|${record.year || ''}|${record.source_record_id || record.canonical_url || ''}`
  return `PP-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 10).toUpperCase()}`
}

function rowToPaper(row) {
  if (!row) return null
  const paper = {
    ...row,
    keywords: json(row.keywords_json),
    authors: json(row.authors_json),
    missing_fields: json(row.missing_fields_json)
  }
  delete paper.keywords_json
  delete paper.authors_json
  delete paper.missing_fields_json
  Object.assign(paper, analysisEligibility(paper))
  return paper
}

function rowToImportItem(row) {
  if (!row) return null
  return {
    ...row,
    candidate: json(row.candidate_json, null),
    retry_eligible: Boolean(row.retry_eligible)
  }
}

export class PaperRepository {
  constructor(databasePath = ':memory:') {
    if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true })
    this.db = new DatabaseSync(databasePath)
    this.db.exec('PRAGMA foreign_keys = ON;')
    if (databasePath !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL;')
    this.migrate()
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS papers (
        paper_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        normalized_title TEXT NOT NULL,
        conference TEXT,
        year INTEGER,
        abstract TEXT,
        keywords_json TEXT NOT NULL DEFAULT '[]',
        original_url TEXT,
        canonical_url TEXT,
        source_name TEXT,
        source_record_id TEXT,
        doi TEXT,
        authors_json TEXT NOT NULL DEFAULT '[]',
        data_status TEXT NOT NULL CHECK (data_status IN ('complete', 'missing_fields', 'duplicate', 'fetch_failed')),
        missing_fields_json TEXT NOT NULL DEFAULT '[]',
        retrieval_error TEXT,
        retrieved_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS papers_title_conf_year_unique
        ON papers(normalized_title, conference, year)
        WHERE conference IS NOT NULL AND year IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS papers_doi_unique ON papers(doi) WHERE doi IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS papers_source_record_unique
        ON papers(source_name, source_record_id) WHERE source_name IS NOT NULL AND source_record_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS papers_url_unique ON papers(canonical_url) WHERE canonical_url IS NOT NULL;

      CREATE TABLE IF NOT EXISTS search_candidates (
        candidate_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS import_jobs (
        job_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS import_items (
        item_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES import_jobs(job_id) ON DELETE CASCADE,
        row_number INTEGER NOT NULL,
        input_value TEXT NOT NULL,
        normalized_input TEXT NOT NULL,
        status TEXT NOT NULL,
        paper_id TEXT REFERENCES papers(paper_id),
        candidate_json TEXT,
        failure_reason TEXT,
        retry_eligible INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS import_items_job_idx ON import_items(job_id, row_number);

      CREATE TABLE IF NOT EXISTS response_cache (
        cache_key TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        status INTEGER NOT NULL,
        headers_json TEXT NOT NULL,
        body TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
  }

  close() { this.db.close() }

  findDuplicate(record) {
    const queries = []
    if (record.doi) queries.push(['SELECT * FROM papers WHERE doi = ?', [record.doi]])
    if (record.source_name && record.source_record_id) queries.push(['SELECT * FROM papers WHERE source_name = ? AND source_record_id = ?', [record.source_name, record.source_record_id]])
    if (record.canonical_url) queries.push(['SELECT * FROM papers WHERE canonical_url = ?', [record.canonical_url]])
    if (record.normalized_title && record.conference && record.year) queries.push([
      'SELECT * FROM papers WHERE normalized_title = ? AND conference = ? AND year = ?',
      [record.normalized_title, record.conference, record.year]
    ])
    for (const [sql, params] of queries) {
      const found = this.db.prepare(sql).get(...params)
      if (found) return rowToPaper(found)
    }
    return null
  }

  savePaper(record) {
    const existing = this.findDuplicate(record)
    if (existing) {
      const preferNew = existing.data_status !== 'complete'
        && record.data_status !== 'fetch_failed'
        && (existing.data_status === 'fetch_failed'
          || (record.missing_fields?.length ?? Infinity) < (existing.missing_fields?.length ?? Infinity))
      if (!preferNew) return { outcome: 'duplicate', paper: existing }
      const merged = {
        ...existing,
        ...record,
        abstract: record.abstract || existing.abstract,
        keywords: record.keywords?.length ? record.keywords : existing.keywords,
        authors: record.authors?.length ? record.authors : existing.authors,
        original_url: record.original_url || existing.original_url,
        canonical_url: record.canonical_url || existing.canonical_url,
        source_name: record.source_name || existing.source_name,
        source_record_id: record.source_record_id || existing.source_record_id,
        doi: record.doi || existing.doi
      }
      const now = new Date().toISOString()
      this.db.prepare(`
        UPDATE papers SET title = ?, normalized_title = ?, conference = ?, year = ?, abstract = ?, keywords_json = ?,
          original_url = ?, canonical_url = ?, source_name = ?, source_record_id = ?, doi = ?, authors_json = ?,
          data_status = ?, missing_fields_json = ?, retrieval_error = ?, retrieved_at = ?, updated_at = ?
        WHERE paper_id = ?
      `).run(
        merged.title, merged.normalized_title, merged.conference, merged.year, merged.abstract, JSON.stringify(merged.keywords || []),
        merged.original_url, merged.canonical_url, merged.source_name, merged.source_record_id, merged.doi, JSON.stringify(merged.authors || []),
        record.data_status, JSON.stringify(record.missing_fields || []), record.retrieval_error,
        record.retrieved_at || now, now, existing.paper_id
      )
      return { outcome: record.data_status, paper: this.getPaper(existing.paper_id) }
    }
    const now = new Date().toISOString()
    const paperId = record.paper_id || stablePaperId(record)
    this.db.prepare(`
      INSERT INTO papers (
        paper_id, title, normalized_title, conference, year, abstract, keywords_json,
        original_url, canonical_url, source_name, source_record_id, doi, authors_json,
        data_status, missing_fields_json, retrieval_error, retrieved_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paperId, record.title, record.normalized_title, record.conference, record.year,
      record.abstract, JSON.stringify(record.keywords || []), record.original_url, record.canonical_url,
      record.source_name, record.source_record_id, record.doi, JSON.stringify(record.authors || []),
      record.data_status, JSON.stringify(record.missing_fields || []), record.retrieval_error,
      record.retrieved_at || now, now, now
    )
    return { outcome: record.data_status, paper: this.getPaper(paperId) }
  }

  getPaper(paperId) {
    return rowToPaper(this.db.prepare('SELECT * FROM papers WHERE paper_id = ?').get(paperId))
  }

  listPapers({ query = '', conference = null, year = null, status = null, limit = 50, offset = 0 } = {}) {
    const clauses = []
    const params = []
    if (query) {
      clauses.push('(normalized_title LIKE ? OR title LIKE ? OR authors_json LIKE ?)')
      const wildcard = `%${query}%`
      params.push(wildcard, wildcard, wildcard)
    }
    if (conference) { clauses.push('conference = ?'); params.push(conference) }
    if (year) { clauses.push('year = ?'); params.push(year) }
    if (status) { clauses.push('data_status = ?'); params.push(status) }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const total = this.db.prepare(`SELECT COUNT(*) AS count FROM papers ${where}`).get(...params).count
    const rows = this.db.prepare(`SELECT * FROM papers ${where} ORDER BY retrieved_at DESC, title ASC LIMIT ? OFFSET ?`).all(...params, limit, offset)
    return { items: rows.map(rowToPaper), total, limit, offset }
  }

  saveCandidates(candidates, ttlSeconds) {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString()
    const statement = this.db.prepare(`
      INSERT INTO search_candidates(candidate_id, payload_json, created_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(candidate_id) DO UPDATE SET payload_json = excluded.payload_json, created_at = excluded.created_at, expires_at = excluded.expires_at
    `)
    this.db.exec('BEGIN')
    try {
      for (const candidate of candidates) statement.run(candidate.candidate_id, JSON.stringify(candidate), now.toISOString(), expiresAt)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getCandidate(candidateId) {
    const row = this.db.prepare('SELECT * FROM search_candidates WHERE candidate_id = ?').get(candidateId)
    if (!row) return null
    return { ...json(row.payload_json, null), expired: row.expires_at <= new Date().toISOString() }
  }

  createImportJob(entries) {
    const jobId = crypto.randomUUID()
    const now = new Date().toISOString()
    const insert = this.db.prepare(`
      INSERT INTO import_items(item_id, job_id, row_number, input_value, normalized_input, status, failure_reason, retry_eligible, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.db.exec('BEGIN')
    try {
      this.db.prepare('INSERT INTO import_jobs(job_id, status, created_at, updated_at) VALUES (?, ?, ?, ?)').run(jobId, 'pending', now, now)
      for (const entry of entries) {
        insert.run(crypto.randomUUID(), jobId, entry.row_number, entry.input_value, entry.normalized_input, entry.status || 'pending', entry.failure_reason || null, entry.retry_eligible ? 1 : 0, now, now)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.getImportJob(jobId)
  }

  updateImportItem(itemId, patch) {
    const allowed = ['status', 'paper_id', 'candidate_json', 'failure_reason', 'retry_eligible']
    const fields = Object.keys(patch).filter((key) => allowed.includes(key))
    if (!fields.length) return
    const values = fields.map((key) => key === 'candidate_json' && patch[key] && typeof patch[key] !== 'string' ? JSON.stringify(patch[key]) : key === 'retry_eligible' ? (patch[key] ? 1 : 0) : patch[key])
    fields.push('updated_at')
    values.push(new Date().toISOString(), itemId)
    this.db.prepare(`UPDATE import_items SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE item_id = ?`).run(...values)
  }

  setImportJobStatus(jobId, status) {
    this.db.prepare('UPDATE import_jobs SET status = ?, updated_at = ? WHERE job_id = ?').run(status, new Date().toISOString(), jobId)
  }

  listImportItems(jobId, statuses = null) {
    const rows = statuses?.length
      ? this.db.prepare(`SELECT * FROM import_items WHERE job_id = ? AND status IN (${statuses.map(() => '?').join(',')}) ORDER BY row_number`).all(jobId, ...statuses)
      : this.db.prepare('SELECT * FROM import_items WHERE job_id = ? ORDER BY row_number').all(jobId)
    return rows.map(rowToImportItem)
  }

  getImportJob(jobId) {
    const job = this.db.prepare('SELECT * FROM import_jobs WHERE job_id = ?').get(jobId)
    if (!job) return null
    const items = this.listImportItems(jobId)
    const counts = { total: items.length, pending: 0, processing: 0, successful: 0, duplicate: 0, missing_fields: 0, failed: 0 }
    for (const item of items) {
      if (Object.hasOwn(counts, item.status)) counts[item.status] += 1
    }
    return { ...job, counts, items }
  }

  resetRetryableItems(jobId) {
    const now = new Date().toISOString()
    const result = this.db.prepare(`
      UPDATE import_items SET status = 'pending', failure_reason = NULL, retry_eligible = 0, updated_at = ?
      WHERE job_id = ? AND retry_eligible = 1
    `).run(now, jobId)
    if (result.changes) this.setImportJobStatus(jobId, 'pending')
    return Number(result.changes)
  }

  getCachedResponse(cacheKey) {
    const row = this.db.prepare('SELECT * FROM response_cache WHERE cache_key = ? AND expires_at > ?').get(cacheKey, new Date().toISOString())
    return row ? { status: row.status, headers: json(row.headers_json, {}), body: row.body } : null
  }

  setCachedResponse(cacheKey, { url, status, headers, body }, ttlSeconds) {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString()
    this.db.prepare(`
      INSERT INTO response_cache(cache_key, url, status, headers_json, body, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET status = excluded.status, headers_json = excluded.headers_json,
        body = excluded.body, expires_at = excluded.expires_at, created_at = excluded.created_at
    `).run(cacheKey, url, status, JSON.stringify(headers || {}), body, expiresAt, now.toISOString())
  }
}
