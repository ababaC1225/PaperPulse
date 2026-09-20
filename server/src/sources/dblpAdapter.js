import { SourceAdapter } from './sourceAdapter.js'
import { canonicalizeConference, canonicalizeUrl, cleanDisplayText, normalizeYear } from '../domain/cleaning.js'
import { SourceRequestError } from '../lib/errors.js'

function asArray(value) {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function parseAuthors(authors) {
  const values = asArray(authors?.author)
  return values.map((author) => cleanDisplayText(typeof author === 'string' ? author : author?.text)).filter(Boolean)
}

export function parseDblpResponse(body) {
  let payload
  try { payload = JSON.parse(body) } catch {
    throw new SourceRequestError('DBLP returned invalid JSON', { source: 'dblp', code: 'source_parse_failed', retryable: false })
  }
  const hits = asArray(payload?.result?.hits?.hit)
  return hits.map((hit) => {
    const info = hit?.info || {}
    const conference = canonicalizeConference(info.venue || info.type)
    const year = normalizeYear(info.year)
    return {
      title: cleanDisplayText(info.title),
      conference,
      year,
      abstract: null,
      keywords: [],
      original_url: canonicalizeUrl(info.ee || info.url),
      source_name: 'dblp',
      source_record_id: cleanDisplayText(info.key) || null,
      doi: cleanDisplayText(info.doi).toLowerCase() || null,
      authors: parseAuthors(info.authors)
    }
  }).filter((candidate) => candidate.title && ['CVPR', 'ICCV', 'ECCV'].includes(candidate.conference))
}

export class DblpAdapter extends SourceAdapter {
  constructor(options) { super({ ...options, name: 'dblp' }) }

  async search(query, { limit = 20 } = {}) {
    const url = new URL('https://dblp.org/search/publ/api')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('h', String(Math.min(100, Math.max(limit * 3, 30))))
    const response = await this.httpClient.get(url.toString(), { source: this.name, accept: 'application/json' })
    return parseDblpResponse(response.body).slice(0, limit)
  }
}
