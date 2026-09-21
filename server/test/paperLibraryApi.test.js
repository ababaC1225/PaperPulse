import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { createContext } from '../src/context.js'
import { cleanPaperRecord } from '../src/domain/cleaning.js'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { testConfig, testLogger } from '../test-support/helpers.js'

function paper(overrides) {
  return cleanPaperRecord({
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
}

function seed(repository) {
  const inserted = [
    repository.insertPaper(paper({
      title: 'Alpha Vision-Language Study',
      conference: 'CVPR', year: 2025, keywords: ['multimodal learning'], authors: ['Ada Lovelace'],
      original_url: 'https://example.test/alpha', source_name: 'cvf', source_record_id: 'alpha'
    })),
    repository.insertPaper(paper({
      title: 'Beta Reconstruction',
      conference: 'ICCV', year: 2023, keywords: [], authors: ['Bob Chen'],
      original_url: 'https://example.test/beta', source_name: 'dblp', source_record_id: 'beta'
    })),
    repository.insertPaper(paper({
      title: 'Gamma Segmentation',
      conference: 'ECCV', year: 2024, keywords: ['medical imaging'], authors: ['Carol Diaz'],
      original_url: 'https://example.test/gamma', source_name: 'ecva', source_record_id: 'gamma',
      retrieval_error: 'Upstream detail request failed'
    })),
    repository.insertPaper(paper({
      title: 'Delta Detection',
      conference: 'CVPR', year: 2022, keywords: ['object detection'], authors: ['Dan Evans'],
      original_url: 'https://example.test/delta', source_name: 'manual', source_record_id: 'delta'
    }))
  ]
  const timestamps = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01']
  inserted.forEach((item, index) => {
    repository.db.prepare('UPDATE papers SET updated_at = ? WHERE paper_id = ?')
      .run(`${timestamps[index]}T00:00:00.000Z`, item.paper_id)
  })
  return inserted
}

test('repository searches every supported field and treats SQL wildcard characters literally', () => {
  const repository = new PaperRepository(':memory:')
  try {
    assert.deepEqual(repository.listPapers(), {
      items: [], total: 0, limit: 20, offset: 0, page: 1,
      page_count: 0, has_previous: false, has_next: false
    })
    const records = seed(repository)
    const cases = [
      [records[0].paper_id.slice(3, 9), 'Alpha Vision-Language Study'],
      ['Reconstruction', 'Beta Reconstruction'],
      ['vision language', 'Alpha Vision-Language Study'],
      ['Carol Diaz', 'Gamma Segmentation'],
      ['medical imaging', 'Gamma Segmentation']
    ]
    for (const [query, expectedTitle] of cases) {
      const result = repository.listPapers({ query })
      assert.equal(result.total, 1, query)
      assert.equal(result.items[0].title, expectedTitle, query)
    }
    assert.equal(repository.listPapers({ query: '%' }).total, 0)
    assert.equal(repository.listPapers({ query: '_' }).total, 0)
  } finally { repository.close() }
})

test('repository combines filters, applies all safe sorts, and returns pagination metadata', () => {
  const repository = new PaperRepository(':memory:')
  try {
    seed(repository)
    const combined = repository.listPapers({
      query: 'Ada', conference: 'CVPR', year: 2025, dataStatus: 'complete', sourceName: 'CVF'
    })
    assert.equal(combined.total, 1)
    assert.equal(combined.items[0].title, 'Alpha Vision-Language Study')
    assert.equal(repository.listPapers({ status: 'missing_fields' }).items[0].title, 'Beta Reconstruction')
    assert.equal(repository.listPapers({ dataStatus: 'fetch_failed' }).items[0].title, 'Gamma Segmentation')

    const expected = {
      updated_desc: ['Delta Detection', 'Gamma Segmentation', 'Beta Reconstruction', 'Alpha Vision-Language Study'],
      updated_asc: ['Alpha Vision-Language Study', 'Beta Reconstruction', 'Gamma Segmentation', 'Delta Detection'],
      title_asc: ['Alpha Vision-Language Study', 'Beta Reconstruction', 'Delta Detection', 'Gamma Segmentation'],
      title_desc: ['Gamma Segmentation', 'Delta Detection', 'Beta Reconstruction', 'Alpha Vision-Language Study'],
      year_desc: ['Alpha Vision-Language Study', 'Gamma Segmentation', 'Beta Reconstruction', 'Delta Detection'],
      year_asc: ['Delta Detection', 'Beta Reconstruction', 'Gamma Segmentation', 'Alpha Vision-Language Study']
    }
    for (const [sort, titles] of Object.entries(expected)) {
      assert.deepEqual(repository.listPapers({ sort }).items.map((item) => item.title), titles, sort)
    }

    const first = repository.listPapers({ sort: 'title_asc', limit: 2, offset: 0 })
    assert.deepEqual({
      total: first.total, limit: first.limit, offset: first.offset, page: first.page,
      page_count: first.page_count, has_previous: first.has_previous, has_next: first.has_next
    }, { total: 4, limit: 2, offset: 0, page: 1, page_count: 2, has_previous: false, has_next: true })
    const second = repository.listPapers({ sort: 'title_asc', limit: 2, offset: 2 })
    assert.deepEqual(second.items.map((item) => item.title), ['Delta Detection', 'Gamma Segmentation'])
    assert.equal(second.page, 2)
    assert.equal(second.has_previous, true)
    assert.equal(second.has_next, false)
  } finally { repository.close() }
})

async function startApi() {
  const repository = new PaperRepository(':memory:')
  seed(repository)
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

test('GET /api/papers exposes server-side filters and complete pagination metadata', async () => {
  const api = await startApi()
  try {
    const response = await fetch(`${api.base}/api/papers?query=vision%20language&conference=CVPR&year=2025&data_status=complete&source_name=CVF&sort=title_asc&limit=1&offset=0`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(Object.keys(body), [
      'items', 'total', 'limit', 'offset', 'page', 'page_count', 'has_previous', 'has_next'
    ])
    assert.equal(body.items[0].title, 'Alpha Vision-Language Study')
    assert.deepEqual({
      total: body.total, limit: body.limit, offset: body.offset, page: body.page,
      page_count: body.page_count, has_previous: body.has_previous, has_next: body.has_next
    }, { total: 1, limit: 1, offset: 0, page: 1, page_count: 1, has_previous: false, has_next: false })

    const defaultPage = await (await fetch(`${api.base}/api/papers`)).json()
    assert.equal(defaultPage.limit, 20)
    assert.equal(defaultPage.total, 4)
  } finally { await api.close() }
})

test('GET /api/papers rejects unsafe or malformed query parameters', async () => {
  const api = await startApi()
  try {
    const invalidQueries = [
      'sort=updated_at%20DESC%3B%20DROP%20TABLE%20papers',
      'conference=NeurIPS',
      'year=1979',
      'data_status=duplicate',
      'limit=20records',
      'offset=-1',
      `query=${'x'.repeat(501)}`,
      `source_name=${'x'.repeat(101)}`
    ]
    for (const query of invalidQueries) {
      const response = await fetch(`${api.base}/api/papers?${query}`)
      assert.equal(response.status, 400, query)
      const body = await response.json()
      assert.equal(body.error.code, 'validation_error', query)
    }
  } finally { await api.close() }
})
