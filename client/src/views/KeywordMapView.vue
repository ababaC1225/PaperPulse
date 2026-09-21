<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRight, Minus, Plus, RefreshCw, RotateCcw } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import NetworkGraph from '@/components/NetworkGraph.vue'
import { paperApi } from '@/services/paperApi'

const selectedConference = ref('')
const selectedYear = ref('')
const maximumNodes = ref(20)
const minimumNodeCount = ref(1)
const minimumEdgeCount = ref(1)
const facets = ref({ conferences: [], years: [] })
const facetsLoaded = ref(false)
const network = ref(null)
const selectedId = ref('')
const topicDetail = ref(null)
const graphRef = ref(null)
const loading = ref(false)
const detailLoading = ref(false)
const hasLoaded = ref(false)
const networkError = ref('')
const detailError = ref('')
let networkRequestSequence = 0
let detailRequestSequence = 0

const nodes = computed(() => network.value?.nodes || [])
const links = computed(() => network.value?.links || [])
const selectedNode = computed(() => nodes.value.find((node) => node.id === selectedId.value) || null)
const initialLoading = computed(() => loading.value && !hasLoaded.value)
const refreshing = computed(() => loading.value && hasLoaded.value)
const emptyDatabase = computed(() => hasLoaded.value && network.value?.methodology.eligible_paper_total === 0)
const noThresholdNodes = computed(() => hasLoaded.value && network.value?.methodology.eligible_paper_total > 0 && nodes.value.length === 0)
const relatedKeywords = computed(() => {
  if (!selectedId.value) return []
  const nodeById = new Map(nodes.value.map((node) => [node.id, node]))
  return links.value
    .filter((link) => link.source === selectedId.value || link.target === selectedId.value)
    .map((link) => {
      const id = link.source === selectedId.value ? link.target : link.source
      return { ...nodeById.get(id), ...link, id }
    })
    .sort((left, right) => (
      right.cooccurrence_count - left.cooccurrence_count
      || right.jaccard_similarity - left.jaccard_similarity
      || right.paper_count - left.paper_count
      || (left.topic < right.topic ? -1 : left.topic > right.topic ? 1 : 0)
    ))
})

function scopeParams() {
  return { conference: selectedConference.value, year: selectedYear.value }
}

function networkParams() {
  return {
    ...scopeParams(),
    max_nodes: maximumNodes.value,
    min_node_count: minimumNodeCount.value,
    min_edge_count: minimumEdgeCount.value,
    max_edges: 150
  }
}

function growthLabel(value, year) {
  if (!year || value == null) return 'No baseline'
  return `${value > 0 ? '+' : ''}${value}% vs ${year - 1}`
}

function formatAuthors(authors) {
  return Array.isArray(authors) && authors.length ? authors.join(', ') : 'Not available'
}

async function loadTopicDetail(topic) {
  const requestId = ++detailRequestSequence
  detailLoading.value = true
  detailError.value = ''
  try {
    const result = await paperApi.topicDetail(topic, { ...scopeParams(), paper_limit: 5 })
    if (requestId !== detailRequestSequence || selectedId.value !== topic) return
    topicDetail.value = result
  } catch (error) {
    if (requestId !== detailRequestSequence) return
    detailError.value = `Unable to load keyword evidence: ${error.message}`
  } finally {
    if (requestId === detailRequestSequence) detailLoading.value = false
  }
}

async function loadNetwork({ includeFacets = false } = {}) {
  const requestId = ++networkRequestSequence
  detailRequestSequence += 1
  loading.value = true
  networkError.value = ''
  try {
    const requests = [paperApi.keywordNetwork(networkParams())]
    if (includeFacets) requests.push(paperApi.facets())
    const [result, facetResult] = await Promise.all(requests)
    if (requestId !== networkRequestSequence) return
    network.value = result
    if (facetResult) {
      facets.value = facetResult
      facetsLoaded.value = true
    }
    hasLoaded.value = true
    const nextId = result.nodes.some((node) => node.id === selectedId.value)
      ? selectedId.value
      : result.nodes[0]?.id || ''
    if (nextId !== selectedId.value) topicDetail.value = null
    selectedId.value = nextId
    if (nextId) loadTopicDetail(nextId)
    else {
      topicDetail.value = null
      detailError.value = ''
    }
  } catch (error) {
    if (requestId !== networkRequestSequence) return
    networkError.value = `Unable to load the keyword network: ${error.message}`
  } finally {
    if (requestId === networkRequestSequence) loading.value = false
  }
}

function refreshNetwork() {
  loadNetwork({ includeFacets: !facetsLoaded.value })
}

function selectNode(id) {
  if (id === selectedId.value && topicDetail.value) return
  selectedId.value = id
  topicDetail.value = null
  loadTopicDetail(id)
}

function clearSelection() {
  detailRequestSequence += 1
  selectedId.value = ''
  topicDetail.value = null
  detailError.value = ''
  detailLoading.value = false
}

function resetView() {
  graphRef.value?.resetView()
}

function resetFilters() {
  selectedConference.value = ''
  selectedYear.value = ''
  maximumNodes.value = 20
  minimumNodeCount.value = 1
  minimumEdgeCount.value = 1
  graphRef.value?.resetView()
  refreshNetwork()
}

onMounted(() => loadNetwork({ includeFacets: true }))
onBeforeUnmount(() => {
  networkRequestSequence += 1
  detailRequestSequence += 1
})
</script>

<template>
  <div class="screen-page keyword-map-page">
    <TopBar />

    <div class="page-head">
      <div>
        <h1>Keyword Map</h1>
        <p class="subtitle">Explore explainable co-occurrence among normalized keywords in eligible papers.</p>
      </div>
    </div>

    <section class="map-toolbar" aria-label="Keyword network filters">
      <label><span>Conference</span><select v-model="selectedConference" :disabled="initialLoading" @change="refreshNetwork"><option value="">All conferences</option><option value="CVPR">CVPR</option><option value="ICCV">ICCV</option><option value="ECCV">ECCV</option></select></label>
      <label><span>Year</span><select v-model="selectedYear" :disabled="initialLoading" @change="refreshNetwork"><option value="">All years</option><option v-for="year in facets.years" :key="year" :value="year">{{ year }}</option></select></label>
      <label><span>Maximum nodes</span><select v-model.number="maximumNodes" :disabled="initialLoading" @change="refreshNetwork"><option :value="10">10</option><option :value="20">20</option><option :value="30">30</option><option :value="50">50</option></select></label>
      <label><span>Minimum node count</span><input v-model.number="minimumNodeCount" type="number" min="1" step="1" :disabled="initialLoading" @change="refreshNetwork" /></label>
      <label><span>Minimum edge count</span><input v-model.number="minimumEdgeCount" type="number" min="1" step="1" :disabled="initialLoading" @change="refreshNetwork" /></label>
      <button class="reset-filters" type="button" @click="resetFilters">Reset filters</button>
    </section>

    <div v-if="networkError" class="page-message error" role="alert">
      <span>{{ networkError }}</span>
      <button type="button" @click="refreshNetwork"><RefreshCw :size="15" /> Retry</button>
    </div>
    <div v-else-if="refreshing" class="page-message refreshing" role="status"><RefreshCw :size="15" /> Updating network…</div>

    <div class="map-layout">
      <section class="card network-panel" :aria-busy="loading">
        <header class="panel-heading">
          <div>
            <h2>Research keyword network</h2>
            <p>Node size = distinct paper count · Edge width = co-occurrence count</p>
          </div>
          <div class="zoom-controls" aria-label="Graph view controls">
            <button class="icon-control" type="button" title="Zoom out" aria-label="Zoom out" @click="graphRef?.zoomOut()"><Minus :size="18" /></button>
            <button class="icon-control" type="button" title="Zoom in" aria-label="Zoom in" @click="graphRef?.zoomIn()"><Plus :size="18" /></button>
            <button class="reset-control" type="button" @click="resetView"><RotateCcw :size="15" /> Reset view</button>
          </div>
        </header>

        <div v-if="initialLoading" class="network-state" role="status">Loading live keyword relationships…</div>
        <div v-else-if="emptyDatabase" class="network-state"><strong>No eligible papers are stored.</strong><span>Import papers with abstracts and keywords to build the network.</span></div>
        <div v-else-if="noThresholdNodes" class="network-state"><strong>No keywords meet these thresholds.</strong><span>Lower the minimum node count or reset the filters.</span></div>
        <NetworkGraph v-else ref="graphRef" :nodes="nodes" :links="links" :selected-id="selectedId" @select="selectNode" @reset="clearSelection" />
        <p v-if="nodes.length && !links.length" class="edge-note">The selected nodes have no edges meeting the current minimum co-occurrence count.</p>
        <p v-if="network" class="panel-footnote">{{ network.methodology.causality_warning }}</p>
      </section>

      <aside class="card detail-panel">
        <div v-if="!selectedNode" class="detail-state">Select a node to inspect its directly related keywords and supporting papers.</div>
        <div v-else-if="detailLoading && !topicDetail" class="detail-state" role="status">Loading keyword evidence…</div>
        <div v-else-if="detailError" class="detail-state error" role="alert"><span>{{ detailError }}</span><button type="button" @click="loadTopicDetail(selectedId)"><RefreshCw :size="15" /> Retry</button></div>
        <template v-else-if="topicDetail">
          <p class="eyebrow">Selected normalized keyword</p>
          <h2>{{ topicDetail.topic }}</h2>
          <div class="detail-metrics">
            <div><strong>{{ topicDetail.paper_count }}</strong><span>Papers</span></div>
            <div><strong>{{ topicDetail.share_percent }}%</strong><span>Eligible share</span></div>
          </div>
          <p class="detail-growth" :class="{ neutral: topicDetail.growth_percent == null, negative: topicDetail.growth_percent < 0 }">{{ growthLabel(topicDetail.growth_percent, topicDetail.scope.year) }}</p>
          <hr />
          <div class="detail-section-heading"><h3>Directly related</h3><span>{{ relatedKeywords.length }}</span></div>
          <div v-if="relatedKeywords.length" class="related-keywords">
            <button v-for="keyword in relatedKeywords" :key="keyword.id" type="button" @click="selectNode(keyword.id)">
              <span>{{ keyword.topic }}</span><strong>{{ keyword.cooccurrence_count }} shared {{ keyword.cooccurrence_count === 1 ? 'paper' : 'papers' }}</strong>
            </button>
          </div>
          <p v-else class="section-empty">No returned edges connect this keyword under the current threshold.</p>
          <div class="detail-section-heading papers-heading"><h3>Supporting papers</h3><span>{{ topicDetail.related_papers.length }}</span></div>
          <ul v-if="topicDetail.related_papers.length" class="related-papers">
            <li v-for="paper in topicDetail.related_papers" :key="paper.paper_id">
              <router-link :to="`/papers/${encodeURIComponent(paper.paper_id)}`">{{ paper.title }}</router-link>
              <span>{{ formatAuthors(paper.authors) }}</span>
            </li>
          </ul>
          <p v-else class="section-empty">No supporting papers match this scope.</p>
          <router-link v-if="topicDetail.related_papers[0]" class="dark-btn full-btn" :to="`/papers/${encodeURIComponent(topicDetail.related_papers[0].paper_id)}`">Open first supporting paper <ArrowRight :size="16" /></router-link>
        </template>
      </aside>
    </div>

    <section v-if="network" class="methodology-note" aria-labelledby="network-methodology-title">
      <h2 id="network-methodology-title">How to read this network</h2>
      <p>A node counts distinct eligible papers containing one normalized keyword. An edge counts distinct eligible papers containing both endpoint keywords. Jaccard similarity is shared-paper count divided by the number of papers containing either keyword. Nodes and edges are truncated by the selected thresholds and limits.</p>
      <strong>{{ network.methodology.causality_warning }}</strong>
    </section>
  </div>
</template>

<style scoped>
.keyword-map-page { max-width:100%; }
.page-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:18px; }
h1 { font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.map-toolbar { display:grid; grid-template-columns:150px 125px 150px 170px 170px auto; gap:12px; align-items:end; margin-bottom:16px; padding:15px 16px; border:1px solid var(--border); border-radius:14px; background:#fff; box-shadow:var(--shadow-sm); }
.map-toolbar label { display:grid; gap:6px; color:var(--text-secondary); font-size:12px; font-weight:700; }
.map-toolbar select, .map-toolbar input { width:100%; min-height:42px; padding:0 11px; border:1px solid var(--border); border-radius:10px; outline:0; color:var(--text-primary); background:#fff; font:inherit; font-size:14px; }
.map-toolbar select:focus, .map-toolbar input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(108,92,231,.1); }
.reset-filters { min-height:42px; padding:0 15px; border:1px solid var(--border); border-radius:10px; color:var(--text-secondary); font-size:14px; font-weight:700; }
.reset-filters:hover { color:var(--accent); border-color:#cfc4ff; background:var(--accent-soft); }
.page-message { display:flex; align-items:center; gap:8px; margin:0 0 16px; padding:9px 13px; border-radius:10px; font-size:14px; }
.page-message.error { justify-content:space-between; color:#a83d57; background:#ffedf2; }
.page-message button, .detail-state button { display:inline-flex; align-items:center; gap:5px; color:inherit; font-weight:700; }
.page-message.refreshing { color:var(--accent); background:var(--accent-soft); }
.page-message.refreshing svg { animation:spin .9s linear infinite; }
.map-layout { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:16px; min-height:720px; }
.network-panel { position:relative; display:flex; min-height:720px; flex-direction:column; padding:22px 22px 16px; overflow:hidden; }
.panel-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; z-index:2; }
.panel-heading h2, .detail-panel h2 { margin:0; font-family:var(--font-display); font-size:22px; font-weight:800; }
.panel-heading p { margin:4px 0 0; color:var(--text-secondary); font-size:13px; }
.zoom-controls { display:flex; align-items:center; gap:8px; }
.icon-control, .reset-control { display:inline-flex; min-height:38px; align-items:center; justify-content:center; gap:7px; border:1px solid var(--border); border-radius:9px; color:var(--text-secondary); background:#fff; }
.icon-control { width:40px; }
.reset-control { padding:0 12px; font-size:13px; font-weight:700; }
.icon-control:hover, .reset-control:hover { color:var(--accent); border-color:var(--accent); }
.network-panel :deep(.network-graph) { flex:1; min-height:590px; margin-top:4px; }
.network-state { display:flex; min-height:580px; flex-direction:column; align-items:center; justify-content:center; gap:7px; color:var(--text-secondary); text-align:center; font-size:14px; }
.network-state strong { color:var(--text-primary); font-size:16px; }
.edge-note { margin:0 0 7px; padding:8px 10px; border-radius:8px; color:#876614; background:#fff8e7; font-size:12px; text-align:center; }
.panel-footnote { margin:0; color:var(--text-muted); font-size:12px; text-align:center; }
.detail-panel { min-height:720px; padding:24px; overflow:hidden; }
.detail-state { display:flex; min-height:640px; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--text-secondary); text-align:center; font-size:14px; }
.detail-state.error { color:#a83d57; }
.eyebrow { margin:0 0 6px; color:var(--accent); font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
.detail-panel h2 { overflow-wrap:anywhere; }
.detail-metrics { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0 9px; }
.detail-metrics div { padding:12px; border:1px solid var(--border); border-radius:11px; background:#fbfbfe; }
.detail-metrics strong, .detail-metrics span { display:block; }
.detail-metrics strong { font-size:20px; }
.detail-metrics span { margin-top:3px; color:var(--text-muted); font-size:10px; font-weight:800; text-transform:uppercase; }
.detail-growth { margin:0; color:var(--green); font-size:13px; font-weight:700; }
.detail-growth.neutral { color:var(--text-muted); }
.detail-growth.negative { color:#cf6077; }
.detail-panel hr { margin:18px 0; border:0; border-top:1px solid var(--border); }
.detail-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:9px; }
.detail-section-heading h3 { margin:0; font-size:14px; }
.detail-section-heading span { color:var(--text-muted); font-size:12px; }
.related-keywords { display:grid; gap:6px; max-height:150px; overflow:auto; }
.related-keywords button { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:8px 10px; border-radius:8px; color:var(--text-primary); background:#f7f7fb; text-align:left; }
.related-keywords button:hover { color:var(--accent); background:var(--accent-soft); }
.related-keywords span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.related-keywords strong { flex-shrink:0; color:var(--text-secondary); font-size:10px; }
.papers-heading { margin-top:18px; }
.related-papers { display:grid; gap:10px; max-height:180px; margin:0; padding:0; overflow:auto; list-style:none; }
.related-papers li { display:grid; gap:3px; }
.related-papers a { overflow:hidden; color:var(--text-primary); font-size:12px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.related-papers a:hover { color:var(--accent); }
.related-papers span { overflow:hidden; color:var(--text-muted); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
.section-empty { margin:5px 0; color:var(--text-muted); font-size:12px; line-height:1.45; }
.dark-btn { display:inline-flex; min-height:42px; align-items:center; justify-content:center; gap:8px; padding:0 15px; border-radius:10px; color:#fff; background:var(--text-primary); font-size:12px; font-weight:700; }
.dark-btn:hover { background:var(--accent); }
.full-btn { width:100%; margin-top:17px; }
.methodology-note { margin-top:16px; padding:18px 20px; border:1px solid #ddd6ff; border-radius:13px; color:var(--text-secondary); background:#faf9ff; }
.methodology-note h2 { margin:0 0 6px; color:var(--text-primary); font-size:15px; }
.methodology-note p { margin:0 0 7px; font-size:13px; line-height:1.55; }
.methodology-note strong { color:#6f5ac5; font-size:12px; }
@keyframes spin { to { transform:rotate(360deg); } }
@media (max-width:1250px) { .map-toolbar { grid-template-columns:repeat(3,1fr); } .map-layout { grid-template-columns:minmax(0,1fr) 320px; } }
@media (max-width:1000px) { .map-layout { grid-template-columns:1fr; } .detail-panel { min-height:auto; } .detail-state { min-height:240px; } }
@media (max-width:680px) { .map-toolbar { grid-template-columns:1fr 1fr; } .panel-heading { align-items:flex-start; flex-direction:column; } .network-panel { padding:18px; } .map-layout { min-height:0; } }
@media (max-width:480px) { .map-toolbar { grid-template-columns:1fr; } }
</style>
