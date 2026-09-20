import crypto from 'node:crypto'
import { analysisEligibility } from '../domain/cleaning.js'
import { openDatabase } from './database.js'

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
    this.db = openDatabase(databasePath)
  }

  close() { this.db.close() }

  findIdentityConflict(record, { excludePaperId = null } = {}) {
    const checks = []
    if (record.doi) checks.push({ identity: 'doi', where: 'doi = ?', params: [record.doi] })
    if (record.source_name && record.source_record_id) {
      checks.push({ identity: 'source_record', where: 'source_name = ? AND source_record_id = ?', params: [record.source_name, record.source_record_id] })
    }
    if (record.canonical_url) checks.push({ identity: 'canonical_url', where: 'canonical_url = ?', params: [record.canonical_url] })
    if (record.normalized_title && record.conference && record.year) {
      checks.push({
        identity: 'normalized_title_conference_year',
        where: 'normalized_title = ? AND conference = ? AND year = ?',
        params: [record.normalized_title, record.conference, record.year]
      })
    }
    for (const check of checks) {
      const exclusion = excludePaperId ? ' AND paper_id <> ?' : ''
      const params = excludePaperId ? [...check.params, excludePaperId] : check.params
      const found = this.db.prepare(`SELECT * FROM papers WHERE ${check.where}${exclusion}`).get(...params)
      if (found) return { identity: check.identity, paper: rowToPaper(found) }
    }
    return null
  }

  findDuplicate(record, options = {}) {
    return this.findIdentityConflict(record, options)?.paper || null
  }

  insertPaper(record) {
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
    return this.getPaper(paperId)
  }

  createPaper(record) {
    const conflict = this.findIdentityConflict(record)
    if (conflict) return { conflict, paper: null }
    return { conflict: null, paper: this.insertPaper(record) }
  }

  updatePaper(paperId, record) {
    if (!this.getPaper(paperId)) return { conflict: null, paper: null }
    const conflict = this.findIdentityConflict(record, { excludePaperId: paperId })
    if (conflict) return { conflict, paper: null }
    const now = new Date().toISOString()
    this.db.prepare(`
      UPDATE papers SET
        title = ?, normalized_title = ?, conference = ?, year = ?, abstract = ?, keywords_json = ?,
        original_url = ?, canonical_url = ?, source_name = ?, source_record_id = ?, doi = ?, authors_json = ?,
        data_status = ?, missing_fields_json = ?, retrieval_error = ?, retrieved_at = ?, updated_at = ?
      WHERE paper_id = ?
    `).run(
      record.title, record.normalized_title, record.conference, record.year,
      record.abstract, JSON.stringify(record.keywords || []), record.original_url, record.canonical_url,
      record.source_name, record.source_record_id, record.doi, JSON.stringify(record.authors || []),
      record.data_status, JSON.stringify(record.missing_fields || []), record.retrieval_error,
      record.retrieved_at || now, now, paperId
    )
    return { conflict: null, paper: this.getPaper(paperId) }
  }

  deletePaper(paperId) {
    return Number(this.db.prepare('DELETE FROM papers WHERE paper_id = ?').run(paperId).changes) > 0
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
    return { outcome: record.data_status, paper: this.insertPaper(record) }
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
