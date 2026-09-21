import { Router } from 'express'
import { createGetOverviewStats } from '../controllers/overviewController.js'

export function createOverviewRouter(context) {
  const router = Router()

  router.get('/stats', createGetOverviewStats(context))

  return router
}
