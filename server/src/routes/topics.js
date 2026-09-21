import { Router } from 'express'
import {
  createGetHotTopics,
  createGetKeywordNetwork,
  createGetTopicDetail,
  createGetTopicTrends
} from '../controllers/topicsController.js'

export function createTopicsRouter(context) {
  const router = Router()

  router.get('/hot', createGetHotTopics(context))
  router.get('/network', createGetKeywordNetwork(context))
  router.get('/trends', createGetTopicTrends(context))
  router.get('/:topic', createGetTopicDetail(context))

  return router
}
