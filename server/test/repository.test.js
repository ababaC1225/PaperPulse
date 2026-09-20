import test from 'node:test'
import assert from 'node:assert/strict'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { cleanPaperRecord } from '../src/domain/cleaning.js'

function record(overrides = {}) {
  return cleanPaperRecord({
    title: 'Idempotent Paper',
    conference: 'CVPR',
    year: 2025,
    abstract: 'An abstract.',
    keywords: ['vision'],
    original_url: 'https://example.test/paper?utm_source=test',
    source_name: 'cvf',
    source_record_id: '/paper',
    doi: '10.1000/idempotent',
    ...overrides
  })
}

test('paper persistence is idempotent across supported duplicate keys', () => {
  const repository = new PaperRepository(':memory:')
  try {
    const first = repository.savePaper(record())
    const repeated = repository.savePaper(record())
    const titleKey = repository.savePaper(record({ doi: null, source_record_id: null, original_url: 'https://other.test/paper' }))
    assert.equal(first.outcome, 'complete')
    assert.equal(repeated.outcome, 'duplicate')
    assert.equal(titleKey.outcome, 'duplicate')
    assert.equal(repository.listPapers().total, 1)
    assert.equal(repeated.paper.paper_id, first.paper.paper_id)
  } finally { repository.close() }
})
