<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import { paperApi } from '@/services/paperApi'

const route = useRoute()
const context = ref(null)
const loading = ref(false)
const loadError = ref('')
const notFound = ref(false)
let requestSequence = 0

const paper = computed(() => context.value?.paper || null)
const quality = computed(() => context.value?.data_quality || null)
const primaryTopic = computed(() => context.value?.primary_topic || null)
const authors = computed(() => paper.value?.authors?.length ? paper.value.authors.join(', ') : 'Not available')
const venue = computed(() => {
  if (!paper.value?.conference && !paper.value?.year) return 'Not available'
  return [paper.value.conference, paper.value.year].filter(Boolean).join(' · ')
})
const updated = computed(() => formatDate(paper.value?.updated_at))

function formatDate(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Not available'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(timestamp)
}

function formatStatus(value) {
  if (!value) return 'Not available'
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase())
}

function formatGrowth(value, year) {
  if (value == null || !year) return 'Not available'
  return `${value > 0 ? '+' : ''}${value}% vs ${year - 1}`
}

function topicRoute(topic) {
  const query = { query: topic }
  if (paper.value?.conference) query.conference = paper.value.conference
  if (paper.value?.year) query.year = paper.value.year
  return { name: 'hot-topics', query }
}

async function loadPaperContext(paperId) {
  const requestId = ++requestSequence
  loading.value = true
  loadError.value = ''
  notFound.value = false
  context.value = null
  document.title = 'Paper Detail - PaperPulse'
  try {
    const result = await paperApi.context(String(paperId))
    if (requestId !== requestSequence) return
    context.value = result
    document.title = `${result.paper.title} - PaperPulse`
  } catch (error) {
    if (requestId !== requestSequence) return
    notFound.value = error.status === 404
    loadError.value = error.message
    document.title = notFound.value ? 'Paper Not Found - PaperPulse' : 'Paper Detail Error - PaperPulse'
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

function retry() {
  loadPaperContext(route.params.id)
}

watch(() => route.params.id, loadPaperContext, { immediate: true })

onBeforeUnmount(() => {
  requestSequence += 1
})
</script>

<template>
  <div class="detail-page">
    <TopBar />

    <div class="page-head">
      <div>
        <h1>Paper Detail</h1>
        <p class="subtitle">Review stored metadata, data quality, and evidence-based reading paths.</p>
      </div>
    </div>

    <div class="detail-actions">
      <router-link class="back-link" to="/papers"><ArrowLeft :size="16" /> Back to Paper Library</router-link>
      <a v-if="paper?.original_url" class="dark-btn" :href="paper.original_url" target="_blank" rel="noreferrer">
        Open original paper <ArrowUpRight :size="16" />
      </a>
      <button v-else-if="paper" class="dark-btn" type="button" disabled>Original unavailable <ArrowUpRight :size="16" /></button>
    </div>

    <section v-if="loading" class="card page-state" role="status">
      <RefreshCw :size="22" />
      <strong>Loading paper context…</strong>
    </section>

    <section v-else-if="notFound" class="card page-state not-found" role="alert">
      <strong>Paper not found</strong>
      <p>No stored paper matches ID {{ route.params.id }}. No fallback paper has been displayed.</p>
      <router-link class="state-link" to="/papers">Return to Paper Library</router-link>
    </section>

    <section v-else-if="loadError" class="card page-state error" role="alert">
      <strong>Unable to load this paper</strong>
      <p>{{ loadError }}</p>
      <button class="state-link" type="button" @click="retry"><RefreshCw :size="15" /> Retry</button>
    </section>

    <template v-else-if="paper && context">
      <div class="detail-layout">
        <article class="card paper-detail-card">
          <div class="detail-tags">
            <span class="soft-pill violet">{{ venue }}</span>
            <span class="soft-pill neutral">{{ paper.paper_id }}</span>
            <span class="soft-pill" :class="quality.eligible ? 'green' : 'warning'">
              {{ quality.eligible ? 'Analysis eligible' : 'Excluded from analysis' }}
            </span>
          </div>

          <h2>{{ paper.title }}</h2>
          <p class="paper-meta">{{ authors }} · Updated {{ updated }}</p>

          <section class="quality-panel" :class="{ excluded: !quality.eligible }" aria-labelledby="quality-heading">
            <div>
              <p class="eyebrow" id="quality-heading">Data quality</p>
              <strong>{{ formatStatus(quality.status) }}</strong>
            </div>
            <div>
              <p class="eyebrow">Analysis status</p>
              <strong>{{ quality.eligible ? 'Eligible' : 'Not eligible' }}</strong>
            </div>
            <div>
              <p class="eyebrow">Missing or excluded for</p>
              <strong>{{ quality.excluded_for.length ? quality.excluded_for.map(formatStatus).join(', ') : 'None' }}</strong>
            </div>
          </section>

          <hr />
          <h3>Abstract</h3>
          <p class="abstract">{{ paper.abstract || 'Not available' }}</p>

          <h3>Normalized keywords</h3>
          <div v-if="paper.keywords.length" class="keyword-row">
            <router-link
              v-for="(keyword, index) in paper.keywords"
              :key="keyword"
              class="soft-pill keyword-link"
              :class="['violet', 'green', 'blue'][index % 3]"
              :to="topicRoute(keyword)"
            >{{ keyword }}</router-link>
          </div>
          <p v-else class="unavailable">Not available</p>

          <h3>Stored metadata</h3>
          <dl class="metadata-grid">
            <div><dt>Conference and year</dt><dd>{{ venue }}</dd></div>
            <div><dt>DOI</dt><dd>{{ paper.doi || 'Not available' }}</dd></div>
            <div><dt>Data source</dt><dd>{{ paper.source_name || 'Not available' }}</dd></div>
            <div><dt>Source record ID</dt><dd>{{ paper.source_record_id || 'Not available' }}</dd></div>
            <div><dt>Retrieved</dt><dd>{{ formatDate(paper.retrieved_at) }}</dd></div>
            <div><dt>Canonical URL</dt><dd class="break-value">{{ paper.canonical_url || 'Not available' }}</dd></div>
          </dl>

          <div v-if="quality.retrieval_error" class="retrieval-error">
            <strong>Retrieval error</strong>
            <span>{{ quality.retrieval_error }}</span>
          </div>
        </article>

        <aside class="context-card">
          <h2>Explore context</h2>
          <p class="context-intro">Calculated from eligible stored papers using exact normalized keywords.</p>

          <section class="context-section primary-section">
            <p class="eyebrow">Primary topic</p>
            <router-link v-if="primaryTopic" class="primary-topic" :to="topicRoute(primaryTopic.topic)">
              {{ primaryTopic.topic }} <ArrowRight :size="16" />
            </router-link>
            <p v-else class="unavailable compact">Not available</p>

            <div v-if="primaryTopic" class="topic-metrics">
              <div><span>Rank</span><strong>{{ primaryTopic.rank == null ? 'Not available' : `#${primaryTopic.rank}` }}</strong></div>
              <div><span>Papers</span><strong>{{ primaryTopic.paper_count ?? 'Not available' }}</strong></div>
              <div><span>Share</span><strong>{{ primaryTopic.share_percent == null ? 'Not available' : `${primaryTopic.share_percent}%` }}</strong></div>
              <div><span>Growth</span><strong>{{ formatGrowth(primaryTopic.growth_percent, primaryTopic.scope.year) }}</strong></div>
            </div>
          </section>

          <section class="context-section">
            <div class="section-heading"><h3>Related keywords</h3><span>{{ context.related_keywords.length }}</span></div>
            <div v-if="context.related_keywords.length" class="related-keywords">
              <router-link v-for="keyword in context.related_keywords" :key="keyword.topic" :to="topicRoute(keyword.topic)">
                <span>{{ keyword.topic }}</span>
                <strong>{{ keyword.cooccurrence_count }} shared {{ keyword.cooccurrence_count === 1 ? 'paper' : 'papers' }}</strong>
              </router-link>
            </div>
            <p v-else class="unavailable compact">Not available</p>
          </section>

          <section class="context-section">
            <div class="section-heading"><h3>Related papers</h3><span>{{ context.related_papers.length }}</span></div>
            <ul v-if="context.related_papers.length" class="related-papers">
              <li v-for="entry in context.related_papers" :key="entry.paper.paper_id">
                <router-link :to="{ name: 'paper-detail', params: { id: entry.paper.paper_id } }">
                  {{ entry.paper.title }}
                </router-link>
                <span>{{ entry.shared_keywords.join(', ') || 'Not available' }}</span>
              </li>
            </ul>
            <p v-else class="unavailable compact">Not available</p>
          </section>

          <p class="method-note">{{ context.methodology.warning }}</p>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-page { max-width:100%; }
.page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:10px; }
h1 { font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.detail-actions { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:24px; }
.back-link { display:inline-flex; align-items:center; gap:7px; color:var(--text-secondary); font-size:15px; }
.back-link:hover { color:var(--accent); }
.dark-btn, .state-link { display:inline-flex; min-height:42px; align-items:center; justify-content:center; gap:8px; padding:0 18px; border-radius:10px; font-size:14px; font-weight:750; }
.dark-btn { color:#fff; background:var(--text-primary); }
.dark-btn:hover:not(:disabled) { background:var(--accent); }
.dark-btn:disabled { cursor:not-allowed; opacity:.5; }
.page-state { display:flex; min-height:430px; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:30px; color:var(--text-secondary); text-align:center; }
.page-state > svg { color:var(--accent); animation:spin .9s linear infinite; }
.page-state strong { color:var(--text-primary); font-size:20px; }
.page-state p { max-width:560px; margin:0; }
.page-state.error strong { color:#a83d57; }
.state-link { margin-top:8px; border:1px solid var(--border); color:var(--text-primary); background:#fff; }
.state-link:hover { color:var(--accent); border-color:var(--accent); }
.detail-layout { display:grid; grid-template-columns:minmax(0,2.15fr) minmax(310px,1fr); gap:20px; align-items:start; }
.paper-detail-card { min-width:0; padding:28px 26px 34px; }
.detail-tags { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
.soft-pill { display:inline-flex; align-items:center; padding:5px 12px; border-radius:999px; font-size:12px; font-weight:700; }
.soft-pill.violet { color:#8064df; background:#efebff; }
.soft-pill.green { color:#238b69; background:#e3f8ef; }
.soft-pill.blue { color:#4f7fca; background:#e9f2ff; }
.soft-pill.neutral { color:var(--text-secondary); background:#f5f6fa; }
.soft-pill.warning { color:#936b12; background:#fff5d8; }
.paper-detail-card h2 { max-width:800px; margin:0; overflow-wrap:anywhere; font-family:var(--font-display); font-size:30px; line-height:1.2; }
.paper-meta { margin:11px 0 22px; color:var(--text-secondary); font-size:14px; }
.quality-panel { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:24px; padding:14px; border:1px solid #cfeee1; border-radius:12px; background:#f0fbf7; }
.quality-panel.excluded { border-color:#f0dfaf; background:#fffaf0; }
.quality-panel > div { min-width:0; }
.quality-panel strong { display:block; overflow-wrap:anywhere; font-size:13px; }
.eyebrow { margin:0 0 5px; color:var(--text-muted); font-size:10px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
.paper-detail-card hr { margin:0 0 25px; border:0; border-top:1px solid var(--border); }
.paper-detail-card h3 { margin:0 0 11px; font-size:16px; }
.abstract { max-width:820px; margin:0 0 28px; color:var(--text-secondary); font-size:15px; line-height:1.7; white-space:pre-wrap; }
.keyword-row { display:flex; flex-wrap:wrap; gap:9px; margin-bottom:28px; }
.keyword-link:hover { box-shadow:0 0 0 2px rgba(108,92,231,.12); transform:translateY(-1px); }
.unavailable { margin:0 0 28px; color:var(--text-muted); font-size:14px; }
.unavailable.compact { margin:5px 0 0; }
.metadata-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:0; }
.metadata-grid div { min-width:0; padding:12px 13px; border:1px solid var(--border); border-radius:10px; background:#fbfbfe; }
.metadata-grid dt { margin-bottom:4px; color:var(--text-muted); font-size:10px; font-weight:800; text-transform:uppercase; }
.metadata-grid dd { margin:0; color:var(--text-primary); font-size:13px; }
.break-value { overflow-wrap:anywhere; }
.retrieval-error { display:grid; gap:4px; margin-top:14px; padding:12px 13px; border-radius:10px; color:#a83d57; background:#ffedf2; font-size:13px; }
.context-card { min-width:0; padding:24px; border:1px solid #d4efe4; border-radius:var(--radius-card); background:#eaf9f2; box-shadow:var(--shadow-card); }
.context-card > h2 { margin:0; font-family:var(--font-display); font-size:22px; font-weight:800; }
.context-intro { margin:5px 0 20px; color:var(--text-secondary); font-size:12px; line-height:1.5; }
.context-section { padding:18px 0; border-top:1px solid #ccebdd; }
.context-section.primary-section { padding-top:0; border-top:0; }
.primary-topic { display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--text-primary); font-size:17px; font-weight:800; overflow-wrap:anywhere; }
.primary-topic:hover { color:var(--accent); }
.topic-metrics { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:15px; }
.topic-metrics div { min-width:0; padding:10px; border:1px solid rgba(32,173,132,.16); border-radius:9px; background:rgba(255,255,255,.65); }
.topic-metrics span, .topic-metrics strong { display:block; }
.topic-metrics span { color:var(--text-muted); font-size:9px; font-weight:800; text-transform:uppercase; }
.topic-metrics strong { margin-top:3px; overflow-wrap:anywhere; font-size:14px; }
.section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
.section-heading h3 { margin:0; font-size:14px; }
.section-heading > span { color:var(--text-muted); font-size:11px; }
.related-keywords { display:grid; gap:7px; }
.related-keywords a { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 10px; border-radius:8px; color:var(--text-primary); background:rgba(255,255,255,.68); font-size:12px; }
.related-keywords a:hover { color:var(--accent); background:#fff; }
.related-keywords span { min-width:0; overflow-wrap:anywhere; }
.related-keywords strong { flex:0 0 auto; color:var(--text-secondary); font-size:10px; }
.related-papers { display:grid; gap:11px; margin:0; padding:0; list-style:none; }
.related-papers li { display:grid; gap:3px; }
.related-papers a { color:var(--text-primary); font-size:12px; font-weight:700; line-height:1.4; }
.related-papers a:hover { color:var(--accent); }
.related-papers span { color:var(--text-muted); font-size:10px; }
.method-note { margin:4px 0 0; padding-top:16px; border-top:1px solid #ccebdd; color:var(--text-secondary); font-size:11px; line-height:1.5; }
@keyframes spin { to { transform:rotate(360deg); } }
@media (max-width:1050px) { .detail-layout { grid-template-columns:1fr; } }
@media (max-width:680px) { .detail-actions { align-items:flex-start; flex-direction:column; } .paper-detail-card, .context-card { padding:20px; } .paper-detail-card h2 { font-size:25px; } .quality-panel, .metadata-grid { grid-template-columns:1fr; } }
</style>
