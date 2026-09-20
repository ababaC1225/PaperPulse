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

const jsonOptions = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
})

export const paperApi = {
  search(title) { return request('/api/papers/search', jsonOptions('POST', { title })) },
  confirm(candidateId) { return request(`/api/papers/search/${encodeURIComponent(candidateId)}/confirm`, { method: 'POST' }) },
  list(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value != null && value !== ''))
    return request(`/api/papers?${query}`)
  },
  get(paperId) { return request(`/api/papers/${encodeURIComponent(paperId)}`) },
  create(paper) { return request('/api/papers', jsonOptions('POST', paper)) },
  update(paperId, paper) { return request(`/api/papers/${encodeURIComponent(paperId)}`, jsonOptions('PATCH', paper)) },
  delete(paperId) { return request(`/api/papers/${encodeURIComponent(paperId)}`, { method: 'DELETE' }) },
  createImport(payload) { return request('/api/imports', jsonOptions('POST', payload)) },
  getImport(jobId) { return request(`/api/imports/${encodeURIComponent(jobId)}`) },
  retryImport(jobId) { return request(`/api/imports/${encodeURIComponent(jobId)}/retry`, { method: 'POST' }) }
}
