import { load } from 'cheerio'
import { SourceAdapter } from './sourceAdapter.js'
import { canonicalizeUrl, cleanDisplayText, normalizeTitle } from '../domain/cleaning.js'

function absoluteUrl(href, base) {
  try { return canonicalizeUrl(new URL(href, base).toString()) } catch { return null }
}

export function parseCvfIndex(body, { conference, year, baseUrl }) {
  const $ = load(body)
  const results = []
  $('dt.ptitle, .ptitle').each((_, element) => {
    const anchor = $(element).find('a').first()
    const title = cleanDisplayText(anchor.text() || $(element).text())
    if (!title) return
    const authors = $(element).next('dd').find('a').map((__, author) => cleanDisplayText($(author).text())).get().filter(Boolean)
    const originalUrl = absoluteUrl(anchor.attr('href'), baseUrl)
    results.push({
      title,
      conference,
      year,
      abstract: null,
      keywords: [],
      original_url: originalUrl,
      source_name: 'cvf',
      source_record_id: originalUrl ? new URL(originalUrl).pathname : null,
      doi: null,
      authors
    })
  })
  return results
}

export function parseCvfPaper(body, candidate) {
  const $ = load(body)
  const abstract = cleanDisplayText($('#abstract').first().text() || $('meta[name="description"]').attr('content')) || null
  const authors = $('meta[name="citation_author"]').map((_, element) => cleanDisplayText($(element).attr('content'))).get().filter(Boolean)
  const bibtex = $('#bibtex pre, .bibref pre, pre').first().text()
  const doi = bibtex.match(/doi\s*=\s*[{"]([^}"]+)/iu)?.[1]?.trim().toLowerCase() || null
  return { ...candidate, abstract, authors: authors.length ? authors : candidate.authors, doi: doi || candidate.doi }
}

export class CvfAdapter extends SourceAdapter {
  constructor({ years, ...options }) {
    super({ ...options, name: 'cvf' })
    this.years = years
  }

  async search(query, { limit = 20 } = {}) {
    const normalizedQuery = normalizeTitle(query)
    const pages = []
    for (const year of this.years) {
      const conferences = year % 2 === 1 ? ['CVPR', 'ICCV'] : ['CVPR']
      for (const conference of conferences) {
        const baseUrl = `https://openaccess.thecvf.com/${conference}${year}?day=all`
        pages.push({ conference, year, baseUrl })
      }
    }
    const settled = await Promise.allSettled(pages.map(async (page) => {
      const response = await this.httpClient.get(page.baseUrl, { source: this.name })
      return parseCvfIndex(response.body, page)
    }))
    settled.forEach((result, index) => {
      if (result.status === 'rejected') this.logger.warn('source_index_failed', { url: pages[index].baseUrl, error: result.reason?.message })
    })
    if (settled.every((result) => result.status === 'rejected')) throw settled[0].reason
    const candidates = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      .filter((candidate) => {
        const title = normalizeTitle(candidate.title)
        return title.includes(normalizedQuery) || normalizedQuery.includes(title) || normalizedQuery.split(' ').every((token) => title.includes(token))
      })
    return candidates.slice(0, limit)
  }

  async fetchDetails(candidate) {
    if (!candidate.original_url) return candidate
    const response = await this.httpClient.get(candidate.original_url, { source: this.name })
    return parseCvfPaper(response.body, candidate)
  }
}
