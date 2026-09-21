import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { createContext } from '../src/context.js'
import { cleanPaperRecord } from '../src/domain/cleaning.js'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { testConfig, testLogger } from '../test-support/helpers.js'

function paper(overrides) {
  return cleanPaperRecord({
    title: 'Overview fixture paper',
    conference: 'CVPR',
    year: 2025,
    abstract: 'A complete abstract.',
    keywords: ['computer vision'],
    original_url: 'https://example.test/overview',
    source_name: 'fixture',
    source_record_id: 'overview',
    authors: ['Researcher'],
    ...overrides
  })
}

function iso(milliseconds) {
  return new Date(milliseconds).toISOString()
}

function seed(repository, now = new Date()) {
  const nowTime = now.getTime()
  const definitions = [
    {
      title: 'Alpha Models', conference: 'CVPR', year: 2025,
      keywords: ['vision language', 'shared topic'], authors: ['Ada Lovelace'],
      original_url: 'https://example.test/alpha-overview', source_record_id: 'alpha-overview',
      updated_at: iso(nowTime - 60 * 60 * 1000), retrieved_at: iso(nowTime - 90 * 60 * 1000)
    },
    {
      title: 'Beta Geometry', conference: 'CVPR', year: 2025,
      keywords: ['shared topic', '3d vision'], authors: ['Bob Chen', 'Bea Singh'],
      original_url: null, source_record_id: 'beta-overview',
      updated_at: iso(nowTime - 60 * 60 * 1000), retrieved_at: iso(nowTime - 2 * 60 * 60 * 1000)
    },
    {
      title: 'Charlie Recognition', conference: 'ICCV', year: 2025,
      abstract: null, keywords: ['excluded keyword'], authors: [],
      original_url: 'https://example.test/charlie-overview', source_record_id: 'charlie-overview',
      updated_at: iso(nowTime - 2 * 60 * 60 * 1000), retrieved_at: iso(nowTime)
    },
    {
      title: 'Delta Tracking', conference: 'CVPR', year: 2024,
      keywords: ['vision language'], authors: ['Dana Evans'],
      original_url: 'https://example.test/delta-overview', source_record_id: 'delta-overview',
      updated_at: iso(nowTime - 3 * 60 * 60 * 1000), retrieved_at: iso(nowTime - 4 * 60 * 60 * 1000)
    },
    {
      title: 'Echo Segmentation', conference: 'ECCV', year: 2024,
      keywords: ['failure keyword'], authors: ['Eli Ford'], retrieval_error: 'Fixture failure',
      original_url: 'https://example.test/echo-overview', source_record_id: 'echo-overview',
      updated_at: iso(nowTime - 4 * 60 * 60 * 1000), retrieved_at: iso(nowTime - 5 * 60 * 60 * 1000)
    },
    {
      title: 'Foxtrot Rendering', conference: 'ICCV', year: 2023,
      keywords: ['legacy topic'], authors: ['Fran Green'],
      original_url: 'https://example.test/foxtrot-overview', source_record_id: 'foxtrot-overview',
      updated_at: iso(nowTime - 5 * 60 * 60 * 1000), retrieved_at: iso(nowTime - 6 * 60 * 60 * 1000)
    }
  ]

  const inserted = definitions.map(({ updated_at, retrieved_at, ...definition }) => {
    const saved = repository.insertPaper(paper({ ...definition, retrieved_at }))
    repository.db.prepare('UPDATE papers SET updated_at = ?, retrieved_at = ? WHERE paper_id = ?')
      .run(updated_at, retrieved_at, saved.paper_id)
    return { ...saved, updated_at, retrieved_at }
  })
  return { inserted, latestSync: definitions[2].retrieved_at }
}

test('overview metrics return an explicit empty state', () => {
  const repository = new PaperRepository(':memory:')
  try {
    assert.deepEqual(repository.getOverviewStats({ now: new Date('2026-09-21T00:00:00.000Z') }), {
      scope: { conference: null, year: null },
      papers: { value: 0, previous_value: null, delta_percent: null },
      topics: { value: 0, previous_value: null, delta_percent: null },
      conferences: { value: 0 },
      data_quality: { complete: 0, missing_fields: 0, fetch_failed: 0, complete_percent: 0 },
      last_sync: { value: null, status: 'empty' }
    })
    assert.deepEqual(repository.getPaperFacets(), { conferences: [], years: [] })
    assert.deepEqual(repository.listRecentPapers(), [])
  } finally { repository.close() }
})

test('overview metrics apply conference and year scopes and count only eligible distinct keywords', () => {
  const repository = new PaperRepository(':memory:')
  const now = new Date('2026-09-21T12:00:00.000Z')
  try {
    seed(repository, now)
    assert.equal(repository.getOverviewStats({ conference: 'CVPR', now }).papers.value, 3)
    assert.equal(repository.getOverviewStats({ year: 2025, now }).papers.value, 3)

    const selected = repository.getOverviewStats({ conference: 'CVPR', year: 2025, now })
    assert.deepEqual(selected.scope, { conference: 'CVPR', year: 2025 })
    assert.deepEqual(selected.papers, { value: 2, previous_value: 1, delta_percent: 100 })
    assert.deepEqual(selected.topics, { value: 3, previous_value: 1, delta_percent: 200 })
    assert.equal(selected.conferences.value, 1)

    const all = repository.getOverviewStats({ now })
    assert.equal(all.topics.value, 4)
    assert.deepEqual(all.data_quality, {
      complete: 3, missing_fields: 2, fetch_failed: 1, complete_percent: 50
    })
    assert.equal(all.papers.previous_value, null)
    assert.equal(all.papers.delta_percent, null)
  } finally { repository.close() }
})

test('overview metrics expose the newest update/retrieval timestamp and safe zero baselines', () => {
  const repository = new PaperRepository(':memory:')
  const now = new Date('2026-09-21T12:00:00.000Z')
  try {
    const { latestSync } = seed(repository, now)
    const all = repository.getOverviewStats({ now })
    assert.deepEqual(all.last_sync, { value: latestSync, status: 'up-to-date' })
    assert.equal(all.conferences.value, 3)

    const zeroBaseline = repository.getOverviewStats({ conference: 'ICCV', year: 2025, now })
    assert.equal(zeroBaseline.papers.value, 1)
    assert.equal(zeroBaseline.papers.previous_value, 0)
    assert.equal(zeroBaseline.papers.delta_percent, null)
    assert.equal(zeroBaseline.topics.value, 0)
    assert.equal(zeroBaseline.topics.previous_value, 0)
    assert.equal(zeroBaseline.topics.delta_percent, null)

    const stale = repository.getOverviewStats({ now: new Date(now.getTime() + 25 * 60 * 60 * 1000) })
    assert.equal(stale.last_sync.status, 'stale')
  } finally { repository.close() }
})

async function startApi({ empty = false } = {}) {
  const repository = new PaperRepository(':memory:')
  const now = new Date()
  if (!empty) seed(repository, now)
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

test('overview API validates filters, treats blanks as unset, and publishes facets', async () => {
  const api = await startApi()
  try {
    const selected = await getJson(api.base, '/api/overview/stats?conference=CVPR&year=2025')
    assert.equal(selected.papers.value, 2)
    assert.equal(selected.topics.value, 3)

    const blank = await getJson(api.base, '/api/overview/stats?conference=%20&year=')
    assert.equal(blank.papers.value, 6)

    const facets = await getJson(api.base, '/api/papers/facets')
    assert.deepEqual(facets, {
      conferences: ['CVPR', 'ECCV', 'ICCV'],
      years: [2025, 2024, 2023]
    })

    for (const path of [
      '/api/overview/stats?conference=NeurIPS',
      '/api/overview/stats?year=1979',
      '/api/papers/recent?conference=NeurIPS',
      '/api/papers/recent?year=1979',
      '/api/papers/recent?limit=21'
    ]) {
      const error = await getJson(api.base, path, 400)
      assert.equal(error.error.code, 'validation_error')
    }
  } finally { await api.close() }
})

test('recent-paper API applies limits, deterministic ordering, filters, and dashboard fields', async () => {
  const api = await startApi()
  try {
    const recent = await getJson(api.base, '/api/papers/recent')
    assert.equal(recent.length, 4)
    assert.deepEqual(recent.map((item) => item.title), [
      'Alpha Models', 'Beta Geometry', 'Charlie Recognition', 'Delta Tracking'
    ])
    assert.deepEqual(Object.keys(recent[0]), [
      'paper_id', 'title', 'authors', 'conference', 'year', 'keywords', 'data_status', 'updated_at'
    ])

    const limited = await getJson(api.base, '/api/papers/recent?limit=2')
    assert.equal(limited.length, 2)

    const selected = await getJson(api.base, '/api/papers/recent?conference=CVPR&year=2025&limit=20')
    assert.deepEqual(selected.map((item) => item.title), ['Alpha Models', 'Beta Geometry'])
    assert.deepEqual(selected[0].authors, ['Ada Lovelace'])
  } finally { await api.close() }
})

test('overview and recent-paper APIs return empty database states without mock records', async () => {
  const api = await startApi({ empty: true })
  try {
    const overview = await getJson(api.base, '/api/overview/stats')
    const recent = await getJson(api.base, '/api/papers/recent')
    assert.equal(overview.papers.value, 0)
    assert.deepEqual(overview.last_sync, { value: null, status: 'empty' })
    assert.deepEqual(recent, [])
  } finally { await api.close() }
})
