import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsvTitles, parseImportPayload, parseTxtTitles } from '../src/domain/importParser.js'

test('parses quoted CSV and retains physical source row numbers', () => {
  const entries = parseCsvTitles('title,year\r\n"A paper, with comma",2024\r\n\r\nSecond paper,2025')
  assert.deepEqual(entries, [
    { row_number: 2, input_value: 'A paper, with comma' },
    { row_number: 4, input_value: 'Second paper' }
  ])
})

test('rejects malformed CSV and TXT input with clear validation errors', () => {
  assert.throws(() => parseCsvTitles('title\n"unclosed'), /unclosed quoted field/i)
  assert.throws(() => parseCsvTitles('title\n"closed"junk'), /unexpected character/i)
  assert.throws(() => parseTxtTitles('paper\u0000title'), /null bytes/i)
  assert.throws(() => parseImportPayload({ content: '  \n ', format: 'txt' }), /no non-empty/i)
})

test('ignores blanks and classifies repeated submission titles as duplicates', () => {
  const entries = parseImportPayload({ titles: ['A Paper', '', 'a-paper', 'Another'] })
  assert.equal(entries.length, 3)
  assert.equal(entries[1].status, 'duplicate')
  assert.equal(entries[1].row_number, 3)
})
