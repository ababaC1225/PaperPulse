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
    title: `Topic fixture ${key}`,
    conference: 'CVPR',
    year: 2025,
    abstract: 'A complete analysis abstract.',
    keywords: ['computer vision'],
    original_url: `https://example.test/topics/${key}`,
    source_name: 'fixture',
    authors: ['Fixture Researcher'],
    ...overrides
  })
}

function seed(repository) {
  const definitions = [
    {
      source_record_id: 'alpha-2025', title: 'Alpha Diffusion', conference: 'CVPR', year: 2025,
      keywords: ['diffusion', 'shared', 'declining', 'duplicate'], authors: ['Ada Alpha'],
      updated_at: '2025-06-10T10:00:00.000Z'
    },
    {
      source_record_id: 'beta-2025', title: 'Beta Diffusion', conference: 'CVPR', year: 2025,
      keywords: ['diffusion', 'shared'], authors: ['Bea Beta'],
      updated_at: '2025-06-12T10:00:00.000Z'
    },
    {
      source_record_id: 'gamma-2025', title: 'Gamma Growth', conference: 'CVPR', year: 2025,
      keywords: ['shared', 'growth only'], authors: [],
      updated_at: '2025-06-11T10:00:00.000Z'
    },
    {
      source_record_id: 'missing-2025', title: 'Missing Abstract', conference: 'CVPR', year: 2025,
      abstract: null, keywords: ['diffusion', 'excluded'], updated_at: '2025-06-13T10:00:00.000Z'
    },
    {
      source_record_id: 'failed-2025', title: 'Failed Retrieval', conference: 'CVPR', year: 2025,
      keywords: ['diffusion', 'failed topic'], retrieval_error: 'Fixture failure', updated_at: '2025-06-14T10:00:00.000Z'
    },
    {
      source_record_id: 'delta-2024', title: 'Delta Baseline', conference: 'CVPR', year: 2024,
      keywords: ['diffusion', 'shared', 'declining'], updated_at: '2024-06-10T10:00:00.000Z'
    },
    {
      source_record_id: 'echo-2024', title: 'Echo Baseline', conference: 'CVPR', year: 2024,
      keywords: ['shared', 'declining'], updated_at: '2024-06-11T10:00:00.000Z'
    },
    {
      source_record_id: 'foxtrot-2024', title: 'Foxtrot Baseline', conference: 'CVPR', year: 2024,
      keywords: ['legacy'], updated_at: '2024-06-12T10:00:00.000Z'
    },
    {
      source_record_id: 'old-2023', title: 'Old Evidence', conference: 'CVPR', year: 2023,
      keywords: ['legacy'], updated_at: '2023-06-10T10:00:00.000Z'
    },
    {
      source_record_id: 'iccv-2025', title: 'ICCV Diffusion', conference: 'ICCV', year: 2025,
      keywords: ['diffusion', 'iccv topic'], updated_at: '2025-07-10T10:00:00.000Z'
    },
    {
      source_record_id: 'iccv-2024', title: 'ICCV Baseline', conference: 'ICCV', year: 2024,
      keywords: ['iccv topic'], updated_at: '2024-07-10T10:00:00.000Z'
    }
  ]

  const inserted = new Map()
  for (const { updated_at, ...definition } of definitions) {
    const saved = repository.insertPaper(paper(definition))
    repository.db.prepare('UPDATE papers SET updated_at = ? WHERE paper_id = ?').run(updated_at, saved.paper_id)
    inserted.set(definition.source_record_id, saved.paper_id)
  }

  repository.db.prepare('UPDATE papers SET keywords_json = ? WHERE paper_id = ?').run(
    JSON.stringify(['diffusion', 'shared', 'declining', 'duplicate', 'duplicate']),
    inserted.get('alpha-2025')
  )
  return inserted
}

async function startApi({ empty = false } = {}) {
  const repository = new PaperRepository(':memory:')
  const inserted = empty ? new Map() : seed(repository)
  const context = createContext({ config: testConfig(), repository, adapters: [], logger: testLogger() })
  const server = createApp(context).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    inserted,
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

test('hot-topic analysis returns an explicit empty response', () => {
  const repository = new PaperRepository(':memory:')
  try {
    assert.deepEqual(repository.listHotTopics(), {
      scope: { conference: null, year: null },
      methodology: {
        unit: 'distinct eligible papers containing a normalized keyword',
        eligible_paper_total: 0,
        growth_baseline_year: null,
        causality_warning: 'Keyword co-occurrence and frequency do not imply research quality or causality.'
      },
      items: []
    })
  } finally { repository.close() }
})

test('count and share ranking use eligible distinct papers with deterministic ties', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    const count = repository.listHotTopics({ conference: 'CVPR', year: 2025, sort: 'count' })
    assert.equal(count.methodology.eligible_paper_total, 3)
    assert.deepEqual(count.items.map((item) => item.topic), [
      'shared', 'diffusion', 'declining', 'duplicate', 'growth only'
    ])
    assert.deepEqual(count.items.map((item) => item.paper_count), [3, 2, 1, 1, 1])
    assert.deepEqual(count.items.map((item) => item.share_percent), [100, 66.7, 33.3, 33.3, 33.3])
    assert.equal(count.items.find((item) => item.topic === 'duplicate').paper_count, 1)
    assert.equal(count.items.some((item) => ['excluded', 'failed topic'].includes(item.topic)), false)

    const share = repository.listHotTopics({ conference: 'CVPR', year: 2025, sort: 'share' })
    assert.deepEqual(share.items.map((item) => item.topic), count.items.map((item) => item.topic))
  } finally { repository.close() }
})

test('growth uses the preceding scoped year, preserves zero baselines, and sorts nulls last', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    const result = repository.listHotTopics({ conference: 'CVPR', year: 2025, sort: 'growth' })
    assert.deepEqual(result.items.map((item) => [item.topic, item.previous_paper_count, item.growth_percent]), [
      ['diffusion', 1, 100],
      ['shared', 2, 50],
      ['declining', 2, -50],
      ['duplicate', 0, null],
      ['growth only', 0, null]
    ])
    assert.equal(result.methodology.growth_baseline_year, 2024)

    const allYears = repository.listHotTopics({ conference: 'CVPR' })
    assert.equal(allYears.methodology.growth_baseline_year, null)
    assert.equal(allYears.items.every((item) => item.previous_paper_count == null && item.growth_percent == null), true)
  } finally { repository.close() }
})

test('hot-topic filters, substring query, and limit apply to the selected scope', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    assert.equal(repository.listHotTopics({ year: 2025 }).items.find((item) => item.topic === 'diffusion').paper_count, 3)
    assert.equal(repository.listHotTopics({ conference: 'ICCV', year: 2025 }).items.find((item) => item.topic === 'diffusion').paper_count, 1)
    assert.equal(repository.listHotTopics({ conference: 'CVPR', year: 2024 }).methodology.eligible_paper_total, 3)
    assert.deepEqual(repository.listHotTopics({ conference: 'CVPR', year: 2025, query: 'growth' }).items.map((item) => item.topic), ['growth only'])
    assert.equal(repository.listHotTopics({ conference: 'CVPR', year: 2025, limit: 2 }).items.length, 2)
  } finally { repository.close() }
})

test('topic detail uses exact keyword matching, ascending eligible years, and related-paper ordering', async () => {
  const api = await startApi()
  try {
    const detail = await getJson(api.base, '/api/topics/diffusion?conference=CVPR&year=2025&paper_limit=10')
    assert.deepEqual({
      topic: detail.topic,
      paper_count: detail.paper_count,
      share_percent: detail.share_percent,
      previous_paper_count: detail.previous_paper_count,
      growth_percent: detail.growth_percent
    }, {
      topic: 'diffusion', paper_count: 2, share_percent: 66.7, previous_paper_count: 1, growth_percent: 100
    })
    assert.deepEqual(detail.trend, [
      { year: 2023, paper_count: 0, eligible_paper_total: 1, share_percent: 0 },
      { year: 2024, paper_count: 1, eligible_paper_total: 3, share_percent: 33.3 },
      { year: 2025, paper_count: 2, eligible_paper_total: 3, share_percent: 66.7 }
    ])
    assert.deepEqual(detail.related_papers.map((paper) => paper.title), ['Beta Diffusion', 'Alpha Diffusion'])
    assert.deepEqual(detail.related_papers.map((paper) => paper.paper_id), [
      api.inserted.get('beta-2025'), api.inserted.get('alpha-2025')
    ])
    assert.equal(detail.trend_methodology.missing_years.includes('omitted'), true)

    const substring = await getJson(api.base, '/api/topics/fusion?conference=CVPR&year=2025', 404)
    assert.equal(substring.error.code, 'not_found')
  } finally { await api.close() }
})

test('hot-topic and topic-detail validation remains intact beside the live network endpoint', async () => {
  const api = await startApi()
  try {
    const hot = await getJson(api.base, '/api/topics/hot?conference=CVPR&year=2025&sort=growth&limit=3')
    assert.deepEqual(hot.items.map((item) => item.topic), ['diffusion', 'shared', 'declining'])
    assert.deepEqual(hot.items.map((item) => item.rank), [1, 2, 3])

    for (const path of [
      '/api/topics/hot?conference=NeurIPS',
      '/api/topics/hot?year=1979',
      '/api/topics/hot?sort=quality',
      '/api/topics/hot?limit=0',
      '/api/topics/hot?limit=101',
      '/api/topics/diffusion?paper_limit=51',
      '/api/topics/diffusion?conference=NeurIPS',
      '/api/topics/diffusion?year=1979',
      '/api/topics/diffusion%3Bshared'
    ]) {
      const error = await getJson(api.base, path, 400)
      assert.equal(error.error.code, 'validation_error')
    }

    const unknown = await getJson(api.base, '/api/topics/unknown?conference=CVPR&year=2025', 404)
    assert.equal(unknown.error.code, 'not_found')

    const network = await getJson(api.base, '/api/topics/network')
    assert.equal(network.nodes.length > 0, true)
    assert.equal(network.methodology.similarity, 'Jaccard similarity')
  } finally { await api.close() }
})

test('hot-topic API returns the empty database state without mock records', async () => {
  const api = await startApi({ empty: true })
  try {
    const result = await getJson(api.base, '/api/topics/hot')
    assert.equal(result.methodology.eligible_paper_total, 0)
    assert.deepEqual(result.items, [])
  } finally { await api.close() }
})
