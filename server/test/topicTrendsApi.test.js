import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { createContext } from '../src/context.js'
import { cleanPaperRecord } from '../src/domain/cleaning.js'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { testConfig, testLogger } from '../test-support/helpers.js'

function paper(overrides) {
  const key = overrides.source_record_id
  return cleanPaperRecord({
    title: `Trend fixture ${key}`,
    conference: 'CVPR',
    year: 2022,
    abstract: 'A complete trend-analysis abstract.',
    keywords: ['background'],
    original_url: `https://example.test/trends/${key}`,
    source_name: 'fixture',
    authors: ['Trend Researcher'],
    ...overrides
  })
}

function seed(repository) {
  const definitions = [
    { source_record_id: 'cvpr-2022-alpha-one', keywords: ['alpha', 'shared'] },
    { source_record_id: 'cvpr-2022-alpha-two', keywords: ['alpha'] },
    { source_record_id: 'cvpr-2022-beta', keywords: ['beta'] },
    { source_record_id: 'cvpr-2021-alpha', year: 2021, keywords: ['alpha', 'shared'] },
    { source_record_id: 'cvpr-2021-phrase', year: 2021, keywords: ['alpha vision'] },
    { source_record_id: 'iccv-2021-beta', conference: 'ICCV', year: 2021, keywords: ['beta'] },
    { source_record_id: 'eccv-2022-alpha', conference: 'ECCV', keywords: ['alpha'] },
    { source_record_id: 'cvpr-2020-legacy', year: 2020, keywords: ['legacy'] },
    { source_record_id: 'cvpr-2019-legacy', year: 2019, keywords: ['legacy'] },
    { source_record_id: 'cvpr-2018-legacy', year: 2018, keywords: ['legacy'] },
    { source_record_id: 'missing-abstract', abstract: null, keywords: ['alpha', 'excluded'] },
    { source_record_id: 'fetch-failed', keywords: ['alpha', 'failed'], retrieval_error: 'Fixture failure' },
    { source_record_id: 'iccv-2022-ineligible', conference: 'ICCV', abstract: null, keywords: ['beta'] },
    { source_record_id: 'malformed', keywords: ['temporary'] }
  ]
  const inserted = new Map()
  for (const definition of definitions) {
    const saved = repository.insertPaper(paper(definition))
    inserted.set(definition.source_record_id, saved.paper_id)
  }
  repository.db.prepare('UPDATE papers SET keywords_json = ? WHERE paper_id = ?').run(
    JSON.stringify(['alpha', 'alpha', 'shared']),
    inserted.get('cvpr-2022-alpha-one')
  )
  repository.db.prepare('UPDATE papers SET keywords_json = ? WHERE paper_id = ?').run(
    '{malformed',
    inserted.get('malformed')
  )
}

async function startApi({ empty = false } = {}) {
  const repository = new PaperRepository(':memory:')
  if (!empty) seed(repository)
  const context = createContext({ config: testConfig(), repository, adapters: [], logger: testLogger() })
  const server = createApp(context).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      context.close()
    }
  }
}

async function getJson(base, path, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`)
  const body = await response.json()
  assert.equal(response.status, expectedStatus, JSON.stringify(body))
  return body
}

function seriesBy(result, topic, conference) {
  return result.series.find((entry) => entry.topic === topic && entry.conference === conference)
}

test('trend endpoint returns an explicit empty database state with deterministic defaults', async () => {
  const api = await startApi({ empty: true })
  try {
    const result = await getJson(api.base, '/api/topics/trends')
    const currentYear = new Date().getUTCFullYear()
    assert.deepEqual(result.scope.conferences, ['CVPR', 'ICCV', 'ECCV'])
    assert.deepEqual(result.scope.topics, [])
    assert.equal(result.scope.metric, 'share')
    assert.equal(result.scope.start_year, currentYear - 4)
    assert.equal(result.scope.end_year, currentYear)
    assert.deepEqual(result.years, [currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear])
    assert.deepEqual(result.series, [])
    assert.deepEqual(result.unknown_topics, [])
    assert.deepEqual(result.summary, { peak: null, latest_year_with_data: null })
  } finally { await api.close() }
})

test('trend defaults use the latest five represented years and top scoped topics', async () => {
  const api = await startApi()
  try {
    const result = await getJson(api.base, '/api/topics/trends')
    assert.deepEqual(result.years, [2018, 2019, 2020, 2021, 2022])
    assert.deepEqual(result.scope.topics, ['alpha', 'legacy', 'beta', 'shared'])
    assert.deepEqual(result.series.slice(0, 3).map((entry) => [entry.topic, entry.conference]), [
      ['alpha', 'CVPR'], ['alpha', 'ICCV'], ['alpha', 'ECCV']
    ])
  } finally { await api.close() }
})

test('explicit topics compare multiple conferences with exact matching and complete matrices', async () => {
  const api = await startApi()
  try {
    const result = await getJson(
      api.base,
      '/api/topics/trends?topic=Alpha&topic=beta&conference=ICCV&conference=CVPR&conference=ICCV&start_year=2021&end_year=2022&metric=count'
    )
    assert.deepEqual(result.scope, {
      topics: ['alpha', 'beta'],
      conferences: ['CVPR', 'ICCV'],
      start_year: 2021,
      end_year: 2022,
      metric: 'count'
    })
    assert.deepEqual(result.years, [2021, 2022])
    assert.deepEqual(result.series.map((entry) => [entry.topic, entry.conference]), [
      ['alpha', 'CVPR'], ['alpha', 'ICCV'], ['beta', 'CVPR'], ['beta', 'ICCV']
    ])
    assert.deepEqual(seriesBy(result, 'alpha', 'CVPR').points, [
      { year: 2021, paper_count: 1, eligible_paper_total: 2, share_percent: 50, has_data: true },
      { year: 2022, paper_count: 2, eligible_paper_total: 3, share_percent: 66.7, has_data: true }
    ])
    assert.deepEqual(seriesBy(result, 'beta', 'CVPR').points, [
      { year: 2021, paper_count: 0, eligible_paper_total: 2, share_percent: 0, has_data: true },
      { year: 2022, paper_count: 1, eligible_paper_total: 3, share_percent: 33.3, has_data: true }
    ])
    assert.deepEqual(seriesBy(result, 'alpha', 'ICCV').points, [
      { year: 2021, paper_count: 0, eligible_paper_total: 1, share_percent: 0, has_data: true },
      { year: 2022, paper_count: 0, eligible_paper_total: 0, share_percent: null, has_data: false }
    ])
    assert.deepEqual(result.summary.peak, {
      topic: 'alpha', conference: 'CVPR', year: 2022, paper_count: 2, share_percent: 66.7
    })
    assert.equal(result.summary.latest_year_with_data, 2022)
    assert.equal(seriesBy(result, 'alpha', 'CVPR').points[0].paper_count, 1)
  } finally { await api.close() }
})

test('share peak uses normalized values and deterministic later-year tie resolution', async () => {
  const api = await startApi()
  try {
    const result = await getJson(
      api.base,
      '/api/topics/trends?topic=alpha&topic=beta&conference=CVPR&conference=ICCV&conference=ECCV&start_year=2021&end_year=2022&metric=share'
    )
    assert.deepEqual(result.summary.peak, {
      topic: 'alpha', conference: 'ECCV', year: 2022, paper_count: 1, share_percent: 100
    })
    assert.equal(result.methodology.share_formula, 'paper_count / eligible_paper_total * 100')
    assert.match(result.methodology.missing_data_rule, /unavailable, not zero share/u)
  } finally { await api.close() }
})

test('topic normalization removes duplicates and reports unknown topics without substitution', async () => {
  const api = await startApi()
  try {
    const result = await getJson(
      api.base,
      '/api/topics/trends?topic=Alpha&topic=alphas&topic=unknown&conference=CVPR&start_year=2021&end_year=2022'
    )
    assert.deepEqual(result.scope.topics, ['alpha', 'unknown'])
    assert.deepEqual(result.unknown_topics, ['unknown'])
    assert.deepEqual(result.series.map((entry) => entry.topic), ['alpha'])
    assert.equal(result.series.some((entry) => entry.topic === 'unknown'), false)
  } finally { await api.close() }
})

test('ineligible and malformed records do not affect counts or denominators', async () => {
  const api = await startApi()
  try {
    const result = await getJson(
      api.base,
      '/api/topics/trends?topic=alpha&conference=CVPR&start_year=2022&end_year=2022'
    )
    assert.deepEqual(result.series[0].points[0], {
      year: 2022,
      paper_count: 2,
      eligible_paper_total: 3,
      share_percent: 66.7,
      has_data: true
    })
    assert.deepEqual(result.data_context.source_names, ['fixture'])
    assert.equal(typeof result.data_context.latest_updated_at, 'string')
  } finally { await api.close() }
})

test('single year boundaries derive a five-year inclusive range', async () => {
  const api = await startApi()
  try {
    const fromStart = await getJson(api.base, '/api/topics/trends?start_year=2018&topic=legacy')
    assert.deepEqual([fromStart.scope.start_year, fromStart.scope.end_year], [2018, 2022])
    const fromEnd = await getJson(api.base, '/api/topics/trends?end_year=2022&topic=legacy')
    assert.deepEqual([fromEnd.scope.start_year, fromEnd.scope.end_year], [2018, 2022])
  } finally { await api.close() }
})

test('trend endpoint rejects invalid topics, conferences, years, ranges, and metrics', async () => {
  const api = await startApi()
  try {
    const invalidPaths = [
      '/api/topics/trends?topic=alpha&topic=beta&topic=gamma&topic=delta&topic=epsilon&topic=zeta',
      '/api/topics/trends?topic=alpha%3Bbeta',
      '/api/topics/trends?topic=',
      '/api/topics/trends?conference=NeurIPS',
      '/api/topics/trends?conference=CVPR%202022',
      '/api/topics/trends?conference%5Bvalue%5D=CVPR',
      '/api/topics/trends?start_year=2022&end_year=2021',
      '/api/topics/trends?start_year=2000&end_year=2015',
      '/api/topics/trends?start_year=1979',
      '/api/topics/trends?metric=growth',
      '/api/topics/trends?metric=count&metric=share'
    ]
    for (const path of invalidPaths) {
      const error = await getJson(api.base, path, 400)
      assert.equal(error.error.code, 'validation_error')
    }
  } finally { await api.close() }
})

test('existing topic endpoints remain reachable beside the trends route', async () => {
  const api = await startApi()
  try {
    const hot = await getJson(api.base, '/api/topics/hot?conference=CVPR&year=2022')
    assert.equal(hot.items[0].topic, 'alpha')
    const network = await getJson(api.base, '/api/topics/network?conference=CVPR&year=2022')
    assert.equal(network.nodes.some((node) => node.topic === 'alpha'), true)
    const detail = await getJson(api.base, '/api/topics/alpha?conference=CVPR&year=2022')
    assert.equal(detail.paper_count, 2)
  } finally { await api.close() }
})
