import { Router } from 'express'
import { getOverviewStats } from '../controllers/overviewController.js'

const router = Router()

router.get('/stats', getOverviewStats)

export default router
