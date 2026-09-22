import test from 'node:test'
import assert from 'node:assert/strict'
import { extractKeywords } from '../src/domain/keywordExtraction.js'
import { cleanPaperRecord } from '../src/domain/cleaning.js'
import { PaperRepository } from '../src/persistence/paperRepository.js'
import { DEMO_COHORTS, selectSample } from '../src/demoDataset.js'
import { parseEcvaIndex, parseEcvaPaper } from '../src/sources/ecvaAdapter.js'
import { PaperCrudService } from '../src/services/paperCrudService.js'
import { loadConfig } from '../src/config.js'

const abstract = 'Semantic segmentation assigns a label to every pixel in an image. Semantic segmentation requires spatial context and visual features. Our experiments explore spatial context for accurate semantic segmentation across diverse images and challenging scenes.'
const input = { title: 'Semantic Segmentation with Spatial Context', abstract, conference: 'CVPR', year: 2023, original_url: 'https://example.test/segmentation' }

test('TextRank is deterministic, bounded, grounded in text and ranks repeated subject phrases', () => {
  const terms = extractKeywords(input)
  assert.deepEqual(terms, extractKeywords(input))
  assert.ok(terms.length > 0 && terms.length <= 8)
  assert.ok(terms.some((x) => x.phrase.includes('semantic segmentation')))
  for (const term of terms) {
    assert.ok(`${input.title} ${abstract}`.toLowerCase().includes(term.phrase))
    assert.ok(Number.isFinite(term.score) && term.score > 0)
  }

  const configured = cleanPaperRecord({
    ...input,
    title: 'VLM Visual Reasoning',
    abstract: 'VLM visual reasoning connects language and images. VLM visual reasoning aligns language with images. VLM systems improve visual reasoning over images through language guidance. VLM representations support visual recognition and reasoning for complex images.'
  }, {
    cvStopwords: ['visual'],
    synonyms: { vlm: 'vision language model' }
  })
  assert.ok(configured.keywords.includes('vision language model'))
  assert.ok(configured.keywords.every((keyword) => !keyword.split(' ').includes('visual')))
  assert.equal(new Set(configured.keywords).size, configured.keywords.length)
})

test('cleaning derives missing keywords and keeps missing abstracts excluded', () => {
  const paper = cleanPaperRecord(input)
  assert.equal(paper.eligible, true)
  assert.equal(paper.keyword_provenance.method, 'textrank-v1')
  assert.deepEqual(cleanPaperRecord(paper).keywords, paper.keywords)
  const missing = cleanPaperRecord({ ...input, abstract: null })
  assert.equal(missing.eligible, false)
  assert.deepEqual(missing.keywords, [])
  assert.deepEqual(extractKeywords({ title: 'A', abstract: 'the and or' }), [])
  assert.deepEqual(extractKeywords({ title: { malformed: true }, abstract: { malformed: true } }), [])
  assert.deepEqual(extractKeywords({}), [])
})

test('supplied keywords take precedence and provenance survives persistence', () => {
  const repository = new PaperRepository()
  try {
    const provided = cleanPaperRecord({ ...input, keywords: ['Human Verified'] })
    assert.deepEqual(provided.keywords, ['human verified'])
    assert.equal(provided.keyword_provenance.method, 'provided')
    const derived = repository.insertPaper(cleanPaperRecord(input))
    const storedProvenance = repository.getPaper(derived.paper_id).keyword_provenance
    assert.equal(storedProvenance.method, 'textrank-v1')
    assert.deepEqual(storedProvenance.fields, ['title', 'abstract'])
    assert.ok(storedProvenance.candidates.every((candidate) => Number.isFinite(candidate.score)))
    const changed = cleanPaperRecord({ ...derived, abstract: null })
    repository.updatePaper(derived.paper_id, changed)
    assert.equal(repository.getPaper(derived.paper_id).eligible, false)
    assert.deepEqual(repository.getPaper(derived.paper_id).keywords, [])
  } finally { repository.close() }
})

test('demo sampling is stable across input order and removes duplicate URLs', () => {
  assert.deepEqual(DEMO_COHORTS, [['CVPR', 2023], ['CVPR', 2024], ['ICCV', 2021], ['ICCV', 2023], ['ECCV', 2022], ['ECCV', 2024]])
  const records = ['a', 'b', 'c', 'a'].map((id) => ({ original_url: `https://example.test/${id}` }))
  assert.deepEqual(selectSample(records, 2), selectSample(records.reverse(), 2))
  assert.equal(selectSample(records, 10).length, 3)
})

test('ECVA uses the detail URL year in a mixed-edition parent and ignores PDF/index links', () => {
  const rows = parseEcvaIndex('<div>ECCV 2024 <a href="/papers/eccv_2022/papers_ECCV/html/19_ECCV_2022_paper.php">Real Earlier Edition Paper</a><a href="/papers.php">Conference Paper Index</a><a href="/papers/eccv_2022/papers_ECCV/papers/19.pdf">Download Paper PDF</a></div>')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].year, 2022)
})

test('editing derived text recomputes keywords; explicit manual keywords take precedence', () => {
  const repository = new PaperRepository()
  const logger = { child() { return this }, info() {} }
  const service = new PaperCrudService({ repository, config: loadConfig({}), logger })
  try {
    const created = service.create(input)
    const updated = service.update(created.paper_id, { abstract: null, keywords: created.keywords.join(', ') })
    assert.deepEqual(updated.keywords, [])
    assert.equal(updated.eligible, false)
    const manual = service.update(created.paper_id, { abstract, keywords: 'Custom Topic' })
    assert.deepEqual(manual.keywords, ['custom topic'])
    assert.equal(manual.keyword_provenance.method, 'manual')
  } finally { repository.close() }
})

test('ECVA detail reads visible authors and official DOI links without citation meta tags', () => {
  const paper = parseEcvaPaper('<div id="authors"><i>Alice Example, Bob Example</i>;</div><div id="abstract">Actual abstract</div><a href="https://link.springer.com/chapter/10.1007/example_25">DOI</a>', {})
  assert.deepEqual(paper.authors, ['Alice Example', 'Bob Example'])
  assert.equal(paper.doi, '10.1007/example_25')
})
