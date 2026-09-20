import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analysisEligibility,
  canonicalizeConference,
  cleanAbstract,
  cleanPaperRecord,
  cleanTitle,
  normalizeKeywords,
  normalizeTitle,
  normalizeYear
} from '../src/domain/cleaning.js'

test('cleans malformed HTML, entities, Unicode, whitespace, and punctuation deterministically', () => {
  const title = cleanTitle('  <b>Vision&nbsp;Models</b> — “Fast”\u2009 ')
  assert.equal(title, 'Vision Models - "Fast"')
  assert.equal(normalizeTitle(title), 'vision models fast')
  assert.equal(cleanAbstract('<p>A &amp; B <em>abstract'), 'A & B abstract')
})

test('canonicalizes supported conferences and validates years', () => {
  assert.equal(canonicalizeConference('IEEE Conference on Computer Vision and Pattern Recognition'), 'CVPR')
  assert.equal(canonicalizeConference('European Conference on Computer Vision (ECCV)'), 'ECCV')
  assert.equal(canonicalizeConference('NeurIPS'), null)
  assert.equal(normalizeYear('CVPR 2024'), 2024)
  assert.equal(normalizeYear('1800'), null)
  assert.equal(normalizeYear('not a year'), null)
})

test('normalizes, filters, maps, and deduplicates keywords', () => {
  const keywords = normalizeKeywords([' VLM ', 'vision-language', 'Papers', '', 'Results', 'VLM'], {
    generalStopwords: [],
    cvStopwords: ['paper', 'result'],
    synonyms: { vlm: 'vision language', 'vision-language': 'vision language' }
  })
  assert.deepEqual(keywords, ['vision language'])
})

test('represents missing content explicitly and exposes analysis exclusion', () => {
  const paper = cleanPaperRecord({ title: 'A Paper', conference: 'CVPR', year: 2024, url: 'https://example.test/paper' })
  assert.equal(paper.abstract, null)
  assert.deepEqual(paper.keywords, [])
  assert.equal(paper.data_status, 'missing_fields')
  assert.deepEqual(paper.missing_fields, ['abstract', 'keywords'])
  assert.deepEqual(analysisEligibility(paper), { eligible: false, excluded_for: ['abstract', 'keywords'] })
})
