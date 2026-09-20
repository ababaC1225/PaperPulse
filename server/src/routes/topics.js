import { Router } from 'express'
import { getHotTopics, getKeywordNetwork } from '../controllers/topicsController.js'

const router = Router()

router.get('/hot', getHotTopics)
router.get('/network', getKeywordNetwork)

export default router
