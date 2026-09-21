import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { createContext } from '../src/context.js'
import { cleanPaperRecord } from '../src/domain/cleaning.js'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { testConfig, testLogger } from '../test-support/helpers.js'

function paper(overrides = {}) {
  const record = cleanPaperRecord({
    title: 'Untitled paper',
    conference: 'CVPR',
    year: 2025,
    abstract: 'A complete abstract.',
    keywords: ['computer vision'],
    original_url: 'https://example.test/paper',
    source_name: 'fixture',
    source_record_id: 'paper',
    authors: ['Researcher'],
    ...overrides
  })
  if (overrides.paper_id) record.paper_id = overrides.paper_id
  return record
}

function seed(repository) {
  return [
    repository.insertPaper(paper({
      paper_id: 'PP-ALPHA-EXACT', title: 'Alpha', conference: 'CVPR',
      keywords: ['vision systems', 'shared topic'], authors: ['Ada Lovelace', 'Sam Lee'],
      original_url: 'https://example.test/alpha', source_record_id: 'alpha'
    })),
    repository.insertPaper(paper({
      paper_id: 'PP-ALPHABET', title: 'Alphabet Vision', conference: 'ICCV',
      keywords: ['vision transformer', 'shared topic'], authors: ['Ada Lovelace'],
      original_url: 'https://example.test/alphabet', source_record_id: 'alphabet'
    })),
    repository.insertPaper(paper({
      paper_id: 'PP-DEEP-ALPHA', title: 'Deep Alpha Systems', conference: 'ECCV',
      keywords: ['medical imaging'], authors: ['Grace Hopper'],
      original_url: 'https://example.test/deep-alpha', source_record_id: 'deep-alpha'
    })),
    repository.insertPaper(paper({
      paper_id: 'PP-SPECIAL', title: "100%_Reliable O'Brien", conference: 'CVPR',
      keywords: ['literal matching'], authors: ['Percent Tester'],
      original_url: 'https://example.test/special', source_record_id: 'special'
    }))
  ]
}

async function startApi() {
  const repository = new PaperRepository(':memory:')
  const records = seed(repository)
  const context = createContext({ config: testConfig(), repository, adapters: [], logger: testLogger() })
  const server = createApp(context).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return {
    records,
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      context.close()
    }
  }
}

test('global search matches all paper fields case-insensitively', async () => {
  const api = await startApi()
  try {
    const cases = [
      ['pp-alpha-exact', 'PP-ALPHA-EXACT'],
      ['ALPHABET VISION', 'PP-ALPHABET'],
      ['ada lovelace', 'PP-ALPHA-EXACT'],
      ['medical imaging', 'PP-DEEP-ALPHA'],
      ['iccv', 'PP-ALPHABET']
    ]
    for (const [query, expectedId] of cases) {
      const response = await fetch(`${api.base}/api/search?q=${encodeURIComponent(query)}&limit=10`)
      assert.equal(response.status, 200, query)
      const body = await response.json()
      assert.ok(body.papers.some((item) => item.paper_id === expectedId), query)
    }
  } finally { await api.close() }
})

test('global search ranks exact, prefix, and partial matches deterministically', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    const result = repository.globalSearch({ query: 'alpha', limit: 10 })
    assert.deepEqual(result.papers.map(({ paper_id, match_rank }) => [paper_id, match_rank]), [
      ['PP-ALPHA-EXACT', 0],
      ['PP-ALPHABET', 1],
      ['PP-DEEP-ALPHA', 2]
    ])

    repository.insertPaper(paper({
      paper_id: 'PP-VISION-Z', title: 'Vision Zebra', keywords: ['shared topic'], authors: ['Sam Lee'],
      original_url: 'https://example.test/vision-z', source_record_id: 'vision-z'
    }))
    repository.insertPaper(paper({
      paper_id: 'PP-VISION-A', title: 'Vision Apple', keywords: ['shared topic'], authors: ['Sam Lee'],
      original_url: 'https://example.test/vision-a', source_record_id: 'vision-a'
    }))
    assert.deepEqual(
      repository.globalSearch({ query: 'vision', limit: 20 }).papers
        .filter((item) => item.paper_id.startsWith('PP-VISION-'))
        .map((item) => item.paper_id),
      ['PP-VISION-A', 'PP-VISION-Z']
    )
  } finally { repository.close() }
})

test('global search deduplicates topics and authors and returns deterministic counts', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    const topicResult = repository.globalSearch({ query: 'shared', limit: 10 })
    assert.deepEqual(topicResult.topics, [{ topic: 'shared topic', paper_count: 2, match_rank: 1 }])
    const authorResult = repository.globalSearch({ query: 'ada', limit: 10 })
    assert.deepEqual(authorResult.authors, [{ author: 'Ada Lovelace', paper_count: 2, match_rank: 1 }])
  } finally { repository.close() }
})

test('global search returns empty groups and enforces the per-group limit', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    assert.deepEqual(repository.globalSearch({ query: 'not present', limit: 5 }), {
      query: 'not present', limit: 5, papers: [], topics: [], authors: []
    })
    const limited = repository.globalSearch({ query: 'alpha', limit: 1 })
    assert.equal(limited.papers.length, 1)
  } finally { repository.close() }
})

test('GET /api/search validates query and limit parameters', async () => {
  const api = await startApi()
  try {
    const invalidPaths = [
      '/api/search',
      '/api/search?q=a',
      '/api/search?q=ab&limit=0',
      '/api/search?q=ab&limit=21',
      '/api/search?q=ab&limit=two',
      '/api/search?q=ab&q=cd'
    ]
    for (const path of invalidPaths) {
      const response = await fetch(`${api.base}${path}`)
      assert.equal(response.status, 400, path)
      assert.equal((await response.json()).error.code, 'validation_error', path)
    }

    const limited = await (await fetch(`${api.base}/api/search?q=alpha&limit=1`)).json()
    assert.equal(limited.limit, 1)
    assert.ok(limited.papers.length <= 1)
    assert.ok(limited.topics.length <= 1)
    assert.ok(limited.authors.length <= 1)
  } finally { await api.close() }
})

test('global search treats SQL wildcards and quotes as literal text', async () => {
  const api = await startApi()
  try {
    const wildcard = await (await fetch(`${api.base}/api/search?q=${encodeURIComponent('%_')}&limit=20`)).json()
    assert.deepEqual(wildcard.papers.map((item) => item.paper_id), ['PP-SPECIAL'])

    const quote = await (await fetch(`${api.base}/api/search?q=${encodeURIComponent("O'Brien")}&limit=20`)).json()
    assert.deepEqual(quote.papers.map((item) => item.paper_id), ['PP-SPECIAL'])
  } finally { await api.close() }
})

test('Paper Library exact author filter is case-insensitive and URL-safe', async () => {
  const api = await startApi()
  try {
    const response = await fetch(`${api.base}/api/papers?author=${encodeURIComponent('ada lovelace')}&sort=title_asc`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.items.map((item) => item.paper_id), ['PP-ALPHA-EXACT', 'PP-ALPHABET'])

    const partial = await (await fetch(`${api.base}/api/papers?author=${encodeURIComponent('Ada')}`)).json()
    assert.equal(partial.total, 0)
  } finally { await api.close() }
})
