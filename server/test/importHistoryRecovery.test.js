import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { createContext } from '../src/context.js'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { ImportService } from '../src/services/importService.js'
import { testConfig, testLogger } from '../test-support/helpers.js'

function entries(...titles) {
  return titles.map((title, index) => ({
    row_number: index + 1,
    input_value: title,
    normalized_input: title.toLocaleLowerCase('en-US'),
    status: 'pending'
  }))
}

function setJob(repository, jobId, { status, createdAt }) {
  repository.db.prepare(`
    UPDATE import_jobs SET status = ?, created_at = ?, updated_at = ? WHERE job_id = ?
  `).run(status, createdAt, createdAt, jobId)
}

function successfulSearchService(calls = []) {
  return {
    async search(title) {
      calls.push(title)
      return {
        candidates: [{ candidate_id: title, title, exact_match: true, match_score: 1 }],
        source_errors: []
      }
    },
    async confirm() {
      return { outcome: 'complete', paper: { paper_id: null, data_status: 'complete' } }
    }
  }
}

function seedHistory(repository) {
  const older = repository.createImportJob(entries('Older success', 'Older duplicate', 'Older missing', 'Older failure'))
  const olderItems = repository.listImportItems(older.job_id)
  repository.updateImportItem(olderItems[0].item_id, { status: 'successful' })
  repository.updateImportItem(olderItems[1].item_id, { status: 'duplicate' })
  repository.updateImportItem(olderItems[2].item_id, { status: 'missing_fields' })
  repository.updateImportItem(olderItems[3].item_id, { status: 'failed', retry_eligible: true })
  setJob(repository, older.job_id, { status: 'completed', createdAt: '2025-01-01T00:00:00.000Z' })

  const newer = repository.createImportJob(entries('New pending', 'New processing', 'New success'))
  const newerItems = repository.listImportItems(newer.job_id)
  repository.updateImportItem(newerItems[1].item_id, { status: 'processing' })
  repository.updateImportItem(newerItems[2].item_id, { status: 'successful' })
  setJob(repository, newer.job_id, { status: 'processing', createdAt: '2025-02-01T00:00:00.000Z' })
  return { older, newer }
}

async function startHistoryApi() {
  const repository = new PaperRepository(':memory:')
  const jobs = seedHistory(repository)
  const context = createContext({ config: testConfig(), repository, adapters: [], logger: testLogger() })
  const server = createApp(context).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return {
    jobs,
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      await context.importService.drain()
      context.close()
    }
  }
}

test('import history returns newest summaries with aggregated counts and no item arrays', async () => {
  const api = await startHistoryApi()
  try {
    const response = await fetch(`${api.base}/api/imports`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.items.map((job) => job.job_id), [api.jobs.newer.job_id, api.jobs.older.job_id])
    assert.deepEqual(body.items[0].counts, {
      total: 3, pending: 1, processing: 1, successful: 1,
      duplicate: 0, missing_fields: 0, failed: 0
    })
    assert.deepEqual(body.items[1].counts, {
      total: 4, pending: 0, processing: 0, successful: 1,
      duplicate: 1, missing_fields: 1, failed: 1
    })
    assert.equal(body.items.every((job) => !Object.hasOwn(job, 'items')), true)
    assert.deepEqual(
      { total: body.total, limit: body.limit, offset: body.offset, has_more: body.has_more },
      { total: 2, limit: 20, offset: 0, has_more: false }
    )
  } finally { await api.close() }
})

test('import history supports status filtering and deterministic pagination', async () => {
  const api = await startHistoryApi()
  try {
    const filtered = await (await fetch(`${api.base}/api/imports?status=completed`)).json()
    assert.equal(filtered.total, 1)
    assert.deepEqual(filtered.items.map((job) => job.job_id), [api.jobs.older.job_id])

    const first = await (await fetch(`${api.base}/api/imports?limit=1&offset=0`)).json()
    assert.deepEqual(first.items.map((job) => job.job_id), [api.jobs.newer.job_id])
    assert.equal(first.has_more, true)
    const second = await (await fetch(`${api.base}/api/imports?limit=1&offset=1`)).json()
    assert.deepEqual(second.items.map((job) => job.job_id), [api.jobs.older.job_id])
    assert.equal(second.has_more, false)
  } finally { await api.close() }
})

test('import history validates status, limit, and offset while detailed retrieval remains intact', async () => {
  const api = await startHistoryApi()
  try {
    const invalid = [
      'status=cancelled',
      'status=pending&status=processing',
      'limit=0',
      'limit=101',
      'limit=2.5',
      'limit=ten',
      'offset=-1',
      'offset=1.5'
    ]
    for (const query of invalid) {
      const response = await fetch(`${api.base}/api/imports?${query}`)
      assert.equal(response.status, 400, query)
      assert.equal((await response.json()).error.code, 'validation_error', query)
    }

    const detailResponse = await fetch(`${api.base}/api/imports/${api.jobs.older.job_id}`)
    assert.equal(detailResponse.status, 200)
    const detail = await detailResponse.json()
    assert.equal(detail.items.length, 4)
    assert.equal(detail.counts.total, 4)
  } finally { await api.close() }
})

test('server-start recovery resets and resumes interrupted items without reprocessing terminal results', async () => {
  const repository = new PaperRepository(':memory:')
  const created = repository.createImportJob(entries('Interrupted', 'Already successful', 'Already duplicate'))
  const items = repository.listImportItems(created.job_id)
  repository.updateImportItem(items[0].item_id, {
    status: 'processing', candidate_json: { candidate_id: 'stale' }, failure_reason: 'stale', retry_eligible: true
  })
  repository.updateImportItem(items[1].item_id, { status: 'successful' })
  repository.updateImportItem(items[2].item_id, { status: 'duplicate' })
  repository.setImportJobStatus(created.job_id, 'processing')
  const calls = []
  const context = createContext({
    config: testConfig({ importConcurrency: 1 }),
    repository,
    searchService: successfulSearchService(calls),
    logger: testLogger(),
    recoverImports: true
  })
  try {
    const completed = await context.importService.wait(created.job_id)
    assert.equal(completed.status, 'completed')
    assert.deepEqual(calls, ['Interrupted'])
    assert.deepEqual(completed.items.map((item) => item.status), ['successful', 'successful', 'duplicate'])
    assert.equal(completed.items[0].candidate.candidate_id, 'Interrupted')
    assert.equal(completed.items[0].failure_reason, null)
  } finally {
    await context.importService.drain()
    context.close()
  }
})

test('recovery completes active jobs that have no processable items', () => {
  const repository = new PaperRepository(':memory:')
  const created = repository.createImportJob(entries('Finished', 'Duplicate', 'Failed'))
  const items = repository.listImportItems(created.job_id)
  repository.updateImportItem(items[0].item_id, { status: 'successful' })
  repository.updateImportItem(items[1].item_id, { status: 'duplicate' })
  repository.updateImportItem(items[2].item_id, { status: 'failed', retry_eligible: true })
  repository.setImportJobStatus(created.job_id, 'processing')
  const service = new ImportService({
    repository,
    searchService: successfulSearchService(),
    config: testConfig(),
    logger: testLogger()
  })
  try {
    const recovered = service.recoverInterruptedJobs()
    assert.deepEqual(recovered.map(({ job_id, status, pending_items }) => ({ job_id, status, pending_items })), [
      { job_id: created.job_id, status: 'completed', pending_items: 0 }
    ])
    assert.equal(service.running.has(created.job_id), false)
    assert.equal(service.get(created.job_id).status, 'completed')
    assert.deepEqual(service.get(created.job_id).items.map((item) => item.status), ['successful', 'duplicate', 'failed'])
  } finally { repository.close() }
})

test('duplicate scheduling returns one running promise and processes each pending item once', async () => {
  const repository = new PaperRepository(':memory:')
  const created = repository.createImportJob(entries('Only once'))
  const calls = []
  const service = new ImportService({
    repository,
    searchService: successfulSearchService(calls),
    config: testConfig({ importConcurrency: 1 }),
    logger: testLogger()
  })
  try {
    const first = service.schedule(created.job_id)
    const second = service.schedule(created.job_id)
    assert.equal(first, second)
    await first
    assert.deepEqual(calls, ['Only once'])
    assert.equal(service.get(created.job_id).status, 'completed')
  } finally { repository.close() }
})
