import { normalizeKeywords } from '../domain/cleaning.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import { boundedInteger, minimumInteger, optionalConference, optionalYear } from '../lib/paperQuery.js'
import { HOT_TOPIC_SORTS } from '../persistence/paperRepository.js'

function singleQueryValue(value, label) {
  if (value == null) return ''
  if (Array.isArray(value) || typeof value === 'object') {
    throw new ValidationError(`${label} must be provided once`)
  }
  return String(value).trim()
}

function topicSort(value) {
  const sort = singleQueryValue(value, 'Sort') || 'count'
  if (!Object.hasOwn(HOT_TOPIC_SORTS, sort)) {
    throw new ValidationError('Sort must be count, share, or growth')
  }
  return sort
}

function topicQuery(value) {
  return singleQueryValue(value, 'Query')
}

function normalizedTopic(value) {
  const input = singleQueryValue(value, 'Topic')
  const topics = normalizeKeywords(input)
  if (!input || topics.length !== 1) {
    throw new ValidationError('Topic must be one non-empty normalized keyword')
  }
  return topics[0]
}

function optionalNormalizedTopic(value) {
  const input = singleQueryValue(value, 'Focus')
  if (!input) return null
  const topics = normalizeKeywords(input)
  if (topics.length !== 1) {
    throw new ValidationError('Focus must be one complete normalized keyword')
  }
  return topics[0]
}

export function createGetHotTopics({ repository }) {
  return function getHotTopics(request, response, next) {
    try {
      response.json(repository.listHotTopics({
        conference: optionalConference(request.query.conference),
        year: optionalYear(request.query.year),
        query: topicQuery(request.query.query),
        sort: topicSort(request.query.sort),
        limit: boundedInteger(request.query.limit, 10, 1, 100, 'Limit')
      }))
    } catch (error) { next(error) }
  }
}

export function createGetTopicDetail({ repository }) {
  return function getTopicDetail(request, response, next) {
    try {
      const topic = normalizedTopic(request.params.topic)
      const detail = repository.getTopicDetail({
        topic,
        conference: optionalConference(request.query.conference),
        year: optionalYear(request.query.year),
        paperLimit: boundedInteger(request.query.paper_limit, 10, 1, 50, 'Paper limit')
      })
      if (!detail) throw new NotFoundError(`Topic not found in the selected scope: ${topic}`)
      response.json(detail)
    } catch (error) { next(error) }
  }
}

export function createGetKeywordNetwork({ repository }) {
  return function getKeywordNetwork(request, response, next) {
    try {
      const focus = optionalNormalizedTopic(request.query.focus)
      const network = repository.getKeywordNetwork({
        conference: optionalConference(request.query.conference),
        year: optionalYear(request.query.year),
        maxNodes: boundedInteger(request.query.max_nodes, 20, 2, 50, 'Maximum nodes'),
        minNodeCount: minimumInteger(request.query.min_node_count, 1, 1, 'Minimum node count'),
        minEdgeCount: minimumInteger(request.query.min_edge_count, 1, 1, 'Minimum edge count'),
        maxEdges: boundedInteger(request.query.max_edges, 100, 1, 300, 'Maximum edges'),
        focus
      })
      if (!network) throw new NotFoundError(`Focus keyword not found in the selected scope: ${focus}`)
      response.json(network)
    } catch (error) { next(error) }
  }
}
