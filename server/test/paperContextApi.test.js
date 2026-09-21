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
    title: `Context fixture ${key}`,
    conference: 'CVPR',
    year: 2025,
    abstract: 'A complete paper used for context testing.',
    keywords: ['background'],
    original_url: `https://example.test/context/${key}`,
    source_name: 'fixture',
    authors: ['Context Researcher'],
    ...overrides
  })
}

function seed(repository) {
  const definitions = [
    { source_record_id: 'target', title: 'Target Context Paper', keywords: ['alpha', 'beta', 'gamma'] },
    { source_record_id: 'related-ab', title: 'A Shared Alpha Beta', keywords: ['alpha', 'beta'] },
    { source_record_id: 'related-alpha-a', title: 'B Alpha Context', keywords: ['alpha', 'delta'] },
    { source_record_id: 'related-beta-gamma', title: 'A Beta Gamma Context', keywords: ['beta', 'gamma'] },
    { source_record_id: 'related-alpha-b', title: 'C Alpha Context', keywords: ['alpha', 'epsilon'] },
    { source_record_id: 'related-alpha-c', title: 'D Alpha Context', keywords: ['alpha', 'zeta'] },
    { source_record_id: 'exact-phrase', title: 'Alpha Vision Only', keywords: ['alpha vision'] },
    { source_record_id: 'ineligible', title: 'Ineligible Alpha', abstract: null, keywords: ['alpha', 'beta'] },
    { source_record_id: 'failed', title: 'Failed Alpha', keywords: ['alpha'], retrieval_error: 'Fixture failure' },
    { source_record_id: 'other-conference', title: 'Other Conference Alpha', conference: 'ICCV', keywords: ['alpha'] },
    { source_record_id: 'previous-alpha', title: 'Previous Alpha', year: 2024, keywords: ['alpha'] },
    { source_record_id: 'previous-beta', title: 'Previous Beta', year: 2024, keywords: ['beta'] },
    { source_record_id: 'tie-target', title: 'Tie Topic Paper', year: 2023, keywords: ['sigma', 'omega'] },
    { source_record_id: 'missing', title: 'Missing Context Fields', abstract: null, keywords: [], authors: [] },
    { source_record_id: 'malformed', title: 'Malformed Context Fields', keywords: ['temporary'] }
  ]
  const ids = new Map()
  for (const definition of definitions) {
    const saved = repository.insertPaper(paper(definition))
    ids.set(definition.source_record_id, saved.paper_id)
  }
  repository.db.prepare(`
    UPDATE papers
    SET keywords_json = ?, authors_json = ?, missing_fields_json = ?
    WHERE paper_id = ?
  `).run('{malformed', '{"name":"not an array"}', '{malformed', ids.get('malformed'))
  return ids
}

async function startApi() {
  const repository = new PaperRepository(':memory:')
  const ids = seed(repository)
  const context = createContext({ config: testConfig(), repository, adapters: [], logger: testLogger() })
  const server = createApp(context).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    ids,
    repository,
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

test('paper context returns complete metadata, quality, and scoped topic statistics', async () => {
  const api = await startApi()
  try {
    const result = await getJson(api.base, `/api/papers/${api.ids.get('target')}/context`)
    assert.equal(result.paper.paper_id, api.ids.get('target'))
    assert.equal(result.paper.title, 'Target Context Paper')
    assert.deepEqual(result.paper.keywords, ['alpha', 'beta', 'gamma'])
    assert.deepEqual(result.data_quality, {
      status: 'complete', missing_fields: [], retrieval_error: null, eligible: true, excluded_for: []
    })
    assert.deepEqual(result.primary_topic, {
      topic: 'alpha',
      scope: { conference: 'CVPR', year: 2025 },
      rank: 1,
      paper_count: 5,
      eligible_paper_total: 7,
      share_percent: 71.4,
      previous_paper_count: 1,
      growth_percent: 400
    })
  } finally { await api.close() }
})

test('primary topic selection is deterministic when paper keyword counts tie', async () => {
  const api = await startApi()
  try {
    const result = await getJson(api.base, `/api/papers/${api.ids.get('tie-target')}/context`)
    assert.equal(result.primary_topic.topic, 'omega')
    assert.equal(result.primary_topic.paper_count, 1)
    assert.equal(result.primary_topic.rank, 1)
  } finally { await api.close() }
})

test('related keywords use real exact co-occurrence with deterministic ordering and limit', async () => {
  const api = await startApi()
  try {
    const result = await getJson(api.base, `/api/papers/${api.ids.get('target')}/context`)
    assert.deepEqual(result.related_keywords.map((keyword) => [
      keyword.topic, keyword.cooccurrence_count, keyword.paper_count, keyword.jaccard_similarity
    ]), [
      ['beta', 2, 3, 0.3333],
      ['delta', 1, 1, 0.2],
      ['epsilon', 1, 1, 0.2],
      ['zeta', 1, 1, 0.2],
      ['gamma', 1, 2, 0.1667]
    ])
    assert.equal(result.related_keywords.length, 5)
    assert.equal(result.related_keywords.some((keyword) => keyword.topic === 'alpha vision'), false)
  } finally { await api.close() }
})

test('related papers exclude current and ineligible records and obey ordering and limit', async () => {
  const api = await startApi()
  try {
    const result = await getJson(api.base, `/api/papers/${api.ids.get('target')}/context`)
    assert.deepEqual(result.related_papers.map((entry) => entry.paper.title), [
      'A Shared Alpha Beta', 'B Alpha Context', 'C Alpha Context'
    ])
    assert.deepEqual(result.related_papers.map((entry) => entry.shared_keyword_count), [2, 1, 1])
    assert.equal(result.related_papers.length, 3)
    assert.equal(result.related_papers.some((entry) => entry.paper.paper_id === api.ids.get('target')), false)
    assert.equal(result.related_papers.some((entry) => ['Ineligible Alpha', 'Failed Alpha'].includes(entry.paper.title)), false)
    assert.equal(result.related_papers.every((entry) => entry.paper.conference === 'CVPR' && entry.paper.year === 2025), true)
    assert.equal(result.related_papers.every((entry) => entry.paper.eligible), true)
  } finally { await api.close() }
})

test('exact normalized keyword matching does not match longer keyword phrases', async () => {
  const api = await startApi()
  try {
    const result = await getJson(api.base, `/api/papers/${api.ids.get('target')}/context`)
    assert.equal(result.primary_topic.paper_count, 5)
    assert.equal(result.related_papers.some((entry) => entry.paper.title === 'Alpha Vision Only'), false)
    const phrase = await getJson(api.base, `/api/papers/${api.ids.get('exact-phrase')}/context`)
    assert.equal(phrase.primary_topic.topic, 'alpha vision')
    assert.equal(phrase.primary_topic.paper_count, 1)
  } finally { await api.close() }
})

test('missing and malformed stored fields produce safe context responses', async () => {
  const api = await startApi()
  try {
    for (const key of ['missing', 'malformed']) {
      const result = await getJson(api.base, `/api/papers/${api.ids.get(key)}/context`)
      assert.deepEqual(result.paper.keywords, [])
      assert.deepEqual(result.paper.authors, [])
      assert.equal(result.data_quality.eligible, false)
      assert.equal(result.data_quality.excluded_for.includes('keywords'), true)
      assert.equal(result.primary_topic, null)
      assert.deepEqual(result.related_keywords, [])
      assert.deepEqual(result.related_papers, [])
    }
  } finally { await api.close() }
})

test('unknown paper context returns HTTP 404 without a fallback record', async () => {
  const api = await startApi()
  try {
    const result = await getJson(api.base, '/api/papers/PP-NOT-FOUND/context', 404)
    assert.equal(result.error.code, 'not_found')
    assert.equal(result.error.details.paper_id, 'PP-NOT-FOUND')
  } finally { await api.close() }
})
