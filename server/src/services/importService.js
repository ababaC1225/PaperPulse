import { parseImportPayload } from '../domain/importParser.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

async function runPool(items, concurrency, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index])
    }
  })
  await Promise.all(runners)
}

export class ImportService {
  constructor({ repository, searchService, config, logger }) {
    this.repository = repository
    this.searchService = searchService
    this.config = config
    this.logger = logger.child({ component: 'import-service' })
    this.running = new Map()
  }

  create(body, contentType = 'application/json') {
    const entries = parseImportPayload(body, contentType, this.config)
    const job = this.repository.createImportJob(entries)
    this.schedule(job.job_id)
    this.logger.info('batch_created', { job_id: job.job_id, total: job.counts.total })
    return job
  }

  get(jobId) {
    const job = this.repository.getImportJob(jobId)
    if (!job) throw new NotFoundError('Import job not found', { job_id: jobId })
    return job
  }

  list(options = {}) {
    return this.repository.listImportJobs(options)
  }

  recoverInterruptedJobs() {
    const jobs = this.repository.recoverInterruptedImportJobs()
    for (const job of jobs) {
      this.logger.info('batch_recovered', {
        job_id: job.job_id,
        previous_status: job.previous_status,
        status: job.status,
        reset_processing: job.reset_processing,
        pending_items: job.pending_items
      })
      if (job.pending_items > 0) this.schedule(job.job_id)
    }
    if (jobs.length) {
      this.logger.info('batch_recovery_complete', {
        jobs: jobs.length,
        resumed: jobs.filter((job) => job.pending_items > 0).length,
        completed: jobs.filter((job) => job.status === 'completed').length,
        reset_processing: jobs.reduce((total, job) => total + job.reset_processing, 0)
      })
    }
    return jobs
  }

  retry(jobId) {
    this.get(jobId)
    if (this.running.has(jobId)) throw new ValidationError('Import job is already processing')
    const retried = this.repository.resetRetryableItems(jobId)
    if (!retried) throw new ValidationError('Import job has no retryable entries')
    this.schedule(jobId)
    return { ...this.get(jobId), retried }
  }

  schedule(jobId) {
    if (this.running.has(jobId)) return this.running.get(jobId)
    const promise = new Promise((resolve) => setImmediate(resolve))
      .then(() => this.process(jobId))
      .catch((error) => {
        this.repository.setImportJobStatus(jobId, 'failed')
        this.logger.error('batch_failed', { job_id: jobId, error: error.message })
      })
      .finally(() => this.running.delete(jobId))
    this.running.set(jobId, promise)
    return promise
  }

  async wait(jobId) {
    await this.running.get(jobId)
    return this.get(jobId)
  }

  async drain() {
    await Promise.allSettled([...this.running.values()])
  }

  async process(jobId) {
    this.repository.setImportJobStatus(jobId, 'processing')
    const items = this.repository.listImportItems(jobId, ['pending'])
    await runPool(items, this.config.importConcurrency, (item) => this.processItem(jobId, item))
    this.repository.setImportJobStatus(jobId, 'completed')
    const finalJob = this.get(jobId)
    this.logger.info('batch_completed', { job_id: jobId, counts: finalJob.counts })
    return finalJob
  }

  async processItem(jobId, item) {
    this.repository.updateImportItem(item.item_id, { status: 'processing', failure_reason: null, retry_eligible: false })
    try {
      const result = await this.searchService.search(item.input_value)
      const candidate = result.candidates[0]
      if (!candidate) {
        const sourceFailure = result.source_errors.some((error) => error.retryable)
        this.repository.updateImportItem(item.item_id, {
          status: 'failed',
          failure_reason: result.source_errors.length ? 'No candidate found; one or more sources failed' : 'No matching paper found',
          retry_eligible: sourceFailure
        })
        return
      }
      if (!candidate.exact_match && typeof candidate.match_score === 'number' && candidate.match_score < 0.7) {
        this.repository.updateImportItem(item.item_id, {
          status: 'failed',
          candidate_json: candidate,
          failure_reason: `Best candidate match was only ${Math.round(candidate.match_score * 100)}%; review the title and retry`,
          retry_eligible: false
        })
        return
      }
      const saved = await this.searchService.confirm(candidate.candidate_id)
      const status = saved.outcome === 'duplicate'
        ? 'duplicate'
        : saved.paper.data_status === 'complete'
          ? 'successful'
          : saved.paper.data_status === 'missing_fields'
            ? 'missing_fields'
            : 'failed'
      this.repository.updateImportItem(item.item_id, {
        status,
        paper_id: saved.paper.paper_id,
        candidate_json: candidate,
        failure_reason: status === 'failed' ? saved.paper.retrieval_error || 'Source detail retrieval failed' : null,
        retry_eligible: status === 'failed'
      })
    } catch (error) {
      this.repository.updateImportItem(item.item_id, {
        status: 'failed',
        failure_reason: error?.message || 'Import failed',
        retry_eligible: error?.retryable !== false
      })
      this.logger.error('batch_item_failed', {
        job_id: jobId,
        row_number: item.row_number,
        code: error?.code,
        error: error?.message
      })
    } finally {
      this.logger.info('batch_progress', { job_id: jobId, counts: this.get(jobId).counts })
    }
  }
}
