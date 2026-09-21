async function request(path, options = {}) {
  const response = await fetch(path, options)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Request failed with status ${response.status}`)
    error.code = body?.error?.code
    error.status = response.status
    error.details = body?.error?.details
    error.retryable = body?.error?.retryable
    throw error
  }
  return body
}

/**
 * @typedef {Object} PaperTopicContext
 * @property {string} topic
 * @property {{ conference: string|null, year: number|null }} scope
 * @property {number|null} rank
 * @property {number|null} paper_count
 * @property {number|null} eligible_paper_total
 * @property {number|null} share_percent
 * @property {number|null} previous_paper_count
 * @property {number|null} growth_percent
 */

/**
 * @typedef {Object} PaperContextResponse
 * @property {Object} paper
 * @property {{ status: string, missing_fields: string[], retrieval_error: string|null, eligible: boolean, excluded_for: string[] }} data_quality
 * @property {PaperTopicContext|null} primary_topic
 * @property {Array<{ topic: string, paper_count: number, share_percent: number, cooccurrence_count: number, jaccard_similarity: number }>} related_keywords
 * @property {Array<{ paper: Object, shared_keywords: string[], shared_keyword_count: number, matches_primary_topic: boolean }>} related_papers
 * @property {Object} methodology
 */

const jsonOptions = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
})

function withQuery(path, params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value]
    for (const entry of values) {
      if (entry != null && entry !== '') query.append(key, entry)
    }
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

export const paperApi = {
  search(title) { return request('/api/papers/search', jsonOptions('POST', { title })) },
  confirm(candidateId) { return request(`/api/papers/search/${encodeURIComponent(candidateId)}/confirm`, { method: 'POST' }) },
  list(params = {}) { return request(withQuery('/api/papers', params)) },
  facets() { return request('/api/papers/facets') },
  recent(params = {}) { return request(withQuery('/api/papers/recent', params)) },
  overviewStats(params = {}) { return request(withQuery('/api/overview/stats', params)) },
  hotTopics(params = {}) { return request(withQuery('/api/topics/hot', params)) },
  keywordNetwork(params = {}) { return request(withQuery('/api/topics/network', params)) },
  topicTrends(params = {}) { return request(withQuery('/api/topics/trends', params)) },
  topicDetail(topic, params = {}) {
    return request(withQuery(`/api/topics/${encodeURIComponent(topic)}`, params))
  },
  get(paperId) { return request(`/api/papers/${encodeURIComponent(paperId)}`) },
  /** @param {string} paperId @returns {Promise<PaperContextResponse>} */
  context(paperId) { return request(`/api/papers/${encodeURIComponent(paperId)}/context`) },
  create(paper) { return request('/api/papers', jsonOptions('POST', paper)) },
  update(paperId, paper) { return request(`/api/papers/${encodeURIComponent(paperId)}`, jsonOptions('PATCH', paper)) },
  delete(paperId) { return request(`/api/papers/${encodeURIComponent(paperId)}`, { method: 'DELETE' }) },
  createImport(payload) { return request('/api/imports', jsonOptions('POST', payload)) },
  getImport(jobId) { return request(`/api/imports/${encodeURIComponent(jobId)}`) },
  retryImport(jobId) { return request(`/api/imports/${encodeURIComponent(jobId)}/retry`, { method: 'POST' }) }
}
