import { normalizeKeywords } from '../domain/cleaning.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import { boundedInteger, optionalConference, optionalYear } from '../lib/paperQuery.js'
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

export function getKeywordNetwork(_request, response) {
  response.json({
    nodes: [],
    links: [],
    note: 'Keyword network analysis is not implemented in this milestone.'
  })
}
