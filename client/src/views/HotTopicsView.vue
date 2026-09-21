<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Download, RefreshCw, Search, X } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import { paperApi } from '@/services/paperApi'

const route = useRoute()
const routeQueryValue = (key) => typeof route.query[key] === 'string' ? route.query[key].trim() : ''
const requestedConference = routeQueryValue('conference').toLocaleUpperCase('en-US')
const requestedYear = routeQueryValue('year')
const selectedConference = ref(['CVPR', 'ICCV', 'ECCV'].includes(requestedConference) ? requestedConference : '')
const selectedYear = ref(/^\d{4}$/u.test(requestedYear) ? requestedYear : '')
const selectedSort = ref('count')
const query = ref(routeQueryValue('query'))
const facets = ref({ conferences: [], years: [] })
const facetsLoaded = ref(false)
const topicsResponse = ref(null)
const selectedTopic = ref('')
const topicDetail = ref(null)
const topicsLoading = ref(false)
const detailLoading = ref(false)
const topicsError = ref('')
const detailError = ref('')
const hasLoaded = ref(false)
let topicsRequestSequence = 0
let detailRequestSequence = 0
let searchTimer = null

const colors = ['#6f61ef', '#27c3b2', '#5f8df6', '#ffa34c', '#f27698', '#20ad84', '#527cf0', '#8765ed', '#15a985', '#e6a700']
const items = computed(() => topicsResponse.value?.items || [])
const initialLoading = computed(() => topicsLoading.value && !hasLoaded.value)
const refreshing = computed(() => topicsLoading.value && hasLoaded.value)
const emptyDatabase = computed(() => hasLoaded.value && topicsResponse.value?.methodology.eligible_paper_total === 0 && !selectedConference.value && !selectedYear.value)
const selectedMetricLabel = computed(() => ({ count: 'paper count', share: 'normalized share', growth: 'growth' })[selectedSort.value])
const metricMaximum = computed(() => {
  const values = items.value
    .map((topic) => Math.abs(metricValue(topic)))
    .filter((value) => Number.isFinite(value))
  return Math.max(...values, 1)
})

const trendChart = computed(() => {
  const trend = topicDetail.value?.trend || []
  const left = 34
  const right = 506
  const top = 18
  const bottom = 140
  const maxShare = Math.max(...trend.map((point) => point.share_percent), 1)
  const points = trend.map((point, index) => ({
    ...point,
    x: trend.length === 1 ? (left + right) / 2 : left + (index * (right - left)) / (trend.length - 1),
    y: bottom - (point.share_percent / maxShare) * (bottom - top)
  }))
  return {
    points,
    path: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
    maxShare
  }
})

function scopeParams() {
  return {
    conference: selectedConference.value,
    year: selectedYear.value
  }
}

function metricValue(topic) {
  if (selectedSort.value === 'share') return Number(topic.share_percent)
  if (selectedSort.value === 'growth') return topic.growth_percent == null ? 0 : Number(topic.growth_percent)
  return Number(topic.paper_count)
}

function barWidth(topic) {
  const value = Math.abs(metricValue(topic))
  return value ? `${Math.max(5, (value / metricMaximum.value) * 100)}%` : '0%'
}

function growthLabel(value, baselineYear = null) {
  if (value == null) return baselineYear ? `No ${baselineYear} baseline` : 'No baseline'
  return `${value > 0 ? '+' : ''}${value}%`
}

function formatAuthors(authors) {
  return Array.isArray(authors) && authors.length ? authors.join(', ') : 'Not available'
}

function formatDate(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Not available'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp)
}

async function loadDetail(topic) {
  const requestId = ++detailRequestSequence
  detailLoading.value = true
  detailError.value = ''
  try {
    const detail = await paperApi.topicDetail(topic, { ...scopeParams(), paper_limit: 10 })
    if (requestId !== detailRequestSequence || selectedTopic.value !== topic) return
    topicDetail.value = detail
  } catch (error) {
    if (requestId !== detailRequestSequence) return
    detailError.value = `Unable to load topic details: ${error.message}`
  } finally {
    if (requestId === detailRequestSequence) detailLoading.value = false
  }
}

async function loadTopics({ includeFacets = false } = {}) {
  const requestId = ++topicsRequestSequence
  detailRequestSequence += 1
  topicsLoading.value = true
  topicsError.value = ''
  try {
    const requests = [paperApi.hotTopics({
      ...scopeParams(),
      query: query.value.trim(),
      sort: selectedSort.value,
      limit: 10
    })]
    if (includeFacets) requests.push(paperApi.facets())
    const [result, facetsResult] = await Promise.all(requests)
    if (requestId !== topicsRequestSequence) return
    topicsResponse.value = result
    if (facetsResult) {
      facets.value = facetsResult
      facetsLoaded.value = true
    }
    hasLoaded.value = true

    const nextTopic = result.items.some((item) => item.topic === selectedTopic.value)
      ? selectedTopic.value
      : result.items[0]?.topic || ''
    if (nextTopic !== selectedTopic.value) topicDetail.value = null
    selectedTopic.value = nextTopic
    if (!nextTopic) {
      topicDetail.value = null
      detailError.value = ''
    } else {
      loadDetail(nextTopic)
    }
  } catch (error) {
    if (requestId !== topicsRequestSequence) return
    topicsError.value = `Unable to load hot topics: ${error.message}`
  } finally {
    if (requestId === topicsRequestSequence) topicsLoading.value = false
  }
}

function selectTopic(topic) {
  if (selectedTopic.value === topic && topicDetail.value) return
  selectedTopic.value = topic
  topicDetail.value = null
  loadDetail(topic)
}

function refreshTopics() {
  loadTopics({ includeFacets: !facetsLoaded.value })
}

function clearFilters() {
  const searchWillReload = Boolean(query.value)
  selectedConference.value = ''
  selectedYear.value = ''
  selectedSort.value = 'count'
  query.value = ''
  if (!searchWillReload) refreshTopics()
}

function clearSearch() {
  query.value = ''
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function exportCsv() {
  if (!items.value.length) return
  const headers = ['Rank', 'Topic', 'Paper count', 'Eligible paper total', 'Share percent', 'Previous paper count', 'Growth percent', 'Conference', 'Year']
  const rows = items.value.map((topic) => [
    topic.rank,
    topic.topic,
    topic.paper_count,
    topicsResponse.value.methodology.eligible_paper_total,
    topic.share_percent,
    topic.previous_paper_count,
    topic.growth_percent,
    topicsResponse.value.scope.conference || 'All',
    topicsResponse.value.scope.year || 'All'
  ])
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'paperpulse-hot-topics.csv'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

watch(query, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => refreshTopics(), 300)
})

onMounted(() => loadTopics({ includeFacets: true }))
onBeforeUnmount(() => {
  topicsRequestSequence += 1
  detailRequestSequence += 1
  window.clearTimeout(searchTimer)
})
</script>

<template>
  <div class="hot-topics">
    <TopBar />

    <div class="page-head">
      <div>
        <h1>Hot Topics</h1>
        <p class="subtitle">Explore explainable research-topic frequency from stored paper keywords.</p>
      </div>
      <button class="dark-btn" type="button" :disabled="!items.length" @click="exportCsv">
        <Download :size="17" /> Export report
      </button>
    </div>

    <section class="topic-toolbar" aria-label="Hot topic filters">
      <label>
        <span>Conference</span>
        <select v-model="selectedConference" :disabled="initialLoading" @change="refreshTopics">
          <option value="">All conferences</option>
          <option value="CVPR">CVPR</option>
          <option value="ICCV">ICCV</option>
          <option value="ECCV">ECCV</option>
        </select>
      </label>
      <label>
        <span>Year</span>
        <select v-model="selectedYear" :disabled="initialLoading" @change="refreshTopics">
          <option value="">All years</option>
          <option v-for="year in facets.years" :key="year" :value="year">{{ year }}</option>
        </select>
      </label>
      <label>
        <span>Rank by</span>
        <select v-model="selectedSort" :disabled="initialLoading" @change="refreshTopics">
          <option value="count">Paper count</option>
          <option value="share">Normalized share</option>
          <option value="growth">Growth</option>
        </select>
      </label>
      <label class="topic-search">
        <span>Topic search</span>
        <span class="search-field">
          <Search :size="16" />
          <input v-model="query" placeholder="Search normalized topics" @keydown.esc.prevent="clearSearch" />
          <button v-if="query" type="button" aria-label="Clear topic search" @click="clearSearch"><X :size="15" /></button>
        </span>
      </label>
      <button class="clear-btn" type="button" @click="clearFilters">Clear filters</button>
    </section>

    <div v-if="topicsError" class="page-message error" role="alert">
      <span>{{ topicsError }}</span>
      <button type="button" @click="refreshTopics"><RefreshCw :size="15" /> Retry</button>
    </div>
    <div v-else-if="refreshing" class="page-message refreshing" role="status">
      <RefreshCw :size="15" /> Updating ranking…
    </div>

    <div class="hot-grid">
      <section class="card ranking-card">
        <header>
          <div>
            <h2>Top 10 research directions</h2>
            <p>Ranked by {{ selectedMetricLabel }} among eligible papers</p>
          </div>
          <span v-if="topicsResponse" class="scope-total">{{ topicsResponse.methodology.eligible_paper_total }} eligible papers</span>
        </header>

        <div v-if="initialLoading" class="panel-state" role="status">Loading live topic analysis…</div>
        <div v-else-if="!items.length" class="panel-state">
          <strong>{{ emptyDatabase ? 'The paper database is empty.' : 'No topics match these filters.' }}</strong>
          <span>{{ emptyDatabase ? 'Import or add eligible papers to populate topic analysis.' : 'Clear filters or try a different topic search.' }}</span>
        </div>
        <div v-else class="rank-list">
          <div class="rank-header" aria-hidden="true">
            <span>Rank</span><span>Topic</span><span>Selected metric</span><span>Papers</span><span>Share</span><span>Growth</span>
          </div>
          <button
            v-for="(topic, index) in items"
            :key="topic.topic"
            type="button"
            class="rank-row"
            :class="{ selected: selectedTopic === topic.topic }"
            :aria-pressed="selectedTopic === topic.topic"
            @click="selectTopic(topic.topic)"
          >
            <span class="rank-circle" :style="{ color: colors[index % colors.length], borderColor: colors[index % colors.length] }">{{ topic.rank }}</span>
            <span class="rank-name">{{ topic.topic }}</span>
            <span class="rank-bar" :title="`${selectedMetricLabel}: ${metricValue(topic)}`">
              <i :class="{ negative: selectedSort === 'growth' && topic.growth_percent < 0 }" :style="{ width: barWidth(topic), background: colors[index % colors.length] }"></i>
            </span>
            <span class="rank-number">{{ topic.paper_count }}</span>
            <span class="rank-number">{{ topic.share_percent }}%</span>
            <span class="rank-growth" :class="{ neutral: topic.growth_percent == null, negative: topic.growth_percent < 0 }">
              {{ growthLabel(topic.growth_percent) }}
            </span>
          </button>
        </div>
      </section>

      <aside class="card topic-detail">
        <div v-if="!selectedTopic && !initialLoading" class="panel-state">Select an available topic to inspect its evidence.</div>
        <div v-else-if="detailLoading && !topicDetail" class="panel-state" role="status">Loading topic details…</div>
        <div v-else-if="detailError" class="panel-state error" role="alert">
          <span>{{ detailError }}</span>
          <button type="button" @click="loadDetail(selectedTopic)"><RefreshCw :size="15" /> Retry</button>
        </div>
        <template v-else-if="topicDetail">
          <div class="detail-heading">
            <div>
              <span class="eyebrow">Selected normalized keyword</span>
              <h2>{{ topicDetail.topic }}</h2>
            </div>
            <span class="selected-pill">Selected</span>
          </div>
          <div class="detail-metrics">
            <div><strong>{{ topicDetail.paper_count }}</strong><span>Papers</span></div>
            <div><strong>{{ topicDetail.share_percent }}%</strong><span>Eligible share</span></div>
            <div>
              <strong :class="{ neutral: topicDetail.growth_percent == null, negative: topicDetail.growth_percent < 0 }">
                {{ growthLabel(topicDetail.growth_percent, topicDetail.scope.year ? topicDetail.scope.year - 1 : null) }}
              </strong>
              <span>Growth</span>
            </div>
          </div>
          <div class="trend-heading">
            <div>
              <h3>Normalized share over time</h3>
              <p>Available eligible years for {{ topicDetail.scope.conference || 'all conferences' }}</p>
            </div>
          </div>
          <div v-if="trendChart.points.length" class="trend-chart">
            <svg viewBox="0 0 540 180" role="img" :aria-label="`Yearly normalized share for ${topicDetail.topic}`">
              <title>Yearly normalized share for {{ topicDetail.topic }}</title>
              <line x1="34" y1="140" x2="506" y2="140" />
              <line x1="34" y1="18" x2="34" y2="140" />
              <path :d="trendChart.path" />
              <g v-for="point in trendChart.points" :key="point.year">
                <circle :cx="point.x" :cy="point.y" r="4" />
                <text :x="point.x" y="163" text-anchor="middle">{{ point.year }}</text>
                <text :x="point.x" :y="Math.max(13, point.y - 9)" text-anchor="middle">{{ point.share_percent }}%</text>
              </g>
            </svg>
            <table class="sr-only">
              <caption>Yearly topic evidence</caption>
              <thead><tr><th>Year</th><th>Paper count</th><th>Eligible papers</th><th>Share</th></tr></thead>
              <tbody>
                <tr v-for="point in topicDetail.trend" :key="point.year">
                  <td>{{ point.year }}</td><td>{{ point.paper_count }}</td><td>{{ point.eligible_paper_total }}</td><td>{{ point.share_percent }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="trend-empty">No eligible yearly trend is available.</p>
        </template>
      </aside>
    </div>

    <section class="card related-card">
      <header>
        <div><h2>Related papers</h2><p>Eligible records containing the exact selected normalized keyword.</p></div>
        <span v-if="topicDetail">{{ topicDetail.related_papers.length }} shown</span>
      </header>
      <div v-if="detailLoading && !topicDetail" class="related-state">Loading supporting papers…</div>
      <div v-else-if="topicDetail && !topicDetail.related_papers.length" class="related-state">No supporting papers match the selected scope.</div>
      <div v-else-if="topicDetail" class="related-table">
        <div class="related-header"><span>Paper title</span><span>Authors</span><span>Conference</span><span>Updated</span></div>
        <div v-for="paper in topicDetail.related_papers" :key="paper.paper_id" class="related-row">
          <router-link :to="`/papers/${encodeURIComponent(paper.paper_id)}`">{{ paper.title }}</router-link>
          <span>{{ formatAuthors(paper.authors) }}</span>
          <span>{{ paper.conference || 'Not available' }}<template v-if="paper.year"> · {{ paper.year }}</template></span>
          <span>{{ formatDate(paper.updated_at) }}</span>
        </div>
      </div>
      <div v-else class="related-state">Select a topic to view supporting papers.</div>
    </section>

    <section v-if="topicsResponse" class="methodology-note" aria-labelledby="methodology-heading">
      <h2 id="methodology-heading">How this ranking is calculated</h2>
      <p>
        Each topic counts distinct eligible papers containing that normalized keyword. Eligible papers have an abstract and keywords and are not marked fetch failed.
        Share = topic papers ÷ {{ topicsResponse.methodology.eligible_paper_total }} eligible papers × 100.
        <template v-if="topicsResponse.methodology.growth_baseline_year">
          Growth compares with {{ topicsResponse.methodology.growth_baseline_year }}; a zero prior count has no baseline.
        </template>
        <template v-else>Growth is not calculated until a specific year is selected.</template>
      </p>
      <strong>{{ topicsResponse.methodology.causality_warning }}</strong>
    </section>
  </div>
</template>

<style scoped>
.hot-topics { max-width: 100%; margin: 0 auto; }
.page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:18px; }
h1 { font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.dark-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 20px; border-radius:11px; background:var(--text-primary); color:#fff; font-size:14px; font-weight:700; }
.dark-btn:hover:not(:disabled) { background:var(--accent); }
.dark-btn:disabled { cursor:not-allowed; opacity:.45; }
.topic-toolbar { display:grid; grid-template-columns:150px 130px 175px minmax(220px,1fr) auto; gap:12px; align-items:end; margin-bottom:16px; padding:15px 16px; border:1px solid var(--border); border-radius:14px; background:#fff; box-shadow:var(--shadow-sm); }
.topic-toolbar label { display:grid; gap:6px; color:var(--text-secondary); font-size:12px; font-weight:700; }
.topic-toolbar select, .search-field { min-height:42px; border:1px solid var(--border); border-radius:10px; color:var(--text-primary); background:#fff; font:inherit; font-size:14px; }
.topic-toolbar select { width:100%; padding:0 34px 0 12px; outline:0; }
.search-field { display:flex; align-items:center; gap:8px; padding:0 11px; color:var(--text-muted); }
.search-field input { width:100%; min-width:0; border:0; outline:0; color:var(--text-primary); background:transparent; font:inherit; font-size:14px; }
.search-field button { display:inline-flex; color:var(--text-muted); }
.clear-btn { min-height:42px; padding:0 16px; border:1px solid var(--border); border-radius:10px; color:var(--text-secondary); font-size:14px; font-weight:700; }
.clear-btn:hover { color:var(--accent); border-color:#cfc4ff; background:var(--accent-soft); }
.page-message { display:flex; align-items:center; gap:8px; margin:0 0 16px; padding:9px 13px; border-radius:10px; font-size:14px; }
.page-message.error { justify-content:space-between; color:#a83d57; background:#ffedf2; }
.page-message button, .panel-state button { display:inline-flex; align-items:center; gap:5px; color:inherit; font-weight:700; }
.page-message.refreshing { color:var(--accent); background:var(--accent-soft); }
.page-message.refreshing svg { animation:spin .9s linear infinite; }
.hot-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; }
.ranking-card, .topic-detail { min-height:515px; padding:22px; }
.ranking-card > header, .related-card > header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.ranking-card h2, .topic-detail h2, .related-card h2 { margin:0; font-family:var(--font-display); font-size:22px; font-weight:800; }
.ranking-card header p, .related-card header p { margin:4px 0 10px; color:var(--text-secondary); font-size:14px; }
.scope-total { padding:5px 9px; border-radius:999px; color:var(--accent); background:var(--accent-soft); font-size:12px; font-weight:700; white-space:nowrap; }
.rank-list { display:grid; }
.rank-header, .rank-row { display:grid; grid-template-columns:42px minmax(125px,1.25fr) minmax(90px,1fr) 52px 58px 82px; gap:9px; align-items:center; }
.rank-header { min-height:28px; color:var(--text-muted); font-size:11px; font-weight:700; }
.rank-header span:nth-child(n+4) { text-align:right; }
.rank-row { width:100%; min-height:40px; padding:2px 5px; border-top:1px solid #f0f1f6; border-radius:8px; text-align:left; transition:background .12s ease; }
.rank-row:hover, .rank-row.selected { background:#f8f7ff; }
.rank-row.selected { box-shadow:inset 3px 0 var(--accent); }
.rank-circle { display:inline-flex; align-items:center; justify-content:center; width:25px; height:25px; border:1.5px solid; border-radius:50%; font-size:12px; font-weight:700; }
.rank-name { overflow:hidden; color:var(--text-primary); font-size:14px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.rank-bar { height:7px; border-radius:99px; background:#f0f1f6; overflow:hidden; }
.rank-bar i { display:block; height:100%; border-radius:inherit; opacity:.88; }
.rank-bar i.negative { opacity:.55; }
.rank-number, .rank-growth { color:var(--text-primary); font-size:12px; text-align:right; white-space:nowrap; }
.rank-growth { color:var(--green); font-weight:700; }
.rank-growth.neutral, .detail-metrics strong.neutral { color:var(--text-muted); font-weight:600; }
.rank-growth.negative, .detail-metrics strong.negative { color:#cf6077; }
.panel-state { display:flex; min-height:390px; flex-direction:column; align-items:center; justify-content:center; gap:7px; text-align:center; color:var(--text-secondary); font-size:14px; }
.panel-state strong { color:var(--text-primary); font-size:16px; }
.panel-state.error { color:#a83d57; }
.topic-detail { padding:24px; }
.detail-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
.eyebrow { display:block; margin-bottom:5px; color:var(--text-muted); font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
.selected-pill { padding:5px 10px; border-radius:999px; color:#8064df; background:#efebff; font-size:12px; font-weight:700; }
.detail-metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; margin:20px 0 25px; }
.detail-metrics div { min-width:0; padding:13px; border:1px solid var(--border); border-radius:11px; background:#fbfbfe; }
.detail-metrics strong, .detail-metrics span { display:block; }
.detail-metrics strong { overflow:hidden; color:var(--text-primary); font-size:19px; text-overflow:ellipsis; white-space:nowrap; }
.detail-metrics span { margin-top:4px; color:var(--text-muted); font-size:11px; font-weight:700; text-transform:uppercase; }
.trend-heading h3 { margin:0; font-size:15px; }
.trend-heading p { margin:4px 0 6px; color:var(--text-secondary); font-size:12px; }
.trend-chart svg { display:block; width:100%; max-height:200px; overflow:visible; }
.trend-chart line { stroke:#e7e8f0; stroke-width:1; }
.trend-chart path { fill:none; stroke:#8068ed; stroke-linecap:round; stroke-linejoin:round; stroke-width:2.5; }
.trend-chart circle { fill:#8068ed; stroke:#fff; stroke-width:2; }
.trend-chart text { fill:#9295aa; font-size:10px; }
.trend-empty { margin:40px 0; color:var(--text-secondary); text-align:center; font-size:14px; }
.related-card { margin-top:16px; padding:22px; }
.related-card header > span { color:var(--text-muted); font-size:13px; }
.related-table { overflow-x:auto; }
.related-header, .related-row { display:grid; grid-template-columns:minmax(260px,1.5fr) minmax(190px,1fr) 130px 125px; gap:16px; align-items:center; min-width:820px; }
.related-header { min-height:32px; border-bottom:1px solid var(--border); color:var(--text-muted); font-size:12px; font-weight:700; }
.related-row { min-height:45px; border-bottom:1px solid #f1f2f6; color:var(--text-secondary); font-size:13px; }
.related-row:last-child { border-bottom:0; }
.related-row a { overflow:hidden; color:var(--text-primary); font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.related-row a:hover { color:var(--accent); }
.related-row span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.related-state { padding:34px 0; color:var(--text-secondary); text-align:center; font-size:14px; }
.methodology-note { margin-top:16px; padding:18px 20px; border:1px solid #ddd6ff; border-radius:13px; color:var(--text-secondary); background:#faf9ff; }
.methodology-note h2 { margin:0 0 6px; color:var(--text-primary); font-size:15px; }
.methodology-note p { margin:0 0 7px; font-size:13px; line-height:1.55; }
.methodology-note strong { color:#6f5ac5; font-size:12px; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@keyframes spin { to { transform:rotate(360deg); } }
@media (max-width:1180px) { .topic-toolbar { grid-template-columns:repeat(3,1fr); } .topic-search { grid-column:span 2; } .hot-grid { grid-template-columns:1fr; } }
@media (max-width:720px) { .page-head { align-items:stretch; flex-direction:column; } .dark-btn { align-self:flex-start; } .topic-toolbar { grid-template-columns:1fr 1fr; } .topic-search { grid-column:1/-1; } .rank-header { display:none; } .rank-row { grid-template-columns:34px minmax(110px,1fr) 70px 42px 52px 72px; gap:6px; } .ranking-card, .topic-detail { padding:18px; } .detail-metrics { grid-template-columns:1fr; } }
@media (max-width:520px) { .topic-toolbar { grid-template-columns:1fr; } .topic-search { grid-column:auto; } .rank-row { grid-template-columns:30px minmax(100px,1fr) 55px 40px 62px; } .rank-bar { display:none; } .rank-number:nth-of-type(2) { display:none; } }
</style>
