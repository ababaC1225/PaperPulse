import { Router } from 'express'
import { ValidationError } from '../lib/errors.js'
import { boundedInteger } from '../lib/paperQuery.js'

function searchQuery(value) {
  if (value == null || Array.isArray(value) || typeof value === 'object') {
    throw new ValidationError('Query must be provided once and contain at least two characters')
  }
  const query = String(value).trim()
  if (query.length < 2) throw new ValidationError('Query must contain at least two characters')
  if (query.length > 200) throw new ValidationError('Query must be 200 characters or fewer')
  return query
}

export function createSearchRouter({ repository }) {
  const router = Router()

  router.get('/', (request, response, next) => {
    try {
      response.json(repository.globalSearch({
        query: searchQuery(request.query.q),
        limit: boundedInteger(request.query.limit, 5, 1, 20, 'Limit')
      }))
    } catch (error) { next(error) }
  })

  return router
}
