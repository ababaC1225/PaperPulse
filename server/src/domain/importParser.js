import { normalizeTitle } from './cleaning.js'
import { ValidationError } from '../lib/errors.js'

function nonEmptyLines(value) {
  return String(value ?? '').replace(/^\uFEFF/u, '').split(/\r?\n/u)
}

export function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/u, '')
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        const next = source[index + 1]
        if (next && next !== ',' && next !== '\n' && next !== '\r') {
          throw new ValidationError('Malformed CSV: unexpected character after closing quote')
        }
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      if (field.length) throw new ValidationError('Malformed CSV: quote must start at the beginning of a field')
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (quoted) throw new ValidationError('Malformed CSV: unclosed quoted field')
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function titleColumnIndex(header) {
  return header.findIndex((value) => ['title', 'paper title', 'paper_title'].includes(normalizeTitle(value)))
}

export function parseCsvTitles(text) {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const headerIndex = titleColumnIndex(rows[0])
  const start = headerIndex >= 0 ? 1 : 0
  const column = headerIndex >= 0 ? headerIndex : 0
  return rows.slice(start).map((row, offset) => ({
    row_number: offset + start + 1,
    input_value: String(row[column] ?? '').trim()
  })).filter((entry) => entry.input_value)
}

export function parseTxtTitles(text) {
  if (String(text ?? '').includes('\u0000')) throw new ValidationError('Malformed TXT: null bytes are not allowed')
  return nonEmptyLines(text).map((line, index) => ({
    row_number: index + 1,
    input_value: line.trim()
  })).filter((entry) => entry.input_value)
}

function entriesFromJson(body) {
  if (Array.isArray(body)) return body.map((value, index) => ({ row_number: index + 1, input_value: String(value ?? '').trim() }))
  if (Array.isArray(body?.titles)) return body.titles.map((value, index) => ({ row_number: index + 1, input_value: String(value ?? '').trim() }))
  if (typeof body?.content === 'string') {
    const format = String(body.format || body.file_name?.split('.').pop() || 'txt').toLowerCase()
    if (!['csv', 'txt'].includes(format)) throw new ValidationError('Import format must be CSV or TXT')
    return format === 'csv' ? parseCsvTitles(body.content) : parseTxtTitles(body.content)
  }
  throw new ValidationError('Provide titles as an array or content as CSV/TXT text')
}

export function parseImportPayload(body, contentType = 'application/json', { maxBatchSize = 500 } = {}) {
  let entries
  if (typeof body === 'string') {
    entries = contentType.includes('csv') ? parseCsvTitles(body) : parseTxtTitles(body)
  } else {
    entries = entriesFromJson(body)
  }
  entries = entries.filter((entry) => entry.input_value)
  if (!entries.length) throw new ValidationError('Import contains no non-empty paper titles')
  if (entries.length > maxBatchSize) {
    throw new ValidationError(`Import exceeds the maximum of ${maxBatchSize} titles`, { count: entries.length, max: maxBatchSize })
  }

  const seen = new Set()
  return entries.map((entry) => {
    const normalized = normalizeTitle(entry.input_value)
    if (!normalized) {
      return { ...entry, normalized_input: '', status: 'failed', failure_reason: 'Title is empty after normalization', retry_eligible: false }
    }
    if (seen.has(normalized)) {
      return { ...entry, normalized_input: normalized, status: 'duplicate', failure_reason: 'Duplicate title in this submission', retry_eligible: false }
    }
    seen.add(normalized)
    return { ...entry, normalized_input: normalized, status: 'pending' }
  })
}
