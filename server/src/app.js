import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { createOverviewRouter } from './routes/overview.js'
import { createTopicsRouter } from './routes/topics.js'
import { createPapersRouter } from './routes/papers.js'
import { createImportsRouter } from './routes/imports.js'
import { createSearchRouter } from './routes/search.js'
import { AppError } from './lib/errors.js'

export function createApp(context) {
  const app = express()
  app.disable('x-powered-by')
  app.set('query parser', 'extended')
  app.use(cors())
  app.use(express.text({ type: ['text/plain', 'text/csv'], limit: '2mb' }))
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'paperpulse-server', time: new Date().toISOString() })
  })
  app.use('/api/overview', createOverviewRouter(context))
  app.use('/api/topics', createTopicsRouter(context))
  app.use('/api/search', createSearchRouter(context))
  app.use('/api/papers', createPapersRouter(context))
  app.use('/api/imports', createImportsRouter(context))

  app.use('/api', (request, response) => {
    response.status(404).json({ error: { code: 'not_found', message: `Route not found: ${request.method} ${request.path}` } })
  })

  if (context.config?.serveClient) {
    const clientDistPath = context.config.clientDistPath
    if (!clientDistPath) throw new Error('Production client bundle path is not configured')
    const indexPath = path.join(clientDistPath, 'index.html')
    if (!fs.existsSync(indexPath)) {
      throw new Error(`Production client bundle not found at ${indexPath}`)
    }
    app.use(express.static(clientDistPath, { index: false }))
    app.get('*', (request, response, next) => {
      if (path.extname(request.path)) return next()
      response.sendFile(indexPath)
    })
  }

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
