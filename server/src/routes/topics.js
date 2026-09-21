import { Router } from 'express'
import {
  createGetHotTopics,
  createGetKeywordNetwork,
  createGetTopicDetail
} from '../controllers/topicsController.js'

export function createTopicsRouter(context) {
  const router = Router()

  router.get('/hot', createGetHotTopics(context))
  router.get('/network', createGetKeywordNetwork(context))
  router.get('/:topic', createGetTopicDetail(context))

  return router
}
