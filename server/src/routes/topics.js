import { Router } from 'express'
import {
  createGetHotTopics,
  createGetTopicDetail,
  getKeywordNetwork
} from '../controllers/topicsController.js'

export function createTopicsRouter(context) {
  const router = Router()

  router.get('/hot', createGetHotTopics(context))
  router.get('/network', getKeywordNetwork)
  router.get('/:topic', createGetTopicDetail(context))

  return router
}
