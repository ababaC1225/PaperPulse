import crypto from 'node:crypto'
import { SourceRequestError } from '../lib/errors.js'

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

class Semaphore {
  constructor(limit) {
    this.limit = limit
    this.active = 0
    this.queue = []
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active += 1
      return
    }
    await new Promise((resolve) => this.queue.push(resolve))
    this.active += 1
  }

  release() {
    this.active -= 1
    this.queue.shift()?.()
  }
}

function parseRobots(text, userAgent = '*') {
  const groups = []
  let group = { agents: [], rules: [] }
  let hasDirectives = false
  for (const rawLine of String(text).split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, '').trim()
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (key === 'user-agent') {
      if (hasDirectives) {
        groups.push(group)
        group = { agents: [], rules: [] }
        hasDirectives = false
      }
      group.agents.push(value.toLowerCase())
    } else if (key === 'allow' || key === 'disallow') {
      hasDirectives = true
      if (key === 'allow' || value) group.rules.push({ type: key, path: value })
    }
  }
  if (group.agents.length || group.rules.length) groups.push(group)
  const identity = userAgent.toLowerCase()
  const specific = groups.filter((entry) => entry.agents.some((agent) => agent !== '*' && identity.includes(agent)))
  const applicable = specific.length ? specific : groups.filter((entry) => entry.agents.includes('*'))
  return applicable.flatMap((entry) => entry.rules).sort((left, right) => right.path.length - left.path.length)
}

function matchesRobotsPath(pattern, pathname) {
  if (!pattern) return false
  const endAnchored = pattern.endsWith('$')
  const source = (endAnchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*/gu, '.*')
  return new RegExp(`^${source}${endAnchored ? '$' : ''}`, 'u').test(pathname)
}

function robotsAllows(rules, pathname) {
  const match = rules.find((rule) => matchesRobotsPath(rule.path, pathname))
  return !match || match.type === 'allow'
}

export class ReliableHttpClient {
  constructor({ config, repository = null, logger, fetchImpl = globalThis.fetch }) {
    this.config = config
    this.repository = repository
    this.logger = logger
    this.fetchImpl = fetchImpl
    this.semaphore = new Semaphore(config.requestConcurrency)
    this.lastRequestAt = new Map()
    this.robots = new Map()
  }

  cacheKey(url, headers = {}) {
    return crypto.createHash('sha256').update(`${url}|${headers.accept || ''}`).digest('hex')
  }

  async checkRobots(url) {
    if (!this.config.respectRobots) return true
    const parsed = new URL(url)
    const origin = parsed.origin
    if (!this.robots.has(origin)) {
      const promise = (async () => {
        const robotsUrl = `${origin}/robots.txt`
        try {
          const response = await this.fetchImpl(robotsUrl, {
            headers: { 'user-agent': this.config.userAgent, accept: 'text/plain' },
            signal: AbortSignal.timeout(this.config.requestTimeoutMs)
          })
          if (!response.ok) return []
          return parseRobots(await response.text(), this.config.userAgent)
        } catch (error) {
          this.logger.warn('robots_fetch_failed', { origin, error: error.message })
          return []
        }
      })()
      this.robots.set(origin, promise)
    }
    const rules = await this.robots.get(origin)
    return robotsAllows(rules, `${parsed.pathname}${parsed.search}`)
  }

  async rateLimit(url) {
    const origin = new URL(url).origin
    const last = this.lastRequestAt.get(origin) || 0
    const wait = Math.max(0, this.config.requestIntervalMs - (Date.now() - last))
    if (wait) {
      this.logger.info('source_rate_limit_wait', { origin, wait_ms: wait })
      await sleep(wait)
    }
    this.lastRequestAt.set(origin, Date.now())
  }

  async get(url, { source = 'unknown', accept = 'text/html,application/json;q=0.9,*/*;q=0.8', cache = true } = {}) {
    const key = this.cacheKey(url, { accept })
    if (cache && this.repository && this.config.cacheTtlSeconds > 0) {
      const cached = this.repository.getCachedResponse(key)
      if (cached) {
        this.logger.info('source_cache_hit', { source, url })
        return cached
      }
    }
    if (!(await this.checkRobots(url))) {
      throw new SourceRequestError('Request blocked by robots.txt', {
        source,
        status: 403,
        code: 'robots_disallowed',
        retryable: false,
        details: { url }
      })
    }

    let lastError
    for (let attempt = 0; attempt <= this.config.retryLimit; attempt += 1) {
      await this.semaphore.acquire()
      try {
        await this.rateLimit(url)
        this.logger.info('source_request', { source, url, attempt })
        const response = await this.fetchImpl(url, {
          method: 'GET',
          headers: { 'user-agent': this.config.userAgent, accept },
          signal: AbortSignal.timeout(this.config.requestTimeoutMs),
          redirect: 'follow'
        })
        const body = await response.text()
        const headers = Object.fromEntries(response.headers.entries())
        this.logger.info('source_response', { source, url, attempt, status: response.status })
        if (response.ok) {
          const result = { url, status: response.status, headers, body }
          if (cache && this.repository && this.config.cacheTtlSeconds > 0) this.repository.setCachedResponse(key, result, this.config.cacheTtlSeconds)
          return result
        }
        const retryable = response.status === 429 || response.status >= 500
        lastError = new SourceRequestError(`Source returned HTTP ${response.status}`, {
          source,
          status: 502,
          code: 'source_http_error',
          retryable,
          details: { url, source_status: response.status }
        })
        if (!retryable || attempt === this.config.retryLimit) throw lastError
        const retryAfter = Number.parseFloat(headers['retry-after'])
        const backoff = Number.isFinite(retryAfter) ? retryAfter * 1000 : this.config.retryBackoffMs * (2 ** attempt)
        this.logger.warn('source_retry', { source, url, attempt: attempt + 1, wait_ms: backoff, status: response.status })
        await sleep(backoff)
      } catch (error) {
        lastError = error instanceof SourceRequestError ? error : new SourceRequestError(error.message || 'Source request failed', {
          source,
          code: error?.name === 'TimeoutError' ? 'source_timeout' : 'source_request_failed',
          retryable: true,
          details: { url }
        })
        if (!lastError.retryable || attempt === this.config.retryLimit) {
          this.logger.error('source_request_exhausted', { source, url, attempts: attempt + 1, error: lastError.message, code: lastError.code })
          throw lastError
        }
        const backoff = this.config.retryBackoffMs * (2 ** attempt)
        this.logger.warn('source_retry', { source, url, attempt: attempt + 1, wait_ms: backoff, error: lastError.message })
        await sleep(backoff)
      } finally {
        this.semaphore.release()
      }
    }
    throw lastError
  }
}

export const robots = { parseRobots, robotsAllows }
