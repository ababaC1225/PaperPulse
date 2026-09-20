import { Router } from 'express'
import { canonicalizeConference, normalizeYear } from '../domain/cleaning.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

function boundedInteger(value, fallback, min, max, label) {
  if (value == null || value === '') return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new ValidationError(`${label} must be an integer between ${min} and ${max}`)
  return parsed
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

  router.get('/', (request, response, next) => {
    try {
      const conferenceInput = request.query.conference
      const conference = conferenceInput ? canonicalizeConference(conferenceInput) : null
      if (conferenceInput && !conference) throw new ValidationError('Conference must be CVPR, ICCV, or ECCV')
      const year = request.query.year ? normalizeYear(request.query.year) : null
      if (request.query.year && !year) throw new ValidationError('Year is invalid')
      const status = request.query.status || null
      if (status && !['complete', 'missing_fields', 'fetch_failed'].includes(status)) {
        throw new ValidationError('Status must be complete, missing_fields, or fetch_failed')
      }
      response.json(repository.listPapers({
        query: String(request.query.query || ''),
        conference,
        year,
        status,
        limit: boundedInteger(request.query.limit, 50, 1, 200, 'Limit'),
        offset: boundedInteger(request.query.offset, 0, 0, 1_000_000, 'Offset')
      }))
    } catch (error) { next(error) }
  })

  router.get('/recent', (_request, response) => response.json(repository.listPapers({ limit: 10 }).items))

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

  router.get('/:paperId', (request, response, next) => {
    try {
      const paper = repository.getPaper(request.params.paperId)
      if (!paper) throw new NotFoundError('Paper not found', { paper_id: request.params.paperId })
      response.json(paper)
    } catch (error) { next(error) }
  })
  return router
}
