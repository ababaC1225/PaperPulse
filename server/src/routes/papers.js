import { Router } from 'express'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import { boundedInteger, optionalConference, optionalYear } from '../lib/paperQuery.js'
import { PAPER_SORTS } from '../persistence/paperRepository.js'

function boundedText(value, { label, maximum = 500, lowercase = false } = {}) {
  if (value == null) return ''
  const text = String(value).trim()
  if (text.length > maximum) throw new ValidationError(`${label} must be ${maximum} characters or fewer`)
  return lowercase ? text.toLocaleLowerCase('en-US') : text
}

export function createPapersRouter({ repository, searchService, importService, paperCrudService }) {
  const router = Router()

  router.post('/search', async (request, response, next) => {
    try { response.json(await searchService.search(request.body?.title)) } catch (error) { next(error) }
  })

  router.post('/search/:candidateId/confirm', async (request, response, next) => {
    try {
      const result = await searchService.confirm(request.params.candidateId)
      response.status(result.outcome === 'duplicate' ? 200 : 201).json(result)
    } catch (error) { next(error) }
  })

  router.get('/facets', (_request, response) => response.json(repository.getPaperFacets()))

  router.get('/recent', (request, response, next) => {
    try {
      response.json(repository.listRecentPapers({
        conference: optionalConference(request.query.conference),
        year: optionalYear(request.query.year),
        limit: boundedInteger(request.query.limit, 4, 1, 20, 'Limit')
      }))
    } catch (error) { next(error) }
  })

  router.get('/', (request, response, next) => {
    try {
      const status = request.query.data_status || request.query.status || null
      if (status && !['complete', 'missing_fields', 'fetch_failed'].includes(status)) {
        throw new ValidationError('Status must be complete, missing_fields, or fetch_failed')
      }
      const sort = String(request.query.sort || 'updated_desc')
      if (!Object.hasOwn(PAPER_SORTS, sort)) {
        throw new ValidationError(`Sort must be one of: ${Object.keys(PAPER_SORTS).join(', ')}`)
      }
      response.json(repository.listPapers({
        query: boundedText(request.query.query, { label: 'Query' }),
        conference: optionalConference(request.query.conference),
        year: optionalYear(request.query.year),
        dataStatus: status,
        sourceName: boundedText(request.query.source_name, { label: 'Source name', maximum: 100, lowercase: true }) || null,
        sort,
        limit: boundedInteger(request.query.limit, 20, 1, 200, 'Limit'),
        offset: boundedInteger(request.query.offset, 0, 0, 1_000_000, 'Offset')
      }))
    } catch (error) { next(error) }
  })

  router.post('/import', (request, response, next) => {
    try {
      const job = importService.create(request.body, request.get('content-type') || 'application/json')
      response.status(202).json(job)
    } catch (error) { next(error) }
  })

  router.post('/', (request, response, next) => {
    try { response.status(201).json(paperCrudService.create(request.body)) } catch (error) { next(error) }
  })

  router.patch('/:paperId', (request, response, next) => {
    try { response.json(paperCrudService.update(request.params.paperId, request.body)) } catch (error) { next(error) }
  })

  router.delete('/:paperId', (request, response, next) => {
    try {
      paperCrudService.delete(request.params.paperId)
      response.status(204).end()
    } catch (error) { next(error) }
  })

  router.get('/:paperId/context', (request, response, next) => {
    try {
      const context = repository.getPaperContext(request.params.paperId)
      if (!context) throw new NotFoundError('Paper not found', { paper_id: request.params.paperId })
      response.json(context)
    } catch (error) { next(error) }
  })

  router.get('/:paperId', (request, response, next) => {
    try {
      const paper = repository.getPaper(request.params.paperId)
      if (!paper) throw new NotFoundError('Paper not found', { paper_id: request.params.paperId })
      response.json(paper)
    } catch (error) { next(error) }
  })
  return router
}
