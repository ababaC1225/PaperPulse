// Deterministic weighted TextRank over words, followed by contiguous phrase ranking.
// Extracted phrases are observations from text, not publisher-supplied keywords.
export const EXTRACTOR_VERSION = 'textrank-v1'
const STOP = new Set(('a an the and or but if then than of to in on at by for with from as is are was were be been being it its this that these those we our us you your they their them he she his her which who what when where how not no all any both each other such also can could may might must will would should have has had do does did more most less many much using used use based proposed propose paper method methods approach approaches model models result results experiment experiments show shows shown demonstrate demonstrate new novel existing previous state art task tasks achieve performance effective efficient framework learning').split(' '))

function sentences(text, stopwords) {
  return String(text || '').normalize('NFKC').toLowerCase().split(/[.!?;:\n]+/u)
    .map((sentence) => (sentence.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)*/gu) || [])
      .map((word) => stopwords.has(word) || word.length < 3 ? null : word.replaceAll('-', ' ')))
}

export function extractKeywords({ title, abstract }, { limit = 8, generalStopwords = [], cvStopwords = [] } = {}) {
  const stops = new Set([...STOP, ...generalStopwords, ...cvStopwords])
  // Preserve this domain term in phrases such as reinforcement/machine learning.
  if (!generalStopwords.includes('learning') && !cvStopwords.includes('learning')) stops.delete('learning')
  // Very short or absent abstracts are insufficient evidence for automatic analysis.
  if ((String(abstract || '').match(/[a-z]+/giu) || []).length < 20) return []
  const groups = [...sentences(title, stops), ...sentences(abstract, stops)]
  const graph = new Map()
  for (const words of groups) {
    for (let i = 0; i < words.length; i++) {
      const a = words[i]
      if (!a) continue
      if (!graph.has(a)) graph.set(a, new Map())
      for (let j = i + 1; j < Math.min(i + 5, words.length); j++) {
        const b = words[j]
        if (!b || a === b) continue
        if (!graph.has(b)) graph.set(b, new Map())
        graph.get(a).set(b, (graph.get(a).get(b) || 0) + 1)
        graph.get(b).set(a, (graph.get(b).get(a) || 0) + 1)
      }
    }
  }
  if (!graph.size) return []
  const totals = new Map([...graph].map(([word, edges]) => [word, [...edges.values()].reduce((a, b) => a + b, 0)]))
  let scores = new Map([...graph.keys()].map((word) => [word, 1 / graph.size]))
  for (let iteration = 0; iteration < 100; iteration++) {
    const dangling = [...scores].reduce((sum, [word, score]) => sum + (totals.get(word) ? 0 : score), 0)
    const next = new Map()
    let delta = 0
    for (const [word, edges] of graph) {
      let rank = (1 - 0.85 + 0.85 * dangling) / graph.size
      for (const [neighbor, weight] of edges) rank += 0.85 * scores.get(neighbor) * weight / totals.get(neighbor)
      next.set(word, rank)
      delta += Math.abs(rank - scores.get(word))
    }
    scores = next
    if (delta < 1e-8) break
  }
  const titleWords = new Set(sentences(title, stops).flat().filter(Boolean))
  const candidates = new Map()
  for (const words of groups) {
    for (let i = 0; i < words.length; i++) {
      if (!words[i]) continue
      for (let size = 1; size <= 3 && i + size <= words.length; size++) {
        const tokens = words.slice(i, i + size)
        if (tokens.includes(null)) break
        const phrase = tokens.join(' ')
        const score = tokens.reduce((sum, word) => sum + scores.get(word), 0) / Math.sqrt(size)
          * (tokens.every((word) => titleWords.has(word)) ? 1.5 : 1)
        candidates.set(phrase, Math.max(candidates.get(phrase) || 0, score))
      }
    }
  }
  const selected = []
  for (const [phrase, score] of [...candidates].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'))) {
    if (selected.some((item) => ` ${item.phrase} `.includes(` ${phrase} `) || ` ${phrase} `.includes(` ${item.phrase} `))) continue
    selected.push({ phrase, score: Number(score.toFixed(8)) })
    if (selected.length >= limit) break
  }
  return selected
}
