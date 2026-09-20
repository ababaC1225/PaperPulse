import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { createContext } from '../src/context.js'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { testConfig, testLogger } from '../test-support/helpers.js'

async function json(response) {
  const body = await response.json()
  assert.equal(response.ok, true, JSON.stringify(body))
  return body
}

test('paper search, confirmation, listing, detail, import, and validation endpoints work offline', async () => {
  const repository = new PaperRepository(':memory:')
  let retryAttempts = 0
  const adapter = {
    name: 'fixture',
    async search(query) {
      if (query === 'Retry Paper' && retryAttempts++ === 0) throw new Error('temporary source outage')
      return [{
        title: query,
        conference: 'CVPR',
        year: 2025,
        abstract: null,
        keywords: [],
        original_url: `https://example.test/${encodeURIComponent(query)}`,
        source_name: 'fixture',
        source_record_id: query,
        authors: ['Test Author']
      }]
    },
    async fetchDetails(candidate) {
      return { ...candidate, abstract: 'Fixture abstract', keywords: ['computer vision'] }
    }
  }
  const context = createContext({ config: testConfig(), repository, adapters: [adapter], logger: testLogger() })
  const server = createApp(context).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const invalid = await fetch(`${base}/api/papers/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    })
    assert.equal(invalid.status, 400)

    const search = await json(await fetch(`${base}/api/papers/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Offline Test Paper' })
    }))
    assert.equal(search.candidates.length, 1)

    const confirmed = await json(await fetch(`${base}/api/papers/search/${search.candidates[0].candidate_id}/confirm`, { method: 'POST' }))
    assert.equal(confirmed.outcome, 'complete')

    const list = await json(await fetch(`${base}/api/papers`))
    assert.equal(list.total, 1)
    const detail = await json(await fetch(`${base}/api/papers/${confirmed.paper.paper_id}`))
    assert.equal(detail.title, 'Offline Test Paper')

    const imported = await json(await fetch(`${base}/api/imports`, {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'Batch Test Paper\nOffline Test Paper'
    }))
    let job
    for (let attempt = 0; attempt < 100; attempt += 1) {
      job = await json(await fetch(`${base}/api/imports/${imported.job_id}`))
      if (job.status === 'completed') break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(job.status, 'completed')
    assert.equal(job.counts.successful, 1)
    assert.equal(job.counts.duplicate, 1)

    const retryJob = await json(await fetch(`${base}/api/imports`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titles: ['Retry Paper'] })
    }))
    let failedJob
    for (let attempt = 0; attempt < 100; attempt += 1) {
      failedJob = await json(await fetch(`${base}/api/imports/${retryJob.job_id}`))
      if (failedJob.status === 'completed') break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(failedJob.counts.failed, 1)
    await json(await fetch(`${base}/api/imports/${retryJob.job_id}/retry`, { method: 'POST' }))
    let retriedJob
    for (let attempt = 0; attempt < 100; attempt += 1) {
      retriedJob = await json(await fetch(`${base}/api/imports/${retryJob.job_id}`))
      if (retriedJob.status === 'completed' && retriedJob.counts.successful === 1) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(retriedJob.counts.successful, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    context.close()
  }
})
