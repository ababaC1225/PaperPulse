import { load } from 'cheerio'

const CONFERENCE_ALIASES = new Map([
  ['cvpr', 'CVPR'],
  ['computer vision and pattern recognition', 'CVPR'],
  ['ieee conference on computer vision and pattern recognition', 'CVPR'],
  ['iccv', 'ICCV'],
  ['international conference on computer vision', 'ICCV'],
  ['ieee international conference on computer vision', 'ICCV'],
  ['eccv', 'ECCV'],
  ['european conference on computer vision', 'ECCV'],
  ['computer vision eccv', 'ECCV']
])

const REQUIRED_ANALYSIS_FIELDS = ['abstract', 'keywords']
const REQUIRED_COMPLETE_FIELDS = ['title', 'conference', 'year', 'abstract', 'keywords', 'original_url']

function asString(value) {
  if (value == null) return ''
  return String(value)
}

export function decodeAndStripMarkup(value) {
  const source = asString(value)
  if (!source.trim()) return ''
  const $ = load(`<body>${source}</body>`, { decodeEntities: true })
  $('script, style, noscript').remove()
  return $('body').text()
}

export function normalizeUnicode(value) {
  return asString(value).normalize('NFKC')
}

export function normalizeWhitespace(value) {
  return asString(value).replace(/[\u0000-\u001F\u007F\u00A0\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]+/gu, ' ').replace(/\s+/gu, ' ').trim()
}

export function normalizePunctuation(value) {
  return asString(value)
    .replace(/[‐‑‒–—―−]/gu, '-')
    .replace(/[“”„‟]/gu, '"')
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/\s*([,:;!?])\s*/gu, '$1 ')
    .replace(/\s*([()\[\]{}])\s*/gu, ' $1 ')
}

export function cleanDisplayText(value) {
  return normalizeWhitespace(normalizePunctuation(normalizeUnicode(decodeAndStripMarkup(value))))
}

export function cleanTitle(value) {
  return cleanDisplayText(value)
}

export function normalizeTitle(value) {
  return cleanTitle(value)
    .toLocaleLowerCase('en-US')
    .replace(/&/gu, ' and ')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function canonicalizeConference(value) {
  const cleaned = normalizeTitle(value)
  if (!cleaned) return null
  if (CONFERENCE_ALIASES.has(cleaned)) return CONFERENCE_ALIASES.get(cleaned)
  for (const [alias, canonical] of CONFERENCE_ALIASES) {
    if (cleaned.includes(alias)) return canonical
  }
  return null
}

export function normalizeYear(value, { min = 1950, max = new Date().getUTCFullYear() + 1 } = {}) {
  const match = asString(value).match(/(?:19|20)\d{2}/u)
  if (!match) return null
  const year = Number.parseInt(match[0], 10)
  return year >= min && year <= max ? year : null
}

export function cleanAbstract(value) {
  const cleaned = cleanDisplayText(value)
  return cleaned || null
}

export function simpleWordForm(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 5 && token.endsWith('sses')) return token.slice(0, -2)
  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function keywordInputs(value) {
  if (Array.isArray(value)) return value.flatMap((entry) => keywordInputs(entry))
  if (value == null) return []
  return asString(value).split(/[;,|\n]+/gu)
}

export function normalizeKeywords(value, {
  generalStopwords = [],
  cvStopwords = [],
  synonyms = {},
  wordNormalizer = simpleWordForm
} = {}) {
  const stopwords = new Set([...generalStopwords, ...cvStopwords].map((word) => normalizeTitle(word)))
  const synonymMap = new Map(Object.entries(synonyms).map(([key, replacement]) => [normalizeTitle(key), normalizeTitle(replacement)]))
  const seen = new Set()
  const result = []

  for (const entry of keywordInputs(value)) {
    let phrase = normalizeTitle(entry)
    if (!phrase) continue
    phrase = synonymMap.get(phrase) || phrase
    const tokens = phrase.split(' ')
      .map((token) => synonymMap.get(token) || wordNormalizer(token))
      .filter((token) => token && !stopwords.has(token))
    phrase = normalizeWhitespace(tokens.join(' '))
    if (!phrase || stopwords.has(phrase) || seen.has(phrase)) continue
    seen.add(phrase)
    result.push(phrase)
  }
  return result
}

export function canonicalizeUrl(value) {
  if (!value) return null
  try {
    const url = new URL(String(value))
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$)/iu.test(key)) url.searchParams.delete(key)
    }
    url.hostname = url.hostname.toLowerCase()
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/u, '')
    return url.toString()
  } catch {
    return null
  }
}

function cleanAuthors(value) {
  const values = Array.isArray(value) ? value : value ? asString(value).split(/[,;]+/u) : []
  const seen = new Set()
  return values.map(cleanDisplayText).filter((author) => {
    const key = author.toLocaleLowerCase('en-US')
    if (!author || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function missingFieldsFor(record, requiredFields = REQUIRED_COMPLETE_FIELDS) {
  return requiredFields.filter((field) => {
    const value = record[field]
    return value == null || value === '' || (Array.isArray(value) && value.length === 0)
  })
}

export function analysisEligibility(record, requiredFields = REQUIRED_ANALYSIS_FIELDS) {
  const missing = missingFieldsFor(record, requiredFields)
  return {
    eligible: missing.length === 0 && record.data_status !== 'fetch_failed',
    excluded_for: missing.length ? missing : record.data_status === 'fetch_failed' ? ['fetch_failed'] : []
  }
}

export function cleanPaperRecord(input, options = {}) {
  const title = cleanTitle(input.title)
  const normalizedTitle = normalizeTitle(title)
  const conference = canonicalizeConference(input.conference || input.venue)
  const year = normalizeYear(input.year)
  const abstract = cleanAbstract(input.abstract)
  const keywords = normalizeKeywords(input.keywords, options)
  const originalUrl = canonicalizeUrl(input.original_url || input.originalUrl || input.url)
  const doi = cleanDisplayText(input.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '').toLowerCase() || null
  const sourceName = cleanDisplayText(input.source_name || input.sourceName).toLowerCase() || null
  const sourceRecordId = cleanDisplayText(input.source_record_id || input.sourceRecordId) || null
  const authors = cleanAuthors(input.authors)
  const retrievalError = input.retrieval_error ? cleanDisplayText(input.retrieval_error) : null

  const record = {
    title,
    normalized_title: normalizedTitle,
    conference,
    year,
    abstract,
    keywords,
    original_url: originalUrl,
    canonical_url: originalUrl,
    source_name: sourceName,
    source_record_id: sourceRecordId,
    doi,
    authors,
    retrieval_error: retrievalError,
    retrieved_at: input.retrieved_at || new Date().toISOString()
  }
  record.missing_fields = missingFieldsFor(record)
  record.data_status = retrievalError ? 'fetch_failed' : record.missing_fields.length ? 'missing_fields' : 'complete'
  Object.assign(record, analysisEligibility(record))
  return record
}
