import { Logger } from '../src/lib/logger.js'
import { loadConfig } from '../src/config.js'

const sink = { log() {}, warn() {}, error() {} }

export function testLogger() {
  return new Logger({ service: 'paperpulse-test' }, sink)
}

export function testConfig(overrides = {}) {
  return {
    ...loadConfig({}),
    databasePath: ':memory:',
    respectRobots: false,
    requestIntervalMs: 0,
    retryBackoffMs: 1,
    cacheTtlSeconds: 0,
    candidateTtlSeconds: 3600,
    ...overrides
  }
}
