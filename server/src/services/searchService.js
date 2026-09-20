import { cleanPaperRecord, normalizeTitle } from '../domain/cleaning.js'
import { mergeAndRankCandidates } from '../domain/matching.js'
import { GoneError, NotFoundError, SourceRequestError, ValidationError } from '../lib/errors.js'

export class SearchService {
  constructor({ adapters, repository, config, logger }) {
    this.adapters = adapters
    this.repository = repository
    this.config = config
    this.logger = logger.child({ component: 'search-service' })
    this.cleaningOptions = {
      generalStopwords: config.generalStopwords,
      cvStopwords: config.cvStopwords,
      synonyms: config.synonyms
    }
  }

  async search(title) {
    const query = String(title ?? '').trim()
    const normalizedQuery = normalizeTitle(query)
    if (!normalizedQuery) throw new ValidationError('A paper title is required')
    if (query.length > 500) throw new ValidationError('Paper title must be 500 characters or fewer')
    if (!this.adapters.length) throw new ValidationError('No paper sources are enabled')

    const settled = await Promise.allSettled(this.adapters.map(async (adapter) => {
      const records = await adapter.search(query, { limit: this.config.maxSearchResults })
      return records.map((record) => cleanPaperRecord(record, this.cleaningOptions))
    }))
    const candidates = []
    const sourceErrors = []
    settled.forEach((result, index) => {
      const source = this.adapters[index].name
      if (result.status === 'fulfilled') {
        candidates.push(...result.value)
      } else {
        const error = result.reason
        sourceErrors.push({
          source,
          code: error?.code || 'source_search_failed',
          message: error?.message || 'Source search failed',
          retryable: error?.retryable !== false
        })
        this.logger.error('source_search_failed', { source, code: error?.code, error: error?.message })
      }
    })

    const ranked = mergeAndRankCandidates(query, candidates, this.config.maxSearchResults)
    this.repository.saveCandidates(ranked, this.config.candidateTtlSeconds)
    this.logger.info('paper_search_completed', {
      normalized_query: normalizedQuery,
      candidate_count: ranked.length,
      source_error_count: sourceErrors.length
    })
    return { query, normalized_query: normalizedQuery, candidates: ranked, source_errors: sourceErrors }
  }

  async confirm(candidateId) {
    const id = String(candidateId ?? '').trim()
    if (!id) throw new ValidationError('Candidate ID is required')
    const candidate = this.repository.getCandidate(id)
    if (!candidate) throw new NotFoundError('Search candidate not found; search again before confirming')
    if (candidate.expired) throw new GoneError('Search candidate has expired; search again before confirming')
    delete candidate.expired

    const adapter = this.adapters.find((entry) => entry.name === candidate.source_name)
    let sourceRecord = candidate
    let retrievalError = null
    if (adapter) {
      try {
        sourceRecord = await adapter.fetchDetails(candidate)
      } catch (error) {
        retrievalError = error?.message || 'Failed to retrieve source details'
        this.logger.error('paper_detail_fetch_failed', {
          source: candidate.source_name,
          candidate_id: id,
          code: error?.code,
          error: retrievalError
        })
      }
    }

    const record = cleanPaperRecord({ ...candidate, ...sourceRecord, retrieval_error: retrievalError }, this.cleaningOptions)
    if (!record.title || !record.normalized_title) throw new SourceRequestError('Confirmed source record has no usable title', {
      source: candidate.source_name,
      code: 'source_parse_failed',
      retryable: false
    })
    let saved
    try {
      saved = this.repository.savePaper(record)
    } catch (error) {
      this.logger.error('paper_persistence_failed', { candidate_id: id, error: error.message })
      throw error
    }
    if (saved.outcome === 'duplicate') {
      this.logger.info('paper_duplicate_detected', { candidate_id: id, paper_id: saved.paper.paper_id })
    } else if (saved.paper.missing_fields.length) {
      this.logger.warn('paper_missing_fields', { paper_id: saved.paper.paper_id, fields: saved.paper.missing_fields })
    }
    return saved
  }
}
