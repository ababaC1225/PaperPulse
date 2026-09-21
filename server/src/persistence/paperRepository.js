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

export const HOT_TOPIC_SORTS = Object.freeze({
  count: 'paper_count DESC, topic COLLATE NOCASE ASC',
  share: 'share_percent DESC, paper_count DESC, topic COLLATE NOCASE ASC',
  growth: 'growth_percent IS NULL ASC, growth_percent DESC, paper_count DESC, topic COLLATE NOCASE ASC'
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

function eligiblePaperScope({ conference = null, year = null } = {}, table = 'papers') {
  const scope = paperScope({ conference, year }, table)
  const prefix = table ? `${table}.` : ''
  return {
    clauses: [
      ...scope.clauses,
      `${prefix}data_status <> 'fetch_failed'`,
      `${prefix}abstract IS NOT NULL`,
      `length(trim(${prefix}abstract)) > 0`,
      `EXISTS (
        SELECT 1
        FROM json_each(CASE WHEN json_valid(${prefix}keywords_json) THEN ${prefix}keywords_json ELSE '[]' END) AS eligible_keyword
        WHERE eligible_keyword.type = 'text'
          AND length(trim(CAST(eligible_keyword.value AS TEXT))) > 0
      )`
    ],
    params: scope.params
  }
}

function trendEligibleScope({ conferences, startYear, endYear }, table = 'papers') {
  const scope = eligiblePaperScope({}, table)
  const prefix = table ? `${table}.` : ''
  const conferencePlaceholders = conferences.map(() => '?').join(', ')
  return {
    clauses: [
      ...scope.clauses,
      `${prefix}conference IN (${conferencePlaceholders})`,
      `${prefix}year BETWEEN ? AND ?`
    ],
    params: [...conferences, startYear, endYear]
  }
}

function percentageChange(value, previousValue) {
  if (previousValue === 0) return null
  return Number((((value - previousValue) / previousValue) * 100).toFixed(1))
}

function compareTopics(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
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
    const scope = eligiblePaperScope({ conference, year }, 'papers')
    const clauses = [
      ...scope.clauses,
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

  countEligiblePapers({ conference = null, year = null } = {}) {
    const scope = eligiblePaperScope({ conference, year })
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM papers
      WHERE ${scope.clauses.join(' AND ')}
    `).get(...scope.params)
    return Number(row.count)
  }

  listHotTopics({
    conference = null, year = null, query = '', sort = 'count', limit = 10
  } = {}) {
    const currentScope = eligiblePaperScope({ conference, year }, 'papers')
    const previousYear = year ? year - 1 : null
    const previousScope = previousYear
      ? eligiblePaperScope({ conference, year: previousYear }, 'papers')
      : { clauses: ['0'], params: [] }
    const eligiblePaperTotal = this.countEligiblePapers({ conference, year })
    const normalizedQuery = normalizeTitle(query)
    const topicFilter = normalizedQuery
      ? "WHERE topic LIKE ? ESCAPE '\\'"
      : ''
    const topicFilterParams = normalizedQuery ? [containsPattern(normalizedQuery)] : []
    const orderBy = HOT_TOPIC_SORTS[sort] || HOT_TOPIC_SORTS.count

    const rows = this.db.prepare(`
      WITH current_topics AS (
        SELECT DISTINCT
          papers.paper_id,
          lower(trim(CAST(keyword.value AS TEXT))) AS topic
        FROM papers
        JOIN json_each(
          CASE WHEN json_valid(papers.keywords_json) THEN papers.keywords_json ELSE '[]' END
        ) AS keyword
        WHERE ${currentScope.clauses.join(' AND ')}
          AND keyword.type = 'text'
          AND length(trim(CAST(keyword.value AS TEXT))) > 0
      ),
      current_counts AS (
        SELECT topic, COUNT(*) AS paper_count
        FROM current_topics
        ${topicFilter}
        GROUP BY topic
      ),
      previous_topics AS (
        SELECT DISTINCT
          papers.paper_id,
          lower(trim(CAST(keyword.value AS TEXT))) AS topic
        FROM papers
        JOIN json_each(
          CASE WHEN json_valid(papers.keywords_json) THEN papers.keywords_json ELSE '[]' END
        ) AS keyword
        WHERE ${previousScope.clauses.join(' AND ')}
          AND keyword.type = 'text'
          AND length(trim(CAST(keyword.value AS TEXT))) > 0
      ),
      previous_counts AS (
        SELECT topic, COUNT(*) AS paper_count
        FROM previous_topics
        GROUP BY topic
      ),
      topic_metrics AS (
        SELECT
          current_counts.topic,
          current_counts.paper_count,
          CASE
            WHEN ? = 0 THEN 0
            ELSE round(current_counts.paper_count * 100.0 / ?, 1)
          END AS share_percent,
          COALESCE(previous_counts.paper_count, 0) AS previous_paper_count,
          CASE
            WHEN ? = 0 OR COALESCE(previous_counts.paper_count, 0) = 0 THEN NULL
            ELSE round(
              (current_counts.paper_count - previous_counts.paper_count) * 100.0
              / previous_counts.paper_count,
              1
            )
          END AS growth_percent
        FROM current_counts
        LEFT JOIN previous_counts ON previous_counts.topic = current_counts.topic
      )
      SELECT topic, paper_count, share_percent, previous_paper_count, growth_percent
      FROM topic_metrics
      ORDER BY ${orderBy}
      LIMIT ?
    `).all(
      ...currentScope.params,
      ...topicFilterParams,
      ...previousScope.params,
      eligiblePaperTotal,
      eligiblePaperTotal,
      previousYear ? 1 : 0,
      limit
    )

    return {
      scope: { conference, year },
      methodology: {
        unit: 'distinct eligible papers containing a normalized keyword',
        eligible_paper_total: eligiblePaperTotal,
        growth_baseline_year: previousYear,
        causality_warning: 'Keyword co-occurrence and frequency do not imply research quality or causality.'
      },
      items: rows.map((row, index) => ({
        rank: index + 1,
        topic: row.topic,
        paper_count: Number(row.paper_count),
        share_percent: Number(row.share_percent),
        previous_paper_count: previousYear ? Number(row.previous_paper_count) : null,
        growth_percent: row.growth_percent == null ? null : Number(row.growth_percent)
      }))
    }
  }

  listEligibleTrendYears({ conferences, limit = 5 } = {}) {
    const scope = eligiblePaperScope({}, 'papers')
    const conferencePlaceholders = conferences.map(() => '?').join(', ')
    return this.db.prepare(`
      SELECT DISTINCT papers.year
      FROM papers
      WHERE ${scope.clauses.join(' AND ')}
        AND papers.conference IN (${conferencePlaceholders})
        AND papers.year IS NOT NULL
      ORDER BY papers.year DESC
      LIMIT ?
    `).all(...conferences, limit).map((row) => Number(row.year))
  }

  listTopTrendTopics({ conferences, startYear, endYear, limit = 4 } = {}) {
    const scope = trendEligibleScope({ conferences, startYear, endYear }, 'papers')
    return this.db.prepare(`
      WITH eligible_topics AS (
        SELECT DISTINCT
          papers.paper_id,
          lower(trim(CAST(keyword.value AS TEXT))) AS topic
        FROM papers
        JOIN json_each(
          CASE WHEN json_valid(papers.keywords_json) THEN papers.keywords_json ELSE '[]' END
        ) AS keyword
        WHERE ${scope.clauses.join(' AND ')}
          AND keyword.type = 'text'
          AND length(trim(CAST(keyword.value AS TEXT))) > 0
      )
      SELECT topic, COUNT(*) AS paper_count
      FROM eligible_topics
      GROUP BY topic
      ORDER BY paper_count DESC, topic COLLATE NOCASE ASC
      LIMIT ?
    `).all(...scope.params, limit).map((row) => row.topic)
  }

  getTopicTrends({ topics, conferences, startYear, endYear, metric = 'share' } = {}) {
    const scope = trendEligibleScope({ conferences, startYear, endYear }, 'papers')
    const totalRows = this.db.prepare(`
      SELECT papers.conference, papers.year, COUNT(*) AS eligible_paper_total
      FROM papers
      WHERE ${scope.clauses.join(' AND ')}
      GROUP BY papers.conference, papers.year
    `).all(...scope.params)

    const topicPlaceholders = topics.map(() => '?').join(', ')
    const topicRows = topics.length
      ? this.db.prepare(`
        WITH eligible_topics AS (
          SELECT DISTINCT
            papers.paper_id,
            papers.conference,
            papers.year,
            lower(trim(CAST(keyword.value AS TEXT))) AS topic
          FROM papers
          JOIN json_each(
            CASE WHEN json_valid(papers.keywords_json) THEN papers.keywords_json ELSE '[]' END
          ) AS keyword
          WHERE ${scope.clauses.join(' AND ')}
            AND keyword.type = 'text'
            AND lower(trim(CAST(keyword.value AS TEXT))) IN (${topicPlaceholders})
        )
        SELECT topic, conference, year, COUNT(*) AS paper_count
        FROM eligible_topics
        GROUP BY topic, conference, year
      `).all(...scope.params, ...topics)
      : []

    const sourceRows = this.db.prepare(`
      SELECT DISTINCT papers.source_name
      FROM papers
      WHERE ${scope.clauses.join(' AND ')}
        AND papers.source_name IS NOT NULL
        AND length(trim(papers.source_name)) > 0
      ORDER BY papers.source_name COLLATE NOCASE ASC
    `).all(...scope.params)
    const timestampRow = this.db.prepare(`
      SELECT MAX(
        CASE
          WHEN COALESCE(papers.updated_at, '') >= COALESCE(papers.retrieved_at, '')
            THEN papers.updated_at
          ELSE papers.retrieved_at
        END
      ) AS latest_updated_at
      FROM papers
      WHERE ${scope.clauses.join(' AND ')}
    `).get(...scope.params)

    const totals = new Map(totalRows.map((row) => [
      `${row.conference}\u0000${row.year}`,
      Number(row.eligible_paper_total)
    ]))
    const counts = new Map(topicRows.map((row) => [
      `${row.topic}\u0000${row.conference}\u0000${row.year}`,
      Number(row.paper_count)
    ]))
    const knownTopicSet = new Set(topicRows.map((row) => row.topic))
    const knownTopics = topics.filter((topic) => knownTopicSet.has(topic))
    const unknownTopics = topics.filter((topic) => !knownTopicSet.has(topic))
    const years = Array.from(
      { length: endYear - startYear + 1 },
      (_unused, index) => startYear + index
    )

    const series = knownTopics.flatMap((topic) => conferences.map((conference) => ({
      topic,
      conference,
      points: years.map((year) => {
        const eligiblePaperTotal = totals.get(`${conference}\u0000${year}`) || 0
        const paperCount = counts.get(`${topic}\u0000${conference}\u0000${year}`) || 0
        return {
          year,
          paper_count: paperCount,
          eligible_paper_total: eligiblePaperTotal,
          share_percent: eligiblePaperTotal
            ? Number(((paperCount / eligiblePaperTotal) * 100).toFixed(1))
            : null,
          has_data: eligiblePaperTotal > 0
        }
      })
    })))

    const validPoints = series.flatMap((entry) => entry.points
      .filter((point) => point.has_data)
      .map((point) => ({ topic: entry.topic, conference: entry.conference, ...point })))
    const valueFor = (point) => metric === 'count' ? point.paper_count : point.share_percent
    const peak = validPoints.length
      ? [...validPoints].sort((left, right) => (
        valueFor(right) - valueFor(left)
        || right.year - left.year
        || compareTopics(left.conference, right.conference)
        || compareTopics(left.topic, right.topic)
      ))[0]
      : null

    return {
      scope: {
        topics,
        conferences,
        start_year: startYear,
        end_year: endYear,
        metric
      },
      years,
      series,
      unknown_topics: unknownTopics,
      summary: {
        peak: peak ? {
          topic: peak.topic,
          conference: peak.conference,
          year: peak.year,
          paper_count: peak.paper_count,
          share_percent: peak.share_percent
        } : null,
        latest_year_with_data: validPoints.length
          ? Math.max(...validPoints.map((point) => point.year))
          : null
      },
      data_context: {
        source_names: sourceRows.map((row) => row.source_name),
        latest_updated_at: timestampRow.latest_updated_at || null
      },
      methodology: {
        paper_unit: 'distinct eligible papers containing an exact normalized keyword',
        share_formula: 'paper_count / eligible_paper_total * 100',
        missing_data_rule: 'A conference-year with no eligible papers is unavailable, not zero share.',
        warning: 'Frequency and normalized share are descriptive signals, not measures of academic quality or causality.'
      }
    }
  }

  getKeywordNetwork({
    conference = null,
    year = null,
    maxNodes = 20,
    minNodeCount = 1,
    minEdgeCount = 1,
    maxEdges = 100,
    focus = null
  } = {}) {
    const scope = eligiblePaperScope({ conference, year }, 'papers')
    const eligiblePaperTotal = this.countEligiblePapers({ conference, year })
    const topicRowsSql = `
      WITH eligible_topics AS (
        SELECT DISTINCT
          papers.paper_id,
          lower(trim(CAST(keyword.value AS TEXT))) AS topic
        FROM papers
        JOIN json_each(
          CASE WHEN json_valid(papers.keywords_json) THEN papers.keywords_json ELSE '[]' END
        ) AS keyword
        WHERE ${scope.clauses.join(' AND ')}
          AND keyword.type = 'text'
          AND length(trim(CAST(keyword.value AS TEXT))) > 0
      )
    `
    const nodeRows = this.db.prepare(`${topicRowsSql}
      SELECT topic, COUNT(*) AS paper_count
      FROM eligible_topics
      GROUP BY topic
      ORDER BY paper_count DESC, topic COLLATE NOCASE ASC
    `).all(...scope.params).map((row) => ({
      topic: row.topic,
      paper_count: Number(row.paper_count)
    }))
    const nodeCountByTopic = new Map(nodeRows.map((node) => [node.topic, node.paper_count]))

    if (focus && !nodeCountByTopic.has(focus)) return null

    const queryPairs = ({ selectedTopics = null, focusTopic = null } = {}) => {
      const pairClauses = []
      const pairParams = []
      if (selectedTopics) {
        if (selectedTopics.length < 2) return []
        const placeholders = selectedTopics.map(() => '?').join(', ')
        pairClauses.push(`source_topic.topic IN (${placeholders})`)
        pairClauses.push(`target_topic.topic IN (${placeholders})`)
        pairParams.push(...selectedTopics, ...selectedTopics)
      }
      if (focusTopic) {
        pairClauses.push('(source_topic.topic = ? OR target_topic.topic = ?)')
        pairParams.push(focusTopic, focusTopic)
      }
      const pairWhere = pairClauses.length ? `WHERE ${pairClauses.join(' AND ')}` : ''
      return this.db.prepare(`${topicRowsSql}
        SELECT
          source_topic.topic AS source,
          target_topic.topic AS target,
          COUNT(*) AS cooccurrence_count
        FROM eligible_topics AS source_topic
        JOIN eligible_topics AS target_topic
          ON target_topic.paper_id = source_topic.paper_id
          AND source_topic.topic < target_topic.topic
        ${pairWhere}
        GROUP BY source_topic.topic, target_topic.topic
        HAVING COUNT(*) >= ?
        ORDER BY cooccurrence_count DESC, source COLLATE NOCASE ASC, target COLLATE NOCASE ASC
      `).all(...scope.params, ...pairParams, minEdgeCount).map((row) => {
        const cooccurrenceCount = Number(row.cooccurrence_count)
        const unionCount = nodeCountByTopic.get(row.source) + nodeCountByTopic.get(row.target) - cooccurrenceCount
        return {
          source: row.source,
          target: row.target,
          cooccurrence_count: cooccurrenceCount,
          jaccard_similarity: unionCount ? Number((cooccurrenceCount / unionCount).toFixed(4)) : 0
        }
      })
    }

    let selectedNodes
    if (focus) {
      const connectedNodes = queryPairs({ focusTopic: focus })
        .map((link) => {
          const topic = link.source === focus ? link.target : link.source
          return { topic, link, paper_count: nodeCountByTopic.get(topic) }
        })
        .filter((neighbor) => neighbor.paper_count >= minNodeCount)
        .sort((left, right) => (
          right.link.cooccurrence_count - left.link.cooccurrence_count
          || right.link.jaccard_similarity - left.link.jaccard_similarity
          || right.paper_count - left.paper_count
          || compareTopics(left.topic, right.topic)
        ))
        .slice(0, Math.max(0, maxNodes - 1))
      selectedNodes = [
        { topic: focus, paper_count: nodeCountByTopic.get(focus) },
        ...connectedNodes.map(({ topic, paper_count: paperCount }) => ({ topic, paper_count: paperCount }))
      ]
    } else {
      selectedNodes = nodeRows
        .filter((node) => node.paper_count >= minNodeCount)
        .slice(0, maxNodes)
    }

    const links = queryPairs({ selectedTopics: selectedNodes.map((node) => node.topic) })
      .sort((left, right) => (
        right.cooccurrence_count - left.cooccurrence_count
        || right.jaccard_similarity - left.jaccard_similarity
        || compareTopics(left.source, right.source)
        || compareTopics(left.target, right.target)
      ))
      .slice(0, maxEdges)

    const connections = new Map(selectedNodes.map((node) => [node.topic, { degree: 0, weightedDegree: 0 }]))
    for (const link of links) {
      const source = connections.get(link.source)
      const target = connections.get(link.target)
      source.degree += 1
      source.weightedDegree += link.cooccurrence_count
      target.degree += 1
      target.weightedDegree += link.cooccurrence_count
    }

    return {
      scope: { conference, year, focus },
      methodology: {
        eligible_paper_total: eligiblePaperTotal,
        node_unit: 'distinct eligible papers containing a normalized keyword',
        edge_unit: 'distinct eligible papers containing both normalized keywords',
        similarity: 'Jaccard similarity',
        causality_warning: 'Keyword co-occurrence does not imply academic quality, semantic equivalence, importance, or causality.'
      },
      nodes: selectedNodes.map((node) => ({
        id: node.topic,
        topic: node.topic,
        paper_count: node.paper_count,
        share_percent: eligiblePaperTotal
          ? Number(((node.paper_count / eligiblePaperTotal) * 100).toFixed(1))
          : 0,
        degree: connections.get(node.topic).degree,
        weighted_degree: connections.get(node.topic).weightedDegree,
        focused: node.topic === focus
      })),
      links
    }
  }

  getTopicDetail({ topic, conference = null, year = null, paperLimit = 10 } = {}) {
    const currentScope = eligiblePaperScope({ conference, year }, 'papers')
    const topicCount = Number(this.db.prepare(`
      SELECT COUNT(DISTINCT papers.paper_id) AS count
      FROM papers
      JOIN json_each(
        CASE WHEN json_valid(papers.keywords_json) THEN papers.keywords_json ELSE '[]' END
      ) AS keyword
      WHERE ${currentScope.clauses.join(' AND ')}
        AND keyword.type = 'text'
        AND lower(trim(CAST(keyword.value AS TEXT))) = ?
    `).get(...currentScope.params, topic).count)

    if (topicCount === 0) return null

    const eligiblePaperTotal = this.countEligiblePapers({ conference, year })
    const previousYear = year ? year - 1 : null
    let previousPaperCount = null
    if (previousYear) {
      const previousScope = eligiblePaperScope({ conference, year: previousYear }, 'papers')
      previousPaperCount = Number(this.db.prepare(`
        SELECT COUNT(DISTINCT papers.paper_id) AS count
        FROM papers
        JOIN json_each(
          CASE WHEN json_valid(papers.keywords_json) THEN papers.keywords_json ELSE '[]' END
        ) AS keyword
        WHERE ${previousScope.clauses.join(' AND ')}
          AND keyword.type = 'text'
          AND lower(trim(CAST(keyword.value AS TEXT))) = ?
      `).get(...previousScope.params, topic).count)
    }

    const trendScope = eligiblePaperScope({ conference, year: null }, 'papers')
    const trend = this.db.prepare(`
      WITH eligible AS (
        SELECT papers.paper_id, papers.year, papers.keywords_json
        FROM papers
        WHERE ${trendScope.clauses.join(' AND ')}
          AND papers.year IS NOT NULL
      ),
      yearly_totals AS (
        SELECT year, COUNT(*) AS eligible_paper_total
        FROM eligible
        GROUP BY year
      ),
      topic_counts AS (
        SELECT eligible.year, COUNT(DISTINCT eligible.paper_id) AS paper_count
        FROM eligible
        JOIN json_each(
          CASE WHEN json_valid(eligible.keywords_json) THEN eligible.keywords_json ELSE '[]' END
        ) AS keyword
        WHERE keyword.type = 'text'
          AND lower(trim(CAST(keyword.value AS TEXT))) = ?
        GROUP BY eligible.year
      )
      SELECT
        yearly_totals.year,
        COALESCE(topic_counts.paper_count, 0) AS paper_count,
        yearly_totals.eligible_paper_total,
        round(
          COALESCE(topic_counts.paper_count, 0) * 100.0 / yearly_totals.eligible_paper_total,
          1
        ) AS share_percent
      FROM yearly_totals
      LEFT JOIN topic_counts ON topic_counts.year = yearly_totals.year
      ORDER BY yearly_totals.year ASC
    `).all(...trendScope.params, topic).map((row) => ({
      year: Number(row.year),
      paper_count: Number(row.paper_count),
      eligible_paper_total: Number(row.eligible_paper_total),
      share_percent: Number(row.share_percent)
    }))

    const relatedScope = eligiblePaperScope({ conference, year }, 'papers')
    const relatedPapers = this.db.prepare(`
      SELECT paper_id, title, authors_json, conference, year, updated_at
      FROM papers
      WHERE ${relatedScope.clauses.join(' AND ')}
        AND EXISTS (
          SELECT 1
          FROM json_each(
            CASE WHEN json_valid(papers.keywords_json) THEN papers.keywords_json ELSE '[]' END
          ) AS topic_keyword
          WHERE topic_keyword.type = 'text'
            AND lower(trim(CAST(topic_keyword.value AS TEXT))) = ?
        )
      ORDER BY year IS NULL ASC, year DESC, updated_at DESC, title COLLATE NOCASE ASC, paper_id ASC
      LIMIT ?
    `).all(...relatedScope.params, topic, paperLimit).map((row) => ({
      paper_id: row.paper_id,
      title: row.title,
      authors: json(row.authors_json),
      conference: row.conference,
      year: row.year == null ? null : Number(row.year),
      updated_at: row.updated_at
    }))

    return {
      topic,
      scope: { conference, year },
      paper_count: topicCount,
      share_percent: eligiblePaperTotal ? Number(((topicCount / eligiblePaperTotal) * 100).toFixed(1)) : 0,
      previous_paper_count: previousPaperCount,
      growth_percent: previousPaperCount == null ? null : percentageChange(topicCount, previousPaperCount),
      trend,
      trend_methodology: {
        years: 'ascending years with at least one eligible paper in the selected conference scope',
        missing_years: 'years without eligible papers are omitted; available years include a zero topic count'
      },
      related_papers: relatedPapers
    }
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
