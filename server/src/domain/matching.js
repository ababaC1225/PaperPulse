import crypto from 'node:crypto'
import { normalizeTitle } from './cleaning.js'

export function levenshteinDistance(left, right) {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[right.length]
}

function tokenJaccard(left, right) {
  const a = new Set(left.split(' ').filter(Boolean))
  const b = new Set(right.split(' ').filter(Boolean))
  const intersection = [...a].filter((token) => b.has(token)).length
  const union = new Set([...a, ...b]).size
  return union ? intersection / union : 0
}

export function titleSimilarity(query, candidate) {
  const left = normalizeTitle(query)
  const right = normalizeTitle(candidate)
  if (!left || !right) return 0
  if (left === right) return 1
  const edit = 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length)
  const tokens = tokenJaccard(left, right)
  const contains = left.includes(right) || right.includes(left) ? Math.min(left.length, right.length) / Math.max(left.length, right.length) : 0
  return Math.max(0, Math.min(1, edit * 0.55 + tokens * 0.35 + contains * 0.1))
}

function richness(candidate) {
  return ['conference', 'year', 'abstract', 'keywords', 'authors', 'doi', 'original_url']
    .reduce((count, field) => count + (candidate[field] && (!Array.isArray(candidate[field]) || candidate[field].length) ? 1 : 0), 0)
}

function sourcePriority(sourceName) {
  return { cvf: 5, ecva: 5, dblp: 2 }[sourceName] || 1
}

function equivalentKey(candidate) {
  if (candidate.doi) return `doi:${candidate.doi.toLowerCase()}`
  const title = candidate.normalized_title || normalizeTitle(candidate.title)
  return `${title}|${candidate.conference || ''}|${candidate.year || ''}`
}

export function candidateId(candidate) {
  const identity = `${candidate.source_name || ''}|${candidate.source_record_id || candidate.original_url || equivalentKey(candidate)}`
  return crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)
}

export function mergeAndRankCandidates(query, candidates, limit = 20) {
  const normalizedQuery = normalizeTitle(query)
  const groups = new Map()
  for (const input of candidates) {
    const candidate = { ...input, normalized_title: input.normalized_title || normalizeTitle(input.title) }
    if (!candidate.normalized_title) continue
    const key = equivalentKey(candidate)
    const current = groups.get(key)
    if (!current || richness(candidate) + sourcePriority(candidate.source_name) > richness(current) + sourcePriority(current.source_name)) {
      const replacement = { ...candidate }
      if (current) {
        for (const field of ['abstract', 'keywords', 'authors', 'doi', 'original_url', 'source_record_id']) {
          if ((!replacement[field] || (Array.isArray(replacement[field]) && !replacement[field].length)) && current[field]) replacement[field] = current[field]
        }
      }
      groups.set(key, { ...replacement, sources: [...new Set([...(current?.sources || []), current?.source_name, candidate.source_name].filter(Boolean))] })
    } else {
      current.sources = [...new Set([...(current.sources || []), candidate.source_name].filter(Boolean))]
      for (const field of ['abstract', 'keywords', 'authors', 'doi', 'original_url', 'source_record_id']) {
        if ((!current[field] || (Array.isArray(current[field]) && !current[field].length)) && candidate[field]) current[field] = candidate[field]
      }
    }
  }

  return [...groups.values()].map((candidate) => {
    const exact = candidate.normalized_title === normalizedQuery
    const score = titleSimilarity(normalizedQuery, candidate.normalized_title)
    const missing = ['conference', 'year', 'abstract', 'keywords', 'original_url']
      .filter((field) => !candidate[field] || (Array.isArray(candidate[field]) && !candidate[field].length))
    return {
      ...candidate,
      candidate_id: candidateId(candidate),
      exact_match: exact,
      match_score: Number(score.toFixed(4)),
      available_fields: ['title', 'conference', 'year', 'abstract', 'keywords', 'authors', 'doi', 'original_url']
        .filter((field) => candidate[field] && (!Array.isArray(candidate[field]) || candidate[field].length)),
      missing_fields: missing
    }
  }).sort((left, right) => {
    if (left.exact_match !== right.exact_match) return left.exact_match ? -1 : 1
    if (right.match_score !== left.match_score) return right.match_score - left.match_score
    return sourcePriority(right.source_name) - sourcePriority(left.source_name)
  }).slice(0, limit)
}
