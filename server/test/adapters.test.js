import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDblpResponse } from '../src/sources/dblpAdapter.js'
import { parseCvfIndex, parseCvfPaper } from '../src/sources/cvfAdapter.js'
import { parseEcvaIndex, parseEcvaPaper } from '../src/sources/ecvaAdapter.js'

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixture = (name) => fs.readFileSync(path.join(fixtureDir, name), 'utf8')

test('parses sanitized DBLP JSON and rejects invalid responses', () => {
  const records = parseDblpResponse(fixture('dblp-search.json'))
  assert.equal(records.length, 1)
  assert.equal(records[0].conference, 'CVPR')
  assert.deepEqual(records[0].authors, ['A. Zhang', 'B. Li'])
  assert.throws(() => parseDblpResponse('{bad json'), /invalid JSON/i)
})

test('parses CVF index and detail fixtures', () => {
  const [candidate] = parseCvfIndex(fixture('cvf-index.html'), { conference: 'CVPR', year: 2025, baseUrl: 'https://openaccess.thecvf.com/CVPR2025?day=all' })
  const detailed = parseCvfPaper(fixture('cvf-paper.html'), candidate)
  assert.equal(candidate.title, 'Scalable Vision-Language Models & Mixture of Experts')
  assert.equal(detailed.doi, '10.1000/example')
  assert.match(detailed.abstract, /scalable vision-language architecture/i)
})

test('parses ECVA index and detail fixtures', () => {
  const [candidate] = parseEcvaIndex(fixture('ecva-index.html'))
  const detailed = parseEcvaPaper(fixture('ecva-paper.html'), candidate)
  assert.equal(candidate.conference, 'ECCV')
  assert.equal(candidate.year, 2024)
  assert.equal(detailed.doi, '10.1000/eccv')
  assert.deepEqual(detailed.authors, ['C. Researcher'])
})
