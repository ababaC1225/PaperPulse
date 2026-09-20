import { Router } from 'express'

export function createImportsRouter({ importService }) {
  const router = Router()
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
