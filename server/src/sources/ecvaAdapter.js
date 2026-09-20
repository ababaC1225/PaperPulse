import { load } from 'cheerio'
import { SourceAdapter } from './sourceAdapter.js'
import { canonicalizeUrl, cleanDisplayText, normalizeTitle, normalizeYear } from '../domain/cleaning.js'

export function parseEcvaIndex(body, baseUrl = 'https://www.ecva.net/papers.php') {
  const $ = load(body)
  const results = []
  const seen = new Set()
  $('a[href]').each((_, element) => {
    const anchor = $(element)
    const href = anchor.attr('href') || ''
    if (!/(?:paper|papers|eccv).*\.(?:php|html?)|\/papers\//iu.test(href)) return
    const title = cleanDisplayText(anchor.text())
    if (title.length < 12 || /^(pdf|paper|supplementary)$/iu.test(title)) return
    const originalUrl = canonicalizeUrl(new URL(href, baseUrl).toString())
    const key = `${normalizeTitle(title)}|${originalUrl}`
    if (seen.has(key)) return
    seen.add(key)
    const context = cleanDisplayText(anchor.closest('li, tr, div, p').text())
    const year = normalizeYear(context) || normalizeYear(href)
    results.push({
      title,
      conference: 'ECCV',
      year,
      abstract: null,
      keywords: [],
      original_url: originalUrl,
      source_name: 'ecva',
      source_record_id: originalUrl ? new URL(originalUrl).pathname : null,
      doi: null,
      authors: []
    })
  })
  return results
}

export function parseEcvaPaper(body, candidate) {
  const $ = load(body)
  const abstract = cleanDisplayText($('#abstract, .abstract').first().text() || $('meta[name="description"]').attr('content')) || null
  const authors = $('meta[name="citation_author"]').map((_, element) => cleanDisplayText($(element).attr('content'))).get().filter(Boolean)
  const doi = cleanDisplayText($('meta[name="citation_doi"]').attr('content')).toLowerCase() || null
  return { ...candidate, abstract, authors: authors.length ? authors : candidate.authors, doi: doi || candidate.doi }
}

export class EcvaAdapter extends SourceAdapter {
  constructor(options) { super({ ...options, name: 'ecva' }) }

  async search(query, { limit = 20 } = {}) {
    const normalizedQuery = normalizeTitle(query)
    const url = 'https://www.ecva.net/papers.php'
    const response = await this.httpClient.get(url, { source: this.name })
    return parseEcvaIndex(response.body, url).filter((candidate) => {
      const title = normalizeTitle(candidate.title)
      return title.includes(normalizedQuery) || normalizedQuery.includes(title) || normalizedQuery.split(' ').every((token) => title.includes(token))
    }).slice(0, limit)
  }

  async fetchDetails(candidate) {
    if (!candidate.original_url) return candidate
    const response = await this.httpClient.get(candidate.original_url, { source: this.name })
    return parseEcvaPaper(response.body, candidate)
  }
}
