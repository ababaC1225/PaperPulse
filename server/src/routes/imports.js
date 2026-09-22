import { Router } from 'express'
import { ValidationError } from '../lib/errors.js'
import { boundedInteger } from '../lib/paperQuery.js'
import { IMPORT_JOB_STATUSES } from '../persistence/paperRepository.js'

function optionalStatus(value) {
  if (value == null) return null
  if (Array.isArray(value) || typeof value === 'object') {
    throw new ValidationError('Status must be provided once')
  }
  const status = String(value).trim().toLocaleLowerCase('en-US')
  if (!status) return null
  if (!IMPORT_JOB_STATUSES.includes(status)) {
    throw new ValidationError(`Status must be one of: ${IMPORT_JOB_STATUSES.join(', ')}`)
  }
  return status
}

export function createImportsRouter({ importService }) {
  const router = Router()
  router.get('/', (request, response, next) => {
    try {
      response.json(importService.list({
        status: optionalStatus(request.query.status),
        limit: boundedInteger(request.query.limit, 20, 1, 100, 'Limit'),
        offset: boundedInteger(request.query.offset, 0, 0, 1_000_000, 'Offset')
      }))
    } catch (error) { next(error) }
  })
  router.post('/', (request, response, next) => {
    try {
      const job = importService.create(request.body, request.get('content-type') || 'application/json')
      response.status(202).json(job)
    } catch (error) { next(error) }
  })
  router.get('/:jobId', (request, response, next) => {
    try { response.json(importService.get(request.params.jobId)) } catch (error) { next(error) }
  })
  router.post('/:jobId/retry', (request, response, next) => {
    try { response.status(202).json(importService.retry(request.params.jobId)) } catch (error) { next(error) }
  })
  return router
}
