<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Calendar, Layers, ChevronDown, RefreshCw } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import StatCard from '@/components/StatCard.vue'
import HotTopicsCard from '@/components/HotTopicsCard.vue'
import KeywordNetwork from '@/components/KeywordNetwork.vue'
import RecentPapersCard from '@/components/RecentPapersCard.vue'
import { paperApi } from '@/services/paperApi'

const selectedConference = ref('')
const selectedYear = ref('')
const facets = ref({ conferences: [], years: [] })
const overview = ref(null)
const recentPapers = ref([])
const loading = ref(false)
const hasLoaded = ref(false)
const facetsLoaded = ref(false)
const loadError = ref('')
let requestSequence = 0

const initialLoading = computed(() => loading.value && !hasLoaded.value)
const refreshing = computed(() => loading.value && hasLoaded.value)
const displayedHasActiveScope = computed(() => Boolean(overview.value?.scope.conference || overview.value?.scope.year))
const emptyDatabase = computed(() => hasLoaded.value && !displayedHasActiveScope.value && overview.value?.papers.value === 0)
const emptyScope = computed(() => hasLoaded.value && displayedHasActiveScope.value && overview.value?.papers.value === 0)
const recentEmptyMessage = computed(() => {
  if (loadError.value && !hasLoaded.value) return 'Recent papers could not be loaded.'
  if (emptyDatabase.value) return 'No papers are stored yet.'
  if (emptyScope.value) return 'No papers match the selected conference and year.'
  return 'No recent papers are available.'
})

const numberFormatter = new Intl.NumberFormat('en-US')
const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function comparison(metric, comparisonYear) {
  if (!comparisonYear) return { label: 'No year comparison', tone: 'neutral' }
  if (metric.previous_value === 0 || metric.delta_percent == null) {
    return { label: 'No prior-year baseline', tone: 'neutral' }
  }
  const delta = Number(metric.delta_percent)
  const sign = delta > 0 ? '+' : ''
  return {
    label: `${sign}${delta}% vs ${comparisonYear - 1}`,
    tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'
  }
}

function formatLastSync(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'No data'
  const elapsed = Math.max(0, Date.now() - timestamp)
  const hours = Math.floor(elapsed / (60 * 60 * 1000))
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return shortDateFormatter.format(timestamp)
}

const stats = computed(() => {
  if (!overview.value) return []
  const paperComparison = comparison(overview.value.papers, overview.value.scope.year)
  const topicComparison = comparison(overview.value.topics, overview.value.scope.year)
  const quality = overview.value.data_quality.complete_percent
  const syncStatus = overview.value.last_sync.status
  return [
    {
      key: 'papers', label: 'Papers', value: numberFormatter.format(overview.value.papers.value),
      delta: paperComparison.label, deltaTone: paperComparison.tone, icon: 'papers', tone: 'blue'
    },
    {
      key: 'topics', label: 'Unique topics', value: numberFormatter.format(overview.value.topics.value),
      delta: topicComparison.label, deltaTone: topicComparison.tone, icon: 'topics', tone: 'violet'
    },
    {
      key: 'conferences', label: 'Conferences', value: numberFormatter.format(overview.value.conferences.value),
      delta: `${overview.value.conferences.value === 1 ? 'Conference' : 'Conferences'} represented`,
      deltaTone: 'neutral', icon: 'conferences', tone: 'blue'
    },
    {
      key: 'sync', label: 'Last update', value: formatLastSync(overview.value.last_sync.value),
      delta: syncStatus === 'empty' ? 'No stored data' : `${syncStatus === 'up-to-date' ? 'Up to date' : 'Stale'} · ${quality}% complete`,
      deltaTone: syncStatus === 'up-to-date' ? 'positive' : 'neutral', icon: 'sync', tone: 'teal', status: syncStatus
    }
  ]
})

function currentParams() {
  return { conference: selectedConference.value, year: selectedYear.value }
}

async function loadDashboard({ includeFacets = false } = {}) {
  const requestId = ++requestSequence
  loading.value = true
  loadError.value = ''
  try {
    const requests = [
      paperApi.overviewStats(currentParams()),
      paperApi.recent({ ...currentParams(), limit: 4 })
    ]
    if (includeFacets) requests.push(paperApi.facets())
    const [statsResult, recentResult, facetsResult] = await Promise.all(requests)
    if (requestId !== requestSequence) return
    overview.value = statsResult
    recentPapers.value = recentResult
    if (facetsResult) {
      facets.value = facetsResult
      facetsLoaded.value = true
    }
    hasLoaded.value = true
  } catch (error) {
    if (requestId !== requestSequence) return
    loadError.value = `Unable to load the dashboard: ${error.message}`
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

function refreshDashboard() {
  loadDashboard({ includeFacets: !facetsLoaded.value })
}

onMounted(() => loadDashboard({ includeFacets: true }))
onBeforeUnmount(() => { requestSequence += 1 })
</script>

<template>
  <div class="overview">
    <TopBar />

    <div class="page-head">
      <div>
        <h1>Good morning!</h1>
        <p class="subtitle">Explore the latest research trends in computer vision.</p>
      </div>
      <div class="page-filters">
        <label class="select-btn filter-select">
          <Layers />
          <span class="sr-only">Conference</span>
          <select v-model="selectedConference" :disabled="initialLoading" @change="refreshDashboard">
            <option value="">All conferences</option>
            <option value="CVPR">CVPR</option>
            <option value="ICCV">ICCV</option>
            <option value="ECCV">ECCV</option>
          </select>
          <ChevronDown class="chevron" />
        </label>
        <label class="select-btn filter-select">
          <Calendar />
          <span class="sr-only">Publication year</span>
          <select v-model="selectedYear" :disabled="initialLoading" @change="refreshDashboard">
            <option value="">All years</option>
            <option v-for="year in facets.years" :key="year" :value="year">{{ year }}</option>
          </select>
          <ChevronDown class="chevron" />
        </label>
      </div>
    </div>

    <div v-if="loadError" class="dashboard-message error" role="alert">
      <span>{{ loadError }}</span>
      <button type="button" @click="refreshDashboard"><RefreshCw :size="16" /> Retry</button>
    </div>
    <div v-else-if="refreshing" class="dashboard-message refreshing" role="status">
      <RefreshCw :size="16" /> Updating dashboard…
    </div>

    <div v-if="initialLoading" class="stats-grid" aria-label="Loading overview statistics">
      <div v-for="index in 4" :key="index" class="card stat-skeleton"><span></span><strong></strong><small></small></div>
    </div>
    <div v-else-if="stats.length" class="stats-grid">
      <StatCard v-for="stat in stats" :key="stat.key" :stat="stat" />
    </div>

    <p v-if="emptyDatabase" class="scope-note">The paper database is empty. Import or add papers to populate live dashboard metrics.</p>
    <p v-else-if="emptyScope" class="scope-note">No papers match the selected conference and year.</p>

    <div class="mid-grid">
      <HotTopicsCard />
      <KeywordNetwork />
    </div>

    <RecentPapersCard :papers="recentPapers" :loading="initialLoading" :empty-message="recentEmptyMessage" />
  </div>
</template>

<style scoped>
.overview {
  max-width: 100%;
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 7px;
}

h1 {
  font-size: 32px;
  font-weight: 800;
}

.subtitle {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 16px;
}

.page-filters {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.filter-select {
  position: relative;
  min-width: 174px;
  padding: 0;
}

.filter-select > .lucide:first-child {
  position: absolute;
  z-index: 1;
  left: 15px;
  pointer-events: none;
}

.filter-select select {
  width: 100%;
  min-height: 42px;
  appearance: none;
  padding: 9px 40px 9px 43px;
  border: 0;
  outline: 0;
  border-radius: inherit;
  color: var(--text-primary);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.filter-select select:disabled {
  cursor: wait;
  opacity: .65;
}

.filter-select .chevron {
  position: absolute;
  right: 14px;
  pointer-events: none;
}

.dashboard-message {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 14px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
}

.dashboard-message.error {
  justify-content: space-between;
  color: #a83d57;
  background: #ffedf2;
}

.dashboard-message.error button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  font-weight: 700;
}

.dashboard-message.refreshing {
  color: var(--accent);
  background: var(--accent-soft);
}

.dashboard-message.refreshing .lucide {
  animation: spin .9s linear infinite;
}

.scope-note {
  margin: 0 0 16px;
  padding: 11px 14px;
  border: 1px solid #e5e0ff;
  border-radius: 10px;
  color: var(--text-secondary);
  background: #faf9ff;
  font-size: 14px;
}

.stat-skeleton {
  height: 133px;
  padding: 22px;
  overflow: hidden;
}

.stat-skeleton span,
.stat-skeleton strong,
.stat-skeleton small {
  display: block;
  border-radius: 6px;
  background: linear-gradient(90deg, #f0f1f6 25%, #f8f8fb 45%, #f0f1f6 65%);
  background-size: 220% 100%;
  animation: shimmer 1.2s ease-in-out infinite;
}

.stat-skeleton span { width: 42%; height: 16px; }
.stat-skeleton strong { width: 32%; height: 31px; margin-top: 17px; }
.stat-skeleton small { width: 55%; height: 12px; margin-top: 9px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes shimmer { to { background-position: -220% 0; } }
@keyframes spin { to { transform: rotate(360deg); } }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.mid-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  height: 421px;
  margin-bottom: 24px;
}

.mid-grid > .card {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .mid-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
