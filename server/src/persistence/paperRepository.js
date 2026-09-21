import crypto from 'node:crypto'
import { analysisEligibility, normalizeTitle } from '../domain/cleaning.js'
import { openDatabase } from './database.js'

export const PAPER_SORTS = Object.freeze({
  updated_desc: 'updated_at DESC, paper_id ASC',
  updated_asc: 'updated_at ASC, paper_id ASC',
  title_asc: 'title COLLATE NOCASE ASC, paper_id ASC',
  title_desc: 'title COLLATE NOCASE DESC, paper_id ASC',
  year_desc: 'year IS NULL ASC, year DESC, title COLLATE NOCASE ASC, paper_id ASC',
  year_asc: 'year IS NULL ASC, year ASC, title COLLATE NOCASE ASC, paper_id ASC'
})

function containsPattern(value) {
  const escaped = String(value).replace(/[\\%_]/gu, (character) => `\\${character}`)
  return `%${escaped}%`
}

function paperScope({ conference = null, year = null } = {}, table = '') {
  const prefix = table ? `${table}.` : ''
  const clauses = []
  const params = []
  if (conference) { clauses.push(`${prefix}conference = ?`); params.push(conference) }
  if (year) { clauses.push(`${prefix}year = ?`); params.push(year) }
  return { clauses, params }
}

function percentageChange(value, previousValue) {
  if (previousValue === 0) return null
  return Number((((value - previousValue) / previousValue) * 100).toFixed(1))
}

function latestPaperTimestamp(row) {
  if (!row) return null
  return row.updated_at >= row.retrieved_at ? row.updated_at : row.retrieved_at
}

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

  listPapers({
    query = '', conference = null, year = null, status = null, dataStatus = null,
    sourceName = null, sort = 'updated_desc', limit = 20, offset = 0
  } = {}) {
    const clauses = []
    const params = []
    const trimmedQuery = String(query).trim()
    if (trimmedQuery) {
      const rawPattern = containsPattern(trimmedQuery)
      const normalizedQuery = normalizeTitle(trimmedQuery)
      const queryClauses = [
        "paper_id LIKE ? ESCAPE '\\'",
        "title LIKE ? ESCAPE '\\'",
        "authors_json LIKE ? ESCAPE '\\'",
        "keywords_json LIKE ? ESCAPE '\\'"
      ]
      params.push(rawPattern, rawPattern, rawPattern, rawPattern)
      if (normalizedQuery) {
        queryClauses.push("normalized_title LIKE ? ESCAPE '\\'")
        params.push(containsPattern(normalizedQuery))
      }
      clauses.push(`(${queryClauses.join(' OR ')})`)
    }
    if (conference) { clauses.push('conference = ?'); params.push(conference) }
    if (year) { clauses.push('year = ?'); params.push(year) }
    const statusFilter = dataStatus || status
    if (statusFilter) { clauses.push('data_status = ?'); params.push(statusFilter) }
    if (sourceName) { clauses.push('source_name = ? COLLATE NOCASE'); params.push(sourceName) }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const orderBy = PAPER_SORTS[sort] || PAPER_SORTS.updated_desc
    const total = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM papers ${where}`).get(...params).count)
    const rows = this.db.prepare(`SELECT * FROM papers ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, limit, offset)
    const page = Math.floor(offset / limit) + 1
    const pageCount = Math.ceil(total / limit)
    return {
      items: rows.map(rowToPaper),
      total,
      limit,
      offset,
      page,
      page_count: pageCount,
      has_previous: offset > 0,
      has_next: offset + limit < total
    }
  }

  countEligibleTopics({ conference = null, year = null } = {}) {
    const scope = paperScope({ conference, year }, 'papers')
    const clauses = [
      ...scope.clauses,
      "papers.data_status <> 'fetch_failed'",
      'papers.abstract IS NOT NULL',
      "length(trim(papers.abstract)) > 0",
      "keyword.type = 'text'",
      "length(trim(CAST(keyword.value AS TEXT))) > 0"
    ]
    const row = this.db.prepare(`
      SELECT COUNT(DISTINCT lower(trim(CAST(keyword.value AS TEXT)))) AS count
      FROM papers
      JOIN json_each(
        CASE WHEN json_valid(papers.keywords_json) THEN papers.keywords_json ELSE '[]' END
      ) AS keyword
      WHERE ${clauses.join(' AND ')}
    `).get(...scope.params)
    return Number(row.count)
  }

  getOverviewStats({ conference = null, year = null, now = new Date(), freshnessHours = 24 } = {}) {
    const scope = paperScope({ conference, year })
    const where = scope.clauses.length ? `WHERE ${scope.clauses.join(' AND ')}` : ''
    const aggregate = this.db.prepare(`
      SELECT
        COUNT(*) AS papers,
        COUNT(DISTINCT conference) AS conferences,
        COALESCE(SUM(CASE WHEN data_status = 'complete' THEN 1 ELSE 0 END), 0) AS complete,
        COALESCE(SUM(CASE WHEN data_status = 'missing_fields' THEN 1 ELSE 0 END), 0) AS missing_fields,
        COALESCE(SUM(CASE WHEN data_status = 'fetch_failed' THEN 1 ELSE 0 END), 0) AS fetch_failed
      FROM papers
      ${where}
    `).get(...scope.params)
    const latestRow = this.db.prepare(`
      SELECT updated_at, retrieved_at
      FROM papers
      ${where}
      ORDER BY
        CASE WHEN updated_at >= retrieved_at THEN updated_at ELSE retrieved_at END DESC,
        paper_id ASC
      LIMIT 1
    `).get(...scope.params)
    const paperCount = Number(aggregate.papers)
    const topicCount = this.countEligibleTopics({ conference, year })
    let previousPaperCount = null
    let previousTopicCount = null
    if (year) {
      const previousScope = paperScope({ conference, year: year - 1 })
      const previousWhere = previousScope.clauses.length ? `WHERE ${previousScope.clauses.join(' AND ')}` : ''
      previousPaperCount = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM papers ${previousWhere}`).get(...previousScope.params).count)
      previousTopicCount = this.countEligibleTopics({ conference, year: year - 1 })
    }
    const lastSyncValue = latestPaperTimestamp(latestRow)
    const lastSyncTime = lastSyncValue ? Date.parse(lastSyncValue) : Number.NaN
    const nowTime = now instanceof Date ? now.getTime() : Date.parse(now)
    const recentThreshold = freshnessHours * 60 * 60 * 1000
    const lastSyncStatus = !lastSyncValue
      ? 'empty'
      : Number.isFinite(lastSyncTime) && Number.isFinite(nowTime) && nowTime - lastSyncTime <= recentThreshold
        ? 'up-to-date'
        : 'stale'

    return {
      scope: { conference, year },
      papers: {
        value: paperCount,
        previous_value: previousPaperCount,
        delta_percent: year ? percentageChange(paperCount, previousPaperCount) : null
      },
      topics: {
        value: topicCount,
        previous_value: previousTopicCount,
        delta_percent: year ? percentageChange(topicCount, previousTopicCount) : null
      },
      conferences: { value: Number(aggregate.conferences) },
      data_quality: {
        complete: Number(aggregate.complete),
        missing_fields: Number(aggregate.missing_fields),
        fetch_failed: Number(aggregate.fetch_failed),
        complete_percent: paperCount ? Number(((Number(aggregate.complete) / paperCount) * 100).toFixed(1)) : 0
      },
      last_sync: { value: lastSyncValue, status: lastSyncStatus }
    }
  }

  getPaperFacets() {
    return {
      conferences: this.db.prepare(`
        SELECT DISTINCT conference FROM papers
        WHERE conference IS NOT NULL
        ORDER BY conference ASC
      `).all().map((row) => row.conference),
      years: this.db.prepare(`
        SELECT DISTINCT year FROM papers
        WHERE year IS NOT NULL
        ORDER BY year DESC
      `).all().map((row) => Number(row.year))
    }
  }

  listRecentPapers({ conference = null, year = null, limit = 4 } = {}) {
    const scope = paperScope({ conference, year })
    const where = scope.clauses.length ? `WHERE ${scope.clauses.join(' AND ')}` : ''
    const rows = this.db.prepare(`
      SELECT paper_id, title, authors_json, conference, year, keywords_json, data_status, updated_at
      FROM papers
      ${where}
      ORDER BY updated_at DESC, title COLLATE NOCASE ASC, paper_id ASC
      LIMIT ?
    `).all(...scope.params, limit)
    return rows.map((row) => ({
      paper_id: row.paper_id,
      title: row.title,
      authors: json(row.authors_json),
      conference: row.conference,
      year: row.year,
      keywords: json(row.keywords_json),
      data_status: row.data_status,
      updated_at: row.updated_at
    }))
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
