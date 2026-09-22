import {
  canonicalizeUrl,
  cleanPaperRecord,
  normalizeKeywords,
  normalizeYear
} from '../domain/cleaning.js'
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js'

const EDITABLE_FIELDS = [
  'title',
  'conference',
  'year',
  'abstract',
  'keywords',
  'authors',
  'original_url',
  'doi'
]

function isTextList(value) {
  return value == null || typeof value === 'string'
    || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
}

function editableValues(input, existing = null) {
  const values = Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, existing?.[field] ?? null]))
  for (const field of EDITABLE_FIELDS) {
    if (Object.hasOwn(input, field)) values[field] = input[field]
  }
  return values
}

function validationFields(values) {
  const fields = {}
  if (typeof values.title !== 'string' || !values.title.trim()) fields.title = 'Title is required.'

  if (typeof values.conference !== 'string' || !['CVPR', 'ICCV', 'ECCV'].includes(values.conference.trim().toUpperCase())) {
    fields.conference = 'Conference must be CVPR, ICCV, or ECCV.'
  }

  if (!normalizeYear(values.year)) fields.year = 'Enter a valid four-digit year.'

  if (values.abstract != null && typeof values.abstract !== 'string') fields.abstract = 'Abstract must be text.'
  if (!isTextList(values.keywords)) fields.keywords = 'Keywords must be text or an array of text values.'
  if (!isTextList(values.authors)) fields.authors = 'Authors must be text or an array of text values.'
  if (values.doi != null && typeof values.doi !== 'string') fields.doi = 'DOI must be text.'

  if (values.original_url != null && typeof values.original_url !== 'string') {
    fields.original_url = 'Original URL must be text.'
  } else if (String(values.original_url || '').trim() && !canonicalizeUrl(values.original_url)) {
    fields.original_url = 'Enter a valid HTTP or HTTPS URL.'
  }
  return fields
}

function isUniqueConstraint(error) {
  return /UNIQUE constraint failed/iu.test(error?.message || '')
}

export class PaperCrudService {
  constructor({ repository, config, logger }) {
    this.repository = repository
    this.logger = logger.child({ component: 'paper-crud-service' })
    this.cleaningOptions = {
      generalStopwords: config.generalStopwords,
      cvStopwords: config.cvStopwords,
      synonyms: config.synonyms
    }
  }

  prepare(input, existing = null, { requireChange = false } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError('Paper must be provided as a JSON object')
    }
    if (requireChange && !EDITABLE_FIELDS.some((field) => Object.hasOwn(input, field))) {
      throw new ValidationError('Provide at least one editable paper field')
    }

    const values = editableValues(input, existing)
    const fields = validationFields(values)
    if (Object.keys(fields).length) throw new ValidationError('Paper validation failed', { fields })

    return cleanPaperRecord({
      ...values,
      keyword_provenance: Object.hasOwn(input, 'keywords')
        && JSON.stringify(normalizeKeywords(values.keywords, this.cleaningOptions)) !== JSON.stringify(existing?.keywords)
        ? { method: 'manual' } : existing?.keyword_provenance,
      source_name: existing?.source_name || 'manual',
      source_record_id: existing?.source_record_id || null,
      retrieval_error: null,
      retrieved_at: existing?.retrieved_at || new Date().toISOString()
    }, this.cleaningOptions)
  }

  duplicateError(conflict) {
    return new ConflictError(`Paper conflicts with existing record ${conflict.paper.paper_id}`, {
      identity: conflict.identity,
      paper_id: conflict.paper.paper_id
    })
  }

  create(input) {
    const record = this.prepare(input)
    try {
      const result = this.repository.createPaper(record)
      if (result.conflict) throw this.duplicateError(result.conflict)
      this.logger.info('paper_created_manually', { paper_id: result.paper.paper_id, data_status: result.paper.data_status })
      return result.paper
    } catch (error) {
      if (error instanceof ConflictError) throw error
      if (isUniqueConstraint(error)) throw new ConflictError('Paper conflicts with an existing record')
      throw error
    }
  }

  update(paperId, input) {
    const existing = this.repository.getPaper(paperId)
    if (!existing) throw new NotFoundError('Paper not found', { paper_id: paperId })
    const record = this.prepare(input, existing, { requireChange: true })
    try {
      const result = this.repository.updatePaper(paperId, record)
      if (result.conflict) throw this.duplicateError(result.conflict)
      if (!result.paper) throw new NotFoundError('Paper not found', { paper_id: paperId })
      this.logger.info('paper_updated_manually', { paper_id: paperId, data_status: result.paper.data_status })
      return result.paper
    } catch (error) {
      if (error instanceof ConflictError || error instanceof NotFoundError) throw error
      if (isUniqueConstraint(error)) throw new ConflictError('Paper conflicts with an existing record')
      throw error
    }
  }

  delete(paperId) {
    const deleted = this.repository.deletePaper(paperId)
    if (!deleted) throw new NotFoundError('Paper not found', { paper_id: paperId })
    this.logger.info('paper_deleted', { paper_id: paperId })
  }
}
