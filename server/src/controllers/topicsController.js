import { normalizeKeywords, normalizeYear } from '../domain/cleaning.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import { boundedInteger, minimumInteger, optionalConference, optionalYear } from '../lib/paperQuery.js'
import { HOT_TOPIC_SORTS } from '../persistence/paperRepository.js'

const TREND_CONFERENCES = Object.freeze(['CVPR', 'ICCV', 'ECCV'])
const MAX_TREND_YEARS = 15

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

function repeatedQueryValues(value, label) {
  if (value == null) return []
  const values = Array.isArray(value) ? value : [value]
  if (values.some((entry) => typeof entry === 'object')) {
    throw new ValidationError(`${label} must use repeated query parameters`)
  }
  return values.map((entry) => String(entry).trim())
}

function trendTopics(value) {
  const seen = new Set()
  const topics = []
  for (const input of repeatedQueryValues(value, 'Topic')) {
    const normalized = normalizeKeywords(input)
    if (!input || normalized.length !== 1) {
      throw new ValidationError('Each topic must be one non-empty normalized keyword')
    }
    if (!seen.has(normalized[0])) {
      seen.add(normalized[0])
      topics.push(normalized[0])
    }
  }
  if (topics.length > 5) throw new ValidationError('At most five unique topics may be requested')
  return topics
}

function trendConferences(value) {
  const requested = repeatedQueryValues(value, 'Conference')
  if (!requested.length) return [...TREND_CONFERENCES]
  const selected = new Set()
  for (const input of requested) {
    const conference = input.toLocaleUpperCase('en-US')
    if (!TREND_CONFERENCES.includes(conference)) {
      throw new ValidationError('Conference must be CVPR, ICCV, or ECCV')
    }
    selected.add(conference)
  }
  return TREND_CONFERENCES.filter((conference) => selected.has(conference))
}

function trendMetric(value) {
  const metric = singleQueryValue(value, 'Metric') || 'share'
  if (!['count', 'share'].includes(metric)) {
    throw new ValidationError('Metric must be count or share')
  }
  return metric
}

function derivedYearIsValid(year) {
  return normalizeYear(String(year)) === year
}

function trendYearRange(repository, conferences, startValue, endValue) {
  let startYear = optionalYear(startValue)
  let endYear = optionalYear(endValue)

  if (startYear == null && endYear == null) {
    const representedYears = repository.listEligibleTrendYears({ conferences, limit: 5 })
    if (representedYears.length) {
      endYear = representedYears[0]
      startYear = Math.max(representedYears.at(-1), endYear - (MAX_TREND_YEARS - 1))
    } else {
      endYear = new Date().getUTCFullYear()
      startYear = endYear - 4
    }
  } else if (startYear == null) {
    startYear = endYear - 4
    if (!derivedYearIsValid(startYear)) {
      throw new ValidationError('The derived start year is outside the supported year range')
    }
  } else if (endYear == null) {
    endYear = startYear + 4
    if (!derivedYearIsValid(endYear)) {
      throw new ValidationError('The derived end year is outside the supported year range')
    }
  }

  if (startYear > endYear) throw new ValidationError('Start year must not exceed end year')
  if (endYear - startYear + 1 > MAX_TREND_YEARS) {
    throw new ValidationError(`Trend range must not exceed ${MAX_TREND_YEARS} calendar years`)
  }
  return { startYear, endYear }
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

export function createGetTopicTrends({ repository }) {
  return function getTopicTrends(request, response, next) {
    try {
      const conferences = trendConferences(request.query.conference)
      const { startYear, endYear } = trendYearRange(
        repository,
        conferences,
        request.query.start_year,
        request.query.end_year
      )
      const requestedTopics = trendTopics(request.query.topic)
      const topics = requestedTopics.length
        ? requestedTopics
        : repository.listTopTrendTopics({ conferences, startYear, endYear, limit: 4 })
      response.json(repository.getTopicTrends({
        topics,
        conferences,
        startYear,
        endYear,
        metric: trendMetric(request.query.metric)
      }))
    } catch (error) { next(error) }
  }
}
