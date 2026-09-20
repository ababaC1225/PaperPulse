import test from 'node:test'
import assert from 'node:assert/strict'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { ImportService } from '../src/services/importService.js'
import { cleanPaperRecord, normalizeTitle } from '../src/domain/cleaning.js'
import { SourceRequestError } from '../src/lib/errors.js'
import { testConfig, testLogger } from '../test-support/helpers.js'

test('batch import continues after a failure and reports partial success', async () => {
  const repository = new PaperRepository(':memory:')
  const makeRecord = (title, complete) => cleanPaperRecord({
    title,
    conference: 'CVPR',
    year: 2025,
    abstract: complete ? 'Available abstract' : null,
    keywords: complete ? ['vision'] : [],
    original_url: `https://example.test/${normalizeTitle(title).replaceAll(' ', '-')}`,
    source_name: 'fixture',
    source_record_id: normalizeTitle(title)
  })
  const searchService = {
    async search(title) {
      if (title === 'Network Failure') throw new SourceRequestError('fixture timed out', { source: 'fixture', code: 'source_timeout' })
      return { candidates: [{ candidate_id: title, title }], source_errors: [] }
    },
    async confirm(candidateId) {
      return repository.savePaper(makeRecord(candidateId, candidateId === 'Complete Paper'))
    }
  }
  const service = new ImportService({ repository, searchService, config: testConfig({ importConcurrency: 2 }), logger: testLogger() })
  try {
    const created = service.create({ titles: ['Complete Paper', 'Incomplete Paper', 'Network Failure'] })
    const completed = await service.wait(created.job_id)
    assert.equal(completed.status, 'completed')
    assert.equal(completed.counts.successful, 1)
    assert.equal(completed.counts.missing_fields, 1)
    assert.equal(completed.counts.failed, 1)
    const failed = completed.items.find((item) => item.input_value === 'Network Failure')
    assert.equal(failed.retry_eligible, true)
    assert.match(failed.failure_reason, /timed out/i)
  } finally { repository.close() }
})
