<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Pause, Play, RefreshCw, RotateCcw, X } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import TrendStepChart from '@/components/TrendStepChart.vue'
import { paperApi } from '@/services/paperApi'

const conferenceOptions = ['CVPR', 'ICCV', 'ECCV']
const currentYear = new Date().getUTCFullYear()
const response = ref(null)
const facets = ref({ conferences: [], years: [] })
const candidateTopics = ref([])
const loading = ref(false)
const hasLoaded = ref(false)
const errorMessage = ref('')
const filterError = ref('')
const candidateLoading = ref(false)
const candidateError = ref('')
const playing = ref(false)
const visibleYear = ref(null)
const topicToAdd = ref('')
const draft = reactive({
  startYear: '',
  endYear: '',
  conferences: [],
  topics: [],
  metric: 'share'
})

let trendRequestSequence = 0
let candidateRequestSequence = 0
let candidateTimer = null
let playbackTimer = null
let lastTrendRequest = { params: {}, sync: true }

const initialLoading = computed(() => loading.value && !hasLoaded.value)
const refreshing = computed(() => loading.value && hasLoaded.value)
const availableCandidates = computed(() => candidateTopics.value.filter((item) => !draft.topics.includes(item.topic)))
const validPoints = computed(() => response.value?.series.flatMap((entry) => entry.points).filter((point) => point.has_data) || [])
const hasChartData = computed(() => response.value?.series.length > 0 && validPoints.value.length > 0)
const emptyDatabase = computed(() => hasLoaded.value && response.value?.scope.topics.length === 0 && response.value?.series.length === 0)
const someYearsUnavailable = computed(() => response.value?.series.some((entry) => entry.points.some((point) => !point.has_data)) || false)
const hasGenuineZero = computed(() => response.value?.series.some((entry) => entry.points.some((point) => point.has_data && point.paper_count === 0)) || false)
const unknownTopics = computed(() => response.value?.unknown_topics || [])
const animationYears = computed(() => response.value?.years || [])
const isLastYear = computed(() => animationYears.value.length > 0 && visibleYear.value === animationYears.value.at(-1))
const sourceLabel = computed(() => {
  const sources = response.value?.data_context?.source_names || []
  return sources.length ? sources.join(' · ') : 'Stored PaperPulse paper records'
})
const peak = computed(() => response.value?.summary?.peak || null)

function stopPlayback() {
  window.clearInterval(playbackTimer)
  playbackTimer = null
  playing.value = false
}

function resetVisibleYear() {
  stopPlayback()
  visibleYear.value = animationYears.value[0] ?? null
}

function advancePlayback() {
  const index = animationYears.value.indexOf(visibleYear.value)
  if (index < 0 || index >= animationYears.value.length - 1) {
    stopPlayback()
    return
  }
  visibleYear.value = animationYears.value[index + 1]
  if (visibleYear.value === animationYears.value.at(-1)) stopPlayback()
}

function play() {
  if (playing.value || animationYears.value.length < 2 || isLastYear.value) return
  playing.value = true
  playbackTimer = window.setInterval(advancePlayback, 900)
}

function pause() {
  stopPlayback()
}

function replay() {
  if (!animationYears.value.length) return
  stopPlayback()
  visibleYear.value = animationYears.value[0]
  if (animationYears.value.length > 1) {
    playing.value = true
    playbackTimer = window.setInterval(advancePlayback, 900)
  }
}

function syncDraft(result) {
  draft.startYear = String(result.scope.start_year)
  draft.endYear = String(result.scope.end_year)
  draft.conferences = [...result.scope.conferences]
  draft.topics = [...result.scope.topics]
  draft.metric = result.scope.metric
}

async function loadTrends(params = {}, { sync = false } = {}) {
  const requestId = ++trendRequestSequence
  lastTrendRequest = {
    params: Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])),
    sync
  }
  stopPlayback()
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await paperApi.topicTrends(params)
    if (requestId !== trendRequestSequence) return
    response.value = result
    hasLoaded.value = true
    if (sync) syncDraft(result)
    visibleYear.value = result.years[0] ?? null
  } catch (error) {
    if (requestId !== trendRequestSequence) return
    errorMessage.value = `Unable to load trend analysis: ${error.message}`
  } finally {
    if (requestId === trendRequestSequence) loading.value = false
  }
}

function retryTrends() {
  loadTrends(lastTrendRequest.params, { sync: lastTrendRequest.sync })
}

function validateDraft() {
  const startYear = Number(draft.startYear)
  const endYear = Number(draft.endYear)
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) return 'Choose a valid start and end year.'
  if (startYear > endYear) return 'Start year must not exceed end year.'
  if (endYear - startYear + 1 > 15) return 'The selected range cannot exceed 15 calendar years.'
  if (!draft.conferences.length) return 'Select at least one conference.'
  if (!draft.topics.length) return 'Select at least one topic.'
  if (draft.topics.length > 5) return 'Select no more than five topics.'
  return ''
}

function applyFilters() {
  filterError.value = validateDraft()
  if (filterError.value) return
  loadTrends({
    topic: draft.topics,
    conference: draft.conferences,
    start_year: draft.startYear,
    end_year: draft.endYear,
    metric: draft.metric
  })
}

async function resetFilters() {
  filterError.value = ''
  topicToAdd.value = ''
  await loadTrends({}, { sync: true })
}

function addTopic() {
  if (!topicToAdd.value || draft.topics.includes(topicToAdd.value) || draft.topics.length >= 5) return
  draft.topics.push(topicToAdd.value)
  topicToAdd.value = ''
  filterError.value = ''
}

function removeTopic(topic) {
  draft.topics = draft.topics.filter((item) => item !== topic)
}

async function loadTopicCandidates() {
  const startYear = Number(draft.startYear)
  const endYear = Number(draft.endYear)
  const conferences = [...draft.conferences]
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear || endYear - startYear + 1 > 15 || !conferences.length) return

  const requestId = ++candidateRequestSequence
  candidateLoading.value = true
  candidateError.value = ''
  try {
    const requests = []
    for (const conference of conferences) {
      for (let year = startYear; year <= endYear; year += 1) {
        requests.push(paperApi.hotTopics({ conference, year, sort: 'count', limit: 100 }))
      }
    }
    const results = await Promise.all(requests)
    if (requestId !== candidateRequestSequence) return
    const totals = new Map()
    for (const result of results) {
      for (const item of result.items) totals.set(item.topic, (totals.get(item.topic) || 0) + item.paper_count)
    }
    for (const topic of draft.topics) if (!totals.has(topic)) totals.set(topic, 0)
    candidateTopics.value = [...totals.entries()]
      .map(([topic, paperCount]) => ({ topic, paper_count: paperCount }))
      .sort((left, right) => right.paper_count - left.paper_count || left.topic.localeCompare(right.topic, 'en'))
  } catch (error) {
    if (requestId !== candidateRequestSequence) return
    candidateError.value = `Topic suggestions could not be refreshed: ${error.message}`
  } finally {
    if (requestId === candidateRequestSequence) candidateLoading.value = false
  }
}

function scheduleCandidateRefresh() {
  window.clearTimeout(candidateTimer)
  candidateTimer = window.setTimeout(loadTopicCandidates, 250)
}

function formatMetric(point) {
  if (!point) return 'Not available'
  return response.value.scope.metric === 'count'
    ? `${point.paper_count} papers`
    : `${point.share_percent}% share`
}

function formatTimestamp(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'No update timestamp available'
  return `Latest relevant update ${new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(timestamp)}`
}

watch(
  () => [draft.startYear, draft.endYear, draft.conferences.join('|')],
  () => {
    stopPlayback()
    scheduleCandidateRefresh()
  }
)
watch(() => [draft.topics.join('|'), draft.metric], stopPlayback)

onMounted(async () => {
  const facetsPromise = paperApi.facets().catch(() => ({ conferences: [], years: [] }))
  await loadTrends({}, { sync: true })
  facets.value = await facetsPromise
  scheduleCandidateRefresh()
})

onBeforeUnmount(() => {
  trendRequestSequence += 1
  candidateRequestSequence += 1
  window.clearTimeout(candidateTimer)
  stopPlayback()
})
</script>

<template>
  <div class="trend-page">
    <TopBar />

    <div class="page-head">
      <div>
        <h1>Trend Analysis</h1>
        <p class="subtitle">Compare exact normalized topics across years and conferences.</p>
      </div>
      <span v-if="response" class="scope-badge">{{ response.scope.start_year }}–{{ response.scope.end_year }}</span>
    </div>

    <section class="card filter-card" aria-labelledby="trend-filters-heading">
      <div class="filter-heading">
        <div>
          <h2 id="trend-filters-heading">Analysis scope</h2>
          <p>Choose up to five topics and compare the same statistical unit across conferences.</p>
        </div>
        <span v-if="candidateLoading" class="candidate-status"><RefreshCw :size="13" /> Updating topics…</span>
      </div>

      <div class="filter-grid">
        <label class="year-field">
          <span>Start year</span>
          <input v-model="draft.startYear" type="number" min="1980" :max="currentYear + 1" list="trend-years" />
        </label>
        <label class="year-field">
          <span>End year</span>
          <input v-model="draft.endYear" type="number" min="1980" :max="currentYear + 1" list="trend-years" />
        </label>
        <datalist id="trend-years"><option v-for="year in facets.years" :key="year" :value="year"></option></datalist>

        <fieldset class="conference-field">
          <legend>Conferences</legend>
          <label v-for="conference in conferenceOptions" :key="conference" :class="{ selected: draft.conferences.includes(conference) }">
            <input v-model="draft.conferences" type="checkbox" :value="conference" />
            {{ conference }}
          </label>
        </fieldset>

        <fieldset class="metric-field">
          <legend>Metric</legend>
          <label :class="{ selected: draft.metric === 'count' }">
            <input v-model="draft.metric" type="radio" value="count" /> Paper count
          </label>
          <label :class="{ selected: draft.metric === 'share' }">
            <input v-model="draft.metric" type="radio" value="share" /> Normalized share
          </label>
        </fieldset>
      </div>

      <div class="topic-selector">
        <div class="topic-selector-head">
          <span>Topics <b>{{ draft.topics.length }}/5</b></span>
          <small>Suggestions come from live hot-topic results for the selected conference-years.</small>
        </div>
        <div class="selected-topics" aria-label="Selected topics">
          <span v-for="topic in draft.topics" :key="topic">
            {{ topic }}
            <button type="button" :aria-label="`Remove ${topic}`" @click="removeTopic(topic)"><X :size="13" /></button>
          </span>
          <em v-if="!draft.topics.length">Select at least one topic.</em>
        </div>
        <div class="topic-add-row">
          <select v-model="topicToAdd" :disabled="draft.topics.length >= 5 || !availableCandidates.length" @change="addTopic">
            <option value="">{{ availableCandidates.length ? 'Add a topic…' : 'No additional topics available' }}</option>
            <option v-for="item in availableCandidates" :key="item.topic" :value="item.topic">
              {{ item.topic }} · {{ item.paper_count }} papers
            </option>
          </select>
          <span v-if="candidateError" class="candidate-error">{{ candidateError }}</span>
        </div>
      </div>

      <div class="filter-actions">
        <p v-if="filterError" role="alert">{{ filterError }}</p>
        <span v-else></span>
        <button class="reset-btn" type="button" :disabled="loading" @click="resetFilters">Reset</button>
        <button class="apply-btn" type="button" :disabled="loading" @click="applyFilters">
          <RefreshCw v-if="loading" :size="15" /> Apply filters
        </button>
      </div>
    </section>

    <div v-if="errorMessage" class="page-message error" role="alert">
      <span>{{ errorMessage }}</span>
      <button type="button" @click="retryTrends"><RefreshCw :size="15" /> Retry</button>
    </div>
    <div v-else-if="refreshing" class="page-message refreshing" role="status">
      <RefreshCw :size="15" /> Refreshing data while keeping the previous chart visible…
    </div>

    <div v-if="unknownTopics.length" class="page-message warning" role="status">
      Unknown in this scope: {{ unknownTopics.join(', ') }}. No unrelated topics were substituted.
    </div>

    <div class="trend-layout">
      <section class="card trend-card">
        <header class="chart-heading">
          <div>
            <h2>Topic trends over time</h2>
            <p>{{ response?.scope.metric === 'count' ? 'Distinct eligible paper count' : 'Share of eligible papers per conference/year' }}</p>
          </div>
          <div class="animation-actions" aria-label="Trend animation controls">
            <span v-if="visibleYear" class="visible-year">Through {{ visibleYear }}</span>
            <button type="button" :disabled="!hasChartData || playing || isLastYear" @click="play"><Play :size="15" /> Play</button>
            <button type="button" :disabled="!playing" @click="pause"><Pause :size="15" /> Pause</button>
            <button type="button" :disabled="!hasChartData" @click="replay"><RotateCcw :size="15" /> Replay</button>
          </div>
        </header>

        <div v-if="initialLoading" class="panel-state" role="status">Loading live trend data…</div>
        <div v-else-if="emptyDatabase" class="panel-state">
          <strong>The eligible paper database is empty.</strong>
          <span>Import or add papers with abstracts and keywords to calculate trends.</span>
        </div>
        <div v-else-if="!hasChartData" class="panel-state">
          <strong>No data in the selected range.</strong>
          <span>Try another topic, conference, or year range.</span>
        </div>
        <template v-else>
          <div v-if="someYearsUnavailable" class="data-note missing">Line gaps indicate conference-years with no eligible papers; they are unavailable, not zero.</div>
          <div v-if="hasGenuineZero" class="data-note zero">Markers on the baseline are genuine zero topic counts where eligible papers exist.</div>
          <TrendStepChart
            :years="response.years"
            :series="response.series"
            :metric="response.scope.metric"
            :visible-year="visibleYear"
          />
        </template>
      </section>

      <aside class="insight-card">
        <h2>Evidence summary</h2>
        <template v-if="peak">
          <p class="insight-copy"><strong>{{ peak.topic }}</strong> has the selected-scope peak in {{ peak.conference }}.</p>
          <div class="insight-grid">
            <div><span>Peak year</span><strong>{{ peak.year }}</strong></div>
            <div><span>Peak value</span><strong>{{ formatMetric(peak) }}</strong></div>
            <div><span>Latest data year</span><strong>{{ response.summary.latest_year_with_data }}</strong></div>
          </div>
        </template>
        <p v-else class="insight-empty">Not enough data for an insight.</p>
        <hr />
        <p class="eyebrow">Methodology</p>
        <p class="method-copy">{{ response?.methodology.paper_unit || 'Distinct eligible papers containing an exact normalized keyword.' }}</p>
        <p class="method-copy formula">Share = paper count ÷ eligible papers in the same conference/year × 100.</p>
      </aside>
    </div>

    <section v-if="response" class="card data-source-card">
      <div>
        <p class="eyebrow">Data source</p>
        <strong>{{ sourceLabel }}</strong>
        <span>{{ formatTimestamp(response.data_context.latest_updated_at) }}</span>
      </div>
      <p>{{ response.methodology.warning }}</p>
    </section>
  </div>
</template>

<style scoped>
.trend-page { max-width:100%; margin:0 auto; }
.page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:18px; }
h1 { font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.scope-badge { padding:7px 12px; border-radius:999px; color:var(--accent); background:var(--accent-soft); font-size:13px; font-weight:750; }
.filter-card { margin-bottom:16px; padding:18px 20px; }
.filter-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:14px; }
.filter-heading h2 { font-size:18px; }
.filter-heading p { margin:3px 0 0; color:var(--text-secondary); font-size:13px; }
.candidate-status { display:inline-flex; align-items:center; gap:6px; color:var(--accent); font-size:12px; }
.candidate-status svg, .refreshing svg, .apply-btn svg { animation:spin .9s linear infinite; }
.filter-grid { display:grid; grid-template-columns:130px 130px minmax(260px,1fr) minmax(260px,1fr); gap:12px; align-items:end; }
.year-field { display:grid; gap:6px; color:var(--text-secondary); font-size:12px; font-weight:700; }
.year-field input, .topic-add-row select { min-height:42px; width:100%; border:1px solid var(--border); border-radius:10px; outline:0; background:#fff; color:var(--text-primary); font:inherit; font-size:14px; }
.year-field input { padding:0 11px; }
.year-field input:focus, .topic-add-row select:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(108,92,231,.1); }
fieldset { min-width:0; margin:0; padding:0; border:0; }
legend { margin-bottom:6px; color:var(--text-secondary); font-size:12px; font-weight:700; }
.conference-field, .metric-field { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
.conference-field legend, .metric-field legend { width:100%; }
.conference-field label, .metric-field label { display:inline-flex; min-height:42px; align-items:center; justify-content:center; padding:0 13px; border:1px solid var(--border); border-radius:10px; color:var(--text-secondary); background:#fff; font-size:13px; font-weight:700; cursor:pointer; }
.conference-field label.selected, .metric-field label.selected { border-color:#cfc4ff; color:var(--accent); background:var(--accent-soft); }
.conference-field input, .metric-field input { position:absolute; opacity:0; pointer-events:none; }
.topic-selector { margin-top:14px; padding-top:14px; border-top:1px solid var(--border); }
.topic-selector-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.topic-selector-head > span { color:var(--text-primary); font-size:13px; font-weight:750; }
.topic-selector-head b { color:var(--accent); }
.topic-selector-head small { color:var(--text-muted); font-size:11px; }
.selected-topics { display:flex; min-height:38px; align-items:center; flex-wrap:wrap; gap:7px; margin:8px 0; }
.selected-topics > span { display:inline-flex; align-items:center; gap:5px; padding:6px 8px 6px 11px; border-radius:999px; color:#6f57cf; background:#efebff; font-size:12px; font-weight:700; }
.selected-topics button { display:inline-flex; padding:1px; border-radius:50%; color:inherit; }
.selected-topics button:hover { background:rgba(108,92,231,.12); }
.selected-topics em { color:var(--text-muted); font-size:12px; font-style:normal; }
.topic-add-row { display:flex; align-items:center; gap:12px; }
.topic-add-row select { max-width:420px; padding:0 34px 0 11px; }
.topic-add-row select:disabled { color:var(--text-muted); background:#f8f8fb; }
.candidate-error { color:#ad4c62; font-size:12px; }
.filter-actions { display:flex; align-items:center; justify-content:flex-end; gap:9px; margin-top:14px; }
.filter-actions > p, .filter-actions > span { flex:1; margin:0; color:#ad4c62; font-size:12px; }
.reset-btn, .apply-btn, .animation-actions button, .page-message button { display:inline-flex; min-height:40px; align-items:center; justify-content:center; gap:7px; padding:0 15px; border-radius:10px; font-size:13px; font-weight:750; }
.reset-btn, .animation-actions button { border:1px solid var(--border); color:var(--text-secondary); background:#fff; }
.apply-btn { min-width:112px; color:#fff; background:var(--text-primary); }
.reset-btn:hover:not(:disabled), .animation-actions button:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); }
.apply-btn:hover:not(:disabled) { background:var(--accent); }
button:disabled { cursor:not-allowed; opacity:.45; }
.page-message { display:flex; align-items:center; gap:8px; margin:0 0 16px; padding:9px 13px; border-radius:10px; font-size:13px; }
.page-message.error { justify-content:space-between; color:#a83d57; background:#ffedf2; }
.page-message.refreshing { color:var(--accent); background:var(--accent-soft); }
.page-message.warning { color:#8a651e; background:#fff6dc; }
.trend-layout { display:grid; grid-template-columns:minmax(0,3fr) minmax(270px,1fr); gap:16px; align-items:start; }
.trend-card { min-width:0; padding:22px; }
.chart-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:12px; }
.chart-heading h2, .insight-card h2 { margin:0; font-family:var(--font-display); font-size:22px; font-weight:800; }
.chart-heading p { margin:4px 0 0; color:var(--text-secondary); font-size:13px; }
.animation-actions { display:flex; align-items:center; justify-content:flex-end; gap:7px; flex-wrap:wrap; }
.visible-year { margin-right:3px; color:var(--accent); font-size:12px; font-weight:750; }
.animation-actions button { min-height:38px; padding:0 12px; }
.panel-state { display:flex; min-height:420px; flex-direction:column; align-items:center; justify-content:center; gap:7px; text-align:center; color:var(--text-secondary); font-size:14px; }
.panel-state strong { color:var(--text-primary); font-size:17px; }
.data-note { margin-bottom:8px; padding:7px 10px; border-radius:8px; font-size:12px; }
.data-note.missing { color:#75622f; background:#fff8df; }
.data-note.zero { color:#39705d; background:#eaf8f2; }
.insight-card { padding:24px; border:1px solid #d8f0e5; border-radius:var(--radius-card); background:#eaf9f2; box-shadow:var(--shadow-card); }
.insight-card h2 { margin-bottom:24px; }
.insight-copy { margin:0 0 20px; color:var(--text-primary); font-size:17px; line-height:1.5; }
.insight-grid { display:grid; gap:8px; }
.insight-grid div { padding:12px; border:1px solid rgba(32,173,132,.16); border-radius:10px; background:rgba(255,255,255,.58); }
.insight-grid span, .insight-grid strong { display:block; }
.insight-grid span { margin-bottom:3px; color:var(--text-secondary); font-size:11px; font-weight:700; text-transform:uppercase; }
.insight-grid strong { font-size:18px; }
.insight-empty { min-height:150px; margin:0; color:var(--text-secondary); font-size:15px; }
.insight-card hr { margin:20px 0; border:0; border-top:1px solid #ccebdd; }
.eyebrow { margin:0 0 6px; color:var(--text-muted); font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
.method-copy { margin:0; color:var(--text-secondary); font-size:13px; line-height:1.55; }
.method-copy.formula { margin-top:9px; }
.data-source-card { display:flex; justify-content:space-between; align-items:center; gap:24px; margin-top:16px; padding:18px 20px; color:var(--text-secondary); }
.data-source-card > div { display:grid; gap:3px; }
.data-source-card strong { color:var(--text-primary); font-size:14px; font-weight:650; }
.data-source-card span, .data-source-card > p { margin:0; font-size:12px; }
.data-source-card > p { max-width:540px; text-align:right; }
@keyframes spin { to { transform:rotate(360deg); } }
@media (max-width:1220px) { .filter-grid { grid-template-columns:130px 130px 1fr; } .metric-field { grid-column:1/-1; } .trend-layout { grid-template-columns:1fr; } }
@media (max-width:760px) { .page-head, .filter-heading, .chart-heading, .data-source-card { align-items:flex-start; flex-direction:column; } .filter-grid { grid-template-columns:1fr 1fr; } .conference-field, .metric-field { grid-column:1/-1; } .topic-selector-head { align-items:flex-start; flex-direction:column; } .topic-add-row { align-items:flex-start; flex-direction:column; } .topic-add-row select { max-width:none; } .filter-actions { flex-wrap:wrap; } .filter-actions > p, .filter-actions > span { flex-basis:100%; } .animation-actions { justify-content:flex-start; } .data-source-card > p { text-align:left; } }
@media (max-width:480px) { .filter-grid { grid-template-columns:1fr; } .conference-field, .metric-field { grid-column:auto; } .filter-card, .trend-card, .insight-card { padding:17px; } }
</style>
