import test from 'node:test'
import assert from 'node:assert/strict'
import { ReliableHttpClient, robots } from '../src/http/reliableHttpClient.js'
import { testConfig, testLogger } from '../test-support/helpers.js'

test('retries transient source responses and then succeeds', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return calls < 3
      ? new Response('temporary', { status: 503 })
      : new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  const client = new ReliableHttpClient({ config: testConfig({ retryLimit: 2 }), logger: testLogger(), fetchImpl })
  const result = await client.get('https://source.test/paper', { cache: false })
  assert.equal(result.body, 'ok')
  assert.equal(calls, 3)
})

test('reports timeout after retry exhaustion', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    throw new DOMException('request timed out', 'TimeoutError')
  }
  const client = new ReliableHttpClient({ config: testConfig({ retryLimit: 1 }), logger: testLogger(), fetchImpl })
  await assert.rejects(
    () => client.get('https://source.test/slow', { cache: false }),
    (error) => error.code === 'source_timeout' && error.retryable === true
  )
  assert.equal(calls, 2)
})

test('applies the most specific robots group and allow rule', () => {
  const parsed = robots.parseRobots(`
    User-agent: *
    Disallow: /private/
    Allow: /private/public/
    User-agent: PaperPulseCourseProject
    Disallow: /course-blocked/*
    Allow: /course-blocked/citation$
  `, 'PaperPulseCourseProject/1.0')
  assert.equal(robots.robotsAllows(parsed, '/course-blocked/dataset'), false)
  assert.equal(robots.robotsAllows(parsed, '/course-blocked/citation'), true)
  assert.equal(robots.robotsAllows(parsed, '/private/item'), true)
})
