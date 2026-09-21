import express from 'express'
import cors from 'cors'
import { createOverviewRouter } from './routes/overview.js'
import topicsRouter from './routes/topics.js'
import { createPapersRouter } from './routes/papers.js'
import { createImportsRouter } from './routes/imports.js'
import { AppError } from './lib/errors.js'

export function createApp(context) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors())
  app.use(express.text({ type: ['text/plain', 'text/csv'], limit: '2mb' }))
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'paperpulse-server', time: new Date().toISOString() })
  })
  app.use('/api/overview', createOverviewRouter(context))
  app.use('/api/topics', topicsRouter)
  app.use('/api/papers', createPapersRouter(context))
  app.use('/api/imports', createImportsRouter(context))

  app.use((request, response) => {
    response.status(404).json({ error: { code: 'not_found', message: `Route not found: ${request.method} ${request.path}` } })
  })
  app.use((error, request, response, _next) => {
    const known = error instanceof AppError
    const status = known ? error.status : error?.type === 'entity.parse.failed' ? 400 : 500
    const code = known ? error.code : status === 400 ? 'invalid_json' : 'internal_error'
    context.logger.error('api_error', {
      method: request.method,
      path: request.path,
      status,
      code,
      error: error.message
    })
    response.status(status).json({
      error: {
        code,
        message: known || status === 400 ? error.message : 'An internal server error occurred',
        details: known ? error.details : null,
        retryable: known ? error.retryable : false
      }
    })
  })
  return app
}
