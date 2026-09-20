import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeAndRankCandidates, titleSimilarity } from '../src/domain/matching.js'

test('ranks exact normalized titles before fuzzy matches', () => {
  const ranked = mergeAndRankCandidates('Vision-Language Models', [
    { title: 'Vision Language Model', conference: 'CVPR', year: 2024, source_name: 'dblp' },
    { title: 'Vision Language Models', conference: 'CVPR', year: 2024, source_name: 'cvf' }
  ])
  assert.equal(ranked[0].exact_match, true)
  assert.equal(ranked[0].source_name, 'cvf')
  assert.ok(titleSimilarity('vision language', 'vision-language model') > 0.65)
})

test('merges equivalent source records while retaining source provenance', () => {
  const ranked = mergeAndRankCandidates('A Great Paper', [
    { title: 'A Great Paper', conference: 'ECCV', year: 2024, source_name: 'dblp', doi: '10.1/x', authors: ['A'] },
    { title: 'A Great Paper', conference: 'ECCV', year: 2024, source_name: 'ecva', doi: '10.1/x', abstract: 'Details', original_url: 'https://example.test/x' }
  ])
  assert.equal(ranked.length, 1)
  assert.deepEqual(new Set(ranked[0].sources), new Set(['dblp', 'ecva']))
  assert.equal(ranked[0].abstract, 'Details')
})
