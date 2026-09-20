import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { createContext } from '../src/context.js'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { testConfig, testLogger } from '../test-support/helpers.js'

const completePaper = (overrides = {}) => ({
  title: 'Manual Vision Paper',
  conference: 'CVPR',
  year: 2025,
  abstract: 'A manually entered abstract.',
  keywords: 'Vision-Language, 3-D, vision-language',
  authors: 'Alice Researcher; Bob Scientist; Alice Researcher',
  original_url: 'https://Example.test/manual/?utm_source=course#paper',
  doi: 'https://doi.org/10.1000/MANUAL',
  ...overrides
})

async function startApi() {
  const repository = new PaperRepository(':memory:')
  const context = createContext({ config: testConfig(), repository, adapters: [], logger: testLogger() })
  const server = createApp(context).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    repository,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      context.close()
    }
  }
}

async function send(base, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const payload = response.status === 204 ? null : await response.json()
  return { response, payload }
}

test('manual creation normalizes every supported field and calculates missing-field state', async () => {
  const api = await startApi()
  try {
    const created = await send(api.base, '/api/papers', { method: 'POST', body: completePaper() })
    assert.equal(created.response.status, 201)
    assert.equal(created.payload.title, 'Manual Vision Paper')
    assert.equal(created.payload.normalized_title, 'manual vision paper')
    assert.equal(created.payload.conference, 'CVPR')
    assert.equal(created.payload.year, 2025)
    assert.deepEqual(created.payload.authors, ['Alice Researcher', 'Bob Scientist'])
    assert.deepEqual(created.payload.keywords, ['vision language', '3d'])
    assert.equal(created.payload.original_url, 'https://example.test/manual')
    assert.equal(created.payload.doi, '10.1000/manual')
    assert.equal(created.payload.source_name, 'manual')
    assert.equal(created.payload.data_status, 'complete')
    assert.deepEqual(created.payload.missing_fields, [])

    const incomplete = await send(api.base, '/api/papers', {
      method: 'POST',
      body: completePaper({
        title: 'Incomplete Manual Paper',
        abstract: '   ',
        keywords: '',
        original_url: 'https://example.test/incomplete',
        doi: null
      })
    })
    assert.equal(incomplete.response.status, 201)
    assert.equal(incomplete.payload.data_status, 'missing_fields')
    assert.deepEqual(incomplete.payload.missing_fields, ['abstract', 'keywords'])
    assert.equal(incomplete.payload.eligible, false)
  } finally { await api.close() }
})

test('manual creation returns field-level HTTP 400 validation errors', async () => {
  const api = await startApi()
  try {
    const result = await send(api.base, '/api/papers', {
      method: 'POST',
      body: {
        title: '   ', conference: 'NeurIPS', year: 1900, abstract: {},
        keywords: { invalid: true }, authors: ['Valid', 42], original_url: 'ftp://example.test/paper', doi: 123
      }
    })
    assert.equal(result.response.status, 400)
    assert.equal(result.payload.error.code, 'validation_error')
    assert.deepEqual(Object.keys(result.payload.error.details.fields).sort(), [
      'abstract', 'authors', 'conference', 'doi', 'keywords', 'original_url', 'title', 'year'
    ])
  } finally { await api.close() }
})

test('editing supports every field and recomputes normalized and quality fields', async () => {
  const api = await startApi()
  try {
    const created = await send(api.base, '/api/papers', { method: 'POST', body: completePaper() })
    const paperId = created.payload.paper_id
    const edited = await send(api.base, `/api/papers/${paperId}`, {
      method: 'PATCH',
      body: {
        title: 'Edited—Paper',
        conference: 'ICCV',
        year: 2023,
        authors: ['Carol Author', 'Dan Author'],
        abstract: '',
        keywords: [],
        original_url: 'https://EXAMPLE.test/edited/?utm_source=course#section',
        doi: 'https://doi.org/10.2000/EDITED'
      }
    })
    assert.equal(edited.response.status, 200)
    assert.equal(edited.payload.title, 'Edited-Paper')
    assert.equal(edited.payload.normalized_title, 'edited paper')
    assert.equal(edited.payload.conference, 'ICCV')
    assert.equal(edited.payload.year, 2023)
    assert.deepEqual(edited.payload.authors, ['Carol Author', 'Dan Author'])
    assert.equal(edited.payload.abstract, null)
    assert.deepEqual(edited.payload.keywords, [])
    assert.equal(edited.payload.original_url, 'https://example.test/edited')
    assert.equal(edited.payload.doi, '10.2000/edited')
    assert.equal(edited.payload.data_status, 'missing_fields')
    assert.deepEqual(edited.payload.missing_fields, ['abstract', 'keywords'])

    const completed = await send(api.base, `/api/papers/${paperId}`, {
      method: 'PATCH',
      body: { abstract: 'Restored abstract.', keywords: ['Restored Keyword'] }
    })
    assert.equal(completed.response.status, 200)
    assert.equal(completed.payload.title, 'Edited-Paper')
    assert.equal(completed.payload.data_status, 'complete')
    assert.deepEqual(completed.payload.missing_fields, [])
  } finally { await api.close() }
})

test('duplicate creation and duplicate-producing edits return HTTP 409', async () => {
  const api = await startApi()
  try {
    const first = await send(api.base, '/api/papers', { method: 'POST', body: completePaper() })
    assert.equal(first.response.status, 201)

    const titleConflict = await send(api.base, '/api/papers', {
      method: 'POST',
      body: completePaper({ original_url: 'https://example.test/other', doi: '10.1000/other' })
    })
    assert.equal(titleConflict.response.status, 409)
    assert.equal(titleConflict.payload.error.code, 'duplicate_conflict')
    assert.equal(titleConflict.payload.error.details.identity, 'normalized_title_conference_year')

    const doiConflict = await send(api.base, '/api/papers', {
      method: 'POST',
      body: completePaper({ title: 'Different Identity', original_url: 'https://example.test/different' })
    })
    assert.equal(doiConflict.response.status, 409)
    assert.equal(doiConflict.payload.error.details.identity, 'doi')

    const second = await send(api.base, '/api/papers', {
      method: 'POST',
      body: completePaper({ title: 'Second Paper', original_url: 'https://example.test/second', doi: '10.1000/second' })
    })
    const editConflict = await send(api.base, `/api/papers/${second.payload.paper_id}`, {
      method: 'PATCH', body: { title: first.payload.title }
    })
    assert.equal(editConflict.response.status, 409)
    assert.equal(editConflict.payload.error.details.paper_id, first.payload.paper_id)
  } finally { await api.close() }
})

test('deletion detaches dependent import items and missing update/delete return HTTP 404', async () => {
  const api = await startApi()
  try {
    const missingUpdate = await send(api.base, '/api/papers/PP-NOT-FOUND', { method: 'PATCH', body: { title: 'No paper' } })
    assert.equal(missingUpdate.response.status, 404)
    const missingDelete = await send(api.base, '/api/papers/PP-NOT-FOUND', { method: 'DELETE' })
    assert.equal(missingDelete.response.status, 404)

    const created = await send(api.base, '/api/papers', { method: 'POST', body: completePaper() })
    const job = api.repository.createImportJob([{ row_number: 1, input_value: created.payload.title, normalized_input: created.payload.normalized_title }])
    const [item] = api.repository.listImportItems(job.job_id)
    api.repository.updateImportItem(item.item_id, { status: 'successful', paper_id: created.payload.paper_id })

    const deleted = await send(api.base, `/api/papers/${created.payload.paper_id}`, { method: 'DELETE' })
    assert.equal(deleted.response.status, 204)
    assert.equal(deleted.payload, null)
    assert.equal(api.repository.getPaper(created.payload.paper_id), null)
    assert.equal(api.repository.listImportItems(job.job_id)[0].paper_id, null)
  } finally { await api.close() }
})
