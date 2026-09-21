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
    title: `Network fixture ${key}`,
    conference: 'CVPR',
    year: 2025,
    abstract: 'A complete network-analysis abstract.',
    keywords: ['computer vision'],
    original_url: `https://example.test/network/${key}`,
    source_name: 'fixture',
    authors: ['Network Researcher'],
    ...overrides
  })
}

function seed(repository) {
  const definitions = [
    { source_record_id: 'one', keywords: ['alpha', 'beta', 'gamma'] },
    { source_record_id: 'two', keywords: ['alpha', 'beta', 'delta'] },
    { source_record_id: 'three', keywords: ['alpha', 'gamma', 'delta'] },
    { source_record_id: 'four', keywords: ['beta', 'gamma'] },
    { source_record_id: 'missing', abstract: null, keywords: ['alpha', 'excluded'] },
    { source_record_id: 'failed', keywords: ['alpha', 'failed'], retrieval_error: 'Fixture failure' },
    { source_record_id: 'malformed', keywords: ['temporary'] },
    { source_record_id: 'baseline', conference: 'CVPR', year: 2024, keywords: ['alpha', 'beta'] },
    { source_record_id: 'iccv-one', conference: 'ICCV', year: 2025, keywords: ['alpha', 'epsilon'] },
    { source_record_id: 'iccv-two', conference: 'ICCV', year: 2025, keywords: ['beta', 'epsilon'] }
  ]
  const inserted = new Map()
  for (const definition of definitions) {
    const saved = repository.insertPaper(paper(definition))
    inserted.set(definition.source_record_id, saved.paper_id)
  }
  repository.db.prepare('UPDATE papers SET keywords_json = ? WHERE paper_id = ?').run(
    JSON.stringify(['alpha', 'alpha', 'beta', 'gamma']),
    inserted.get('one')
  )
  repository.db.prepare('UPDATE papers SET keywords_json = ? WHERE paper_id = ?').run(
    '{malformed',
    inserted.get('malformed')
  )
  return inserted
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

test('keyword network returns an explicit empty-database response', () => {
  const repository = new PaperRepository(':memory:')
  try {
    assert.deepEqual(repository.getKeywordNetwork(), {
      scope: { conference: null, year: null, focus: null },
      methodology: {
        eligible_paper_total: 0,
        node_unit: 'distinct eligible papers containing a normalized keyword',
        edge_unit: 'distinct eligible papers containing both normalized keywords',
        similarity: 'Jaccard similarity',
        causality_warning: 'Keyword co-occurrence does not imply academic quality, semantic equivalence, importance, or causality.'
      },
      nodes: [],
      links: []
    })
  } finally { repository.close() }
})

test('network counts distinct eligible paper keywords and unordered pairs', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    const network = repository.getKeywordNetwork({ conference: 'CVPR', year: 2025 })
    assert.equal(network.methodology.eligible_paper_total, 4)
    assert.deepEqual(network.nodes.map((node) => [node.topic, node.paper_count, node.share_percent]), [
      ['alpha', 3, 75],
      ['beta', 3, 75],
      ['gamma', 3, 75],
      ['delta', 2, 50]
    ])
    assert.equal(network.nodes.some((node) => ['excluded', 'failed', 'temporary'].includes(node.topic)), false)
    assert.deepEqual(network.links.map((link) => [link.source, link.target, link.cooccurrence_count, link.jaccard_similarity]), [
      ['alpha', 'delta', 2, 0.6667],
      ['alpha', 'beta', 2, 0.5],
      ['alpha', 'gamma', 2, 0.5],
      ['beta', 'gamma', 2, 0.5],
      ['beta', 'delta', 1, 0.25],
      ['delta', 'gamma', 1, 0.25]
    ])
    assert.deepEqual(network.nodes.map((node) => [node.topic, node.degree, node.weighted_degree]), [
      ['alpha', 3, 6],
      ['beta', 3, 5],
      ['gamma', 3, 5],
      ['delta', 3, 4]
    ])
  } finally { repository.close() }
})

test('network thresholds and truncation are deterministic', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    const nodeThreshold = repository.getKeywordNetwork({ conference: 'CVPR', year: 2025, minNodeCount: 3 })
    assert.deepEqual(nodeThreshold.nodes.map((node) => node.topic), ['alpha', 'beta', 'gamma'])
    assert.equal(nodeThreshold.links.every((link) => ![link.source, link.target].includes('delta')), true)

    const edgeThreshold = repository.getKeywordNetwork({ conference: 'CVPR', year: 2025, minEdgeCount: 2 })
    assert.equal(edgeThreshold.links.length, 4)
    assert.equal(edgeThreshold.links.every((link) => link.cooccurrence_count === 2), true)

    const limitedNodes = repository.getKeywordNetwork({ conference: 'CVPR', year: 2025, maxNodes: 2 })
    assert.deepEqual(limitedNodes.nodes.map((node) => node.topic), ['alpha', 'beta'])
    assert.deepEqual(limitedNodes.links.map((link) => [link.source, link.target]), [['alpha', 'beta']])

    const limitedEdges = repository.getKeywordNetwork({ conference: 'CVPR', year: 2025, maxEdges: 2 })
    assert.deepEqual(limitedEdges.links.map((link) => [link.source, link.target]), [
      ['alpha', 'delta'], ['alpha', 'beta']
    ])
    assert.deepEqual(
      repository.getKeywordNetwork({ conference: 'CVPR', year: 2025 }),
      repository.getKeywordNetwork({ conference: 'CVPR', year: 2025 })
    )
  } finally { repository.close() }
})

test('network applies conference, year, and combined scopes', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    const conference = repository.getKeywordNetwork({ conference: 'ICCV' })
    assert.deepEqual(conference.nodes.map((node) => [node.topic, node.paper_count]), [
      ['epsilon', 2], ['alpha', 1], ['beta', 1]
    ])

    const year = repository.getKeywordNetwork({ year: 2025 })
    assert.equal(year.methodology.eligible_paper_total, 6)
    assert.deepEqual(year.nodes.slice(0, 3).map((node) => [node.topic, node.paper_count]), [
      ['alpha', 4], ['beta', 4], ['gamma', 3]
    ])

    const combined = repository.getKeywordNetwork({ conference: 'CVPR', year: 2024 })
    assert.equal(combined.methodology.eligible_paper_total, 1)
    assert.deepEqual(combined.nodes.map((node) => node.topic), ['alpha', 'beta'])
    assert.deepEqual(combined.links, [{ source: 'alpha', target: 'beta', cooccurrence_count: 1, jaccard_similarity: 1 }])
  } finally { repository.close() }
})

test('focused network ranks direct neighbors and retains edges among selected nodes', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    const focused = repository.getKeywordNetwork({
      conference: 'CVPR', year: 2025, focus: 'alpha', maxNodes: 3
    })
    assert.deepEqual(focused.scope, { conference: 'CVPR', year: 2025, focus: 'alpha' })
    assert.deepEqual(focused.nodes.map((node) => node.topic), ['alpha', 'delta', 'beta'])
    assert.equal(focused.nodes[0].focused, true)
    assert.equal(focused.nodes.slice(1).every((node) => !node.focused), true)
    assert.deepEqual(focused.links.map((link) => [link.source, link.target]), [
      ['alpha', 'delta'], ['alpha', 'beta'], ['beta', 'delta']
    ])
    assert.equal(repository.getKeywordNetwork({ conference: 'CVPR', year: 2025, focus: 'unknown' }), null)
  } finally { repository.close() }
})

test('network API validates filters, numeric bounds, duplicate values, and focus', async () => {
  const api = await startApi()
  try {
    const focused = await getJson(api.base, '/api/topics/network?conference=CVPR&year=2025&focus=Alpha&max_nodes=3')
    assert.deepEqual(focused.nodes.map((node) => node.topic), ['alpha', 'delta', 'beta'])

    for (const path of [
      '/api/topics/network?conference=NeurIPS',
      '/api/topics/network?year=1979',
      '/api/topics/network?max_nodes=1',
      '/api/topics/network?max_nodes=51',
      '/api/topics/network?min_node_count=0',
      '/api/topics/network?min_edge_count=0',
      '/api/topics/network?max_edges=0',
      '/api/topics/network?max_edges=301',
      '/api/topics/network?focus=alpha%3Bbeta',
      '/api/topics/network?focus=alpha&focus=beta',
      '/api/topics/network?max_nodes=10&max_nodes=20',
      '/api/topics/network?max_nodes%5Bvalue%5D=20',
      '/api/topics/network?focus%5Bvalue%5D=alpha'
    ]) {
      const error = await getJson(api.base, path, 400)
      assert.equal(error.error.code, 'validation_error')
    }

    const unknown = await getJson(api.base, '/api/topics/network?conference=CVPR&year=2025&focus=unknown', 404)
    assert.equal(unknown.error.code, 'not_found')
  } finally { await api.close() }
})

test('network API handles empty and malformed keyword data without live requests', async () => {
  const api = await startApi({ empty: true })
  try {
    const empty = await getJson(api.base, '/api/topics/network')
    assert.equal(empty.methodology.eligible_paper_total, 0)
    assert.deepEqual(empty.nodes, [])
    assert.deepEqual(empty.links, [])
  } finally { await api.close() }
})
