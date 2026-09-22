<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRight, Clock3, RotateCcw, Search, Upload } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import { paperApi } from '@/services/paperApi'

const emptyCounts = Object.freeze({
  total: 0, pending: 0, processing: 0, successful: 0, duplicate: 0, missing_fields: 0, failed: 0
})
const historyPageSize = 10
const title = ref('')
const candidates = ref([])
const searchLoading = ref(false)
const searchError = ref('')
const confirmingId = ref('')
const confirmedId = ref('')
const fileName = ref('')
const fileContent = ref('')
const fileFormat = ref('txt')
const pasteOpen = ref(false)
const pastedTitles = ref('')
const importJob = ref(null)
const selectedJobId = ref('')
const importError = ref('')
const detailError = ref('')
const importLoading = ref(false)
const detailLoading = ref(false)
const retryLoading = ref(false)
const showLog = ref(false)
const historyJobs = ref([])
const historyTotal = ref(0)
const historyHasMore = ref(false)
const historyLoading = ref(false)
const historyLoadingMore = ref(false)
const historyError = ref('')
let pollTimer = null
let detailRequestSequence = 0
let historyRequestSequence = 0
let disposed = false

const counts = computed(() => importJob.value?.counts || emptyCounts)
const processed = computed(() => processedCount(counts.value))
const progress = computed(() => progressPercent(counts.value))
const active = computed(() => isActiveStatus(importJob.value?.status))

function isActiveStatus(status) {
  return ['pending', 'processing'].includes(status)
}

function processedCount(jobCounts = emptyCounts) {
  return jobCounts.total - jobCounts.pending - jobCounts.processing
}

function progressPercent(jobCounts = emptyCounts) {
  return jobCounts.total ? Math.round((processedCount(jobCounts) / jobCounts.total) * 100) : 0
}

function statusLabel(status) {
  return String(status || 'unknown').replaceAll('_', ' ')
}

function taskStatusClass(status) {
  if (isActiveStatus(status)) return 'processing'
  return status === 'failed' ? 'failed' : 'complete'
}

function formatCreatedAt(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Time unavailable'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(timestamp)
}

function toSummary(job) {
  return {
    job_id: job.job_id,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    counts: job.counts || emptyCounts
  }
}

function upsertHistory(job) {
  if (!job?.job_id) return
  const summary = toSummary(job)
  const existed = historyJobs.value.some((item) => item.job_id === summary.job_id)
  historyJobs.value = [summary, ...historyJobs.value.filter((item) => item.job_id !== summary.job_id)]
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.job_id.localeCompare(left.job_id))
  if (!existed) historyTotal.value += 1
}

async function searchPaper() {
  if (!title.value.trim() || searchLoading.value) return
  searchLoading.value = true
  searchError.value = ''
  confirmedId.value = ''
  try {
    const result = await paperApi.search(title.value.trim())
    candidates.value = result.candidates
    if (!result.candidates.length) searchError.value = 'No matching paper was found. Try a more complete title.'
  } catch (error) {
    searchError.value = error.message
    candidates.value = []
  } finally { searchLoading.value = false }
}

async function confirmCandidate(candidate) {
  confirmingId.value = candidate.candidate_id
  searchError.value = ''
  try {
    await paperApi.confirm(candidate.candidate_id)
    confirmedId.value = candidate.candidate_id
  } catch (error) { searchError.value = error.message }
  finally { confirmingId.value = '' }
}

async function loadFile(file) {
  if (!file) return
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['csv', 'txt'].includes(extension)) {
    importError.value = 'Choose a CSV or TXT file.'
    return
  }
  fileName.value = file.name
  fileFormat.value = extension
  fileContent.value = await file.text()
  importError.value = ''
}

function chooseFile(event) { loadFile(event.target.files?.[0]) }
function dropFile(event) { loadFile(event.dataTransfer?.files?.[0]) }

async function loadHistory({ append = false } = {}) {
  const requestId = ++historyRequestSequence
  const offset = append ? historyJobs.value.length : 0
  if (append) historyLoadingMore.value = true
  else historyLoading.value = true
  historyError.value = ''
  try {
    const response = await paperApi.listImports({ limit: historyPageSize, offset })
    if (disposed || requestId !== historyRequestSequence) return
    if (append) {
      const known = new Set(historyJobs.value.map((job) => job.job_id))
      historyJobs.value = [...historyJobs.value, ...response.items.filter((job) => !known.has(job.job_id))]
    } else {
      historyJobs.value = response.items
    }
    historyTotal.value = response.total
    historyHasMore.value = response.has_more
  } catch (error) {
    if (requestId !== historyRequestSequence) return
    historyError.value = `Unable to load import history: ${error.message}`
  } finally {
    if (requestId === historyRequestSequence) {
      historyLoading.value = false
      historyLoadingMore.value = false
    }
  }
}

function stopPolling({ invalidate = false } = {}) {
  window.clearTimeout(pollTimer)
  pollTimer = null
  if (invalidate) detailRequestSequence += 1
}

function schedulePolling(jobId) {
  window.clearTimeout(pollTimer)
  pollTimer = window.setTimeout(() => {
    pollTimer = null
    loadSelectedJob(jobId, { fromPoll: true })
  }, 700)
}

async function loadSelectedJob(jobId, { showLoading = false, fromPoll = false } = {}) {
  const requestId = ++detailRequestSequence
  if (showLoading) detailLoading.value = true
  detailError.value = ''
  try {
    const job = await paperApi.getImport(jobId)
    if (disposed || requestId !== detailRequestSequence || selectedJobId.value !== jobId) return
    const wasActive = importJob.value?.job_id === jobId && isActiveStatus(importJob.value.status)
    importJob.value = job
    upsertHistory(job)
    if (isActiveStatus(job.status)) {
      schedulePolling(jobId)
    } else {
      stopPolling()
      if (fromPoll || wasActive) loadHistory()
    }
  } catch (error) {
    if (requestId !== detailRequestSequence) return
    detailError.value = `Unable to load import details: ${error.message}`
    stopPolling()
  } finally {
    if (requestId === detailRequestSequence) detailLoading.value = false
  }
}

async function selectHistoryJob(jobId) {
  stopPolling({ invalidate: true })
  selectedJobId.value = jobId
  importJob.value = null
  showLog.value = true
  const detailRequest = loadSelectedJob(jobId, { showLoading: true })
  await nextTick()
  document.getElementById('import-task')?.scrollIntoView({ block: 'start' })
  await detailRequest
}

function reloadSelectedJob() {
  if (selectedJobId.value) loadSelectedJob(selectedJobId.value, { showLoading: true })
}

async function startImport() {
  const content = pasteOpen.value ? pastedTitles.value : fileContent.value
  if (!content.trim()) {
    importError.value = pasteOpen.value ? 'Paste at least one paper title.' : 'Choose a CSV/TXT file or paste titles first.'
    return
  }
  importLoading.value = true
  importError.value = ''
  detailError.value = ''
  try {
    const format = pasteOpen.value ? 'txt' : fileFormat.value
    const job = await paperApi.createImport({ content, format, file_name: pasteOpen.value ? 'pasted-titles.txt' : fileName.value })
    stopPolling({ invalidate: true })
    selectedJobId.value = job.job_id
    importJob.value = job
    showLog.value = false
    upsertHistory(job)
    loadHistory()
    if (isActiveStatus(job.status)) schedulePolling(job.job_id)
  } catch (error) { importError.value = error.message }
  finally { importLoading.value = false }
}

async function retryFailed() {
  if (!importJob.value || retryLoading.value) return
  retryLoading.value = true
  detailError.value = ''
  stopPolling({ invalidate: true })
  try {
    const job = await paperApi.retryImport(importJob.value.job_id)
    selectedJobId.value = job.job_id
    importJob.value = job
    upsertHistory(job)
    await loadHistory()
    if (isActiveStatus(job.status)) schedulePolling(job.job_id)
  } catch (error) { detailError.value = error.message }
  finally { retryLoading.value = false }
}

onMounted(() => loadHistory())
onBeforeUnmount(() => {
  disposed = true
  historyRequestSequence += 1
  stopPolling({ invalidate: true })
})
</script>

<template>
  <div class="screen-page import-page">
    <TopBar />
    <div class="page-head"><div><h1>Import Papers</h1><p class="subtitle">Bring single papers or batches into your research library.</p></div></div>

    <div class="import-grid">
      <section class="card import-card">
        <h2>Single paper lookup</h2>
        <p>Find a paper by title and review the source before saving.</p>
        <label class="paper-input"><input v-model="title" placeholder="Enter paper title..." @keyup.enter="searchPaper" /></label>
        <button class="dark-btn" :disabled="searchLoading || !title.trim()" @click="searchPaper"><Search :size="16" /> {{ searchLoading ? 'Searching…' : 'Search paper' }}</button>
        <p v-if="searchError" class="form-error">{{ searchError }}</p>
        <div v-for="candidate in candidates.slice(0, 3)" :key="candidate.candidate_id" class="candidate-result">
          <span>{{ candidate.exact_match ? 'Exact match' : `Candidate · ${Math.round(candidate.match_score * 100)}% match` }}</span>
          <strong>{{ candidate.title }}</strong>
          <p>{{ candidate.conference || 'Conference unavailable' }} {{ candidate.year || '' }} · {{ candidate.source_name.toUpperCase() }}</p>
          <button class="small-light" :disabled="confirmingId === candidate.candidate_id || confirmedId === candidate.candidate_id" @click="confirmCandidate(candidate)">
            {{ confirmedId === candidate.candidate_id ? 'Added to library' : confirmingId === candidate.candidate_id ? 'Saving…' : 'Add to library' }}
          </button>
        </div>
      </section>

      <section class="card import-card">
        <h2>Batch import</h2>
        <p>Upload CSV / TXT or paste a list of titles.</p>
        <label class="drop-zone" @dragover.prevent @drop.prevent="dropFile">
          <Upload :size="34" />
          <strong>Drop file here or browse</strong>
          <span>{{ fileName || 'CSV or TXT · up to 500 papers' }}</span>
          <input type="file" accept=".csv,.txt,text/plain,text/csv" @change="chooseFile" />
        </label>
        <textarea v-if="pasteOpen" v-model="pastedTitles" class="paste-area" rows="4" placeholder="Paste one paper title per line"></textarea>
        <p v-if="importError" class="form-error">{{ importError }}</p>
        <div class="batch-actions"><button class="outline-btn" @click="pasteOpen = !pasteOpen">{{ pasteOpen ? 'Use file' : 'Paste titles' }}</button><button class="dark-btn" :disabled="importLoading || active" @click="startImport">{{ importLoading ? 'Starting…' : 'Start import' }}</button></div>
      </section>
    </div>

    <section id="import-task" class="card import-task">
      <h2>Import task</h2>
      <p v-if="detailLoading && !importJob" class="task-state">Loading import details…</p>
      <div v-else-if="detailError && !importJob" class="task-state task-error" role="alert"><span>{{ detailError }}</span><button type="button" @click="reloadSelectedJob">Retry</button></div>
      <template v-else-if="importJob">
        <div v-if="detailError" class="task-inline-error" role="alert"><span>{{ detailError }}</span><button type="button" @click="reloadSelectedJob">Retry details</button></div>
        <div class="task-summary"><span class="status-pill" :class="taskStatusClass(importJob.status)">{{ statusLabel(importJob.status) }}</span><strong>{{ processed }} / {{ counts.total }} papers</strong></div>
        <div class="progress-track"><span :style="{ width: `${progress}%` }"></span></div>
        <p class="progress-label">{{ progress }}% complete</p>
        <div class="task-stats"><div><span>Successful</span><strong>{{ counts.successful }}</strong></div><div><span>Duplicates</span><strong>{{ counts.duplicate }}</strong></div><div><span>Missing fields</span><strong>{{ counts.missing_fields }}</strong></div><div><span>Failed</span><strong>{{ counts.failed }}</strong></div></div>
        <div class="task-actions"><button class="outline-btn" @click="showLog = !showLog">{{ showLog ? 'Hide import log' : 'View import log' }} <ArrowRight :size="15" /></button><button v-if="counts.failed && !active" class="retry-btn" :disabled="retryLoading" @click="retryFailed"><RotateCcw :size="15" /> {{ retryLoading ? 'Retrying…' : 'Retry failed' }}</button></div>
        <div v-if="showLog" class="import-log"><div v-for="item in importJob.items" :key="item.item_id"><span>#{{ item.row_number }} {{ item.input_value }}</span><strong :class="`item-${item.status}`">{{ item.status.replace('_', ' ') }}</strong><small v-if="item.failure_reason">{{ item.failure_reason }}</small></div></div>
      </template>
      <p v-else class="empty-task">No batch import is running. Choose a file or paste titles to begin.</p>
    </section>

    <section class="card import-history">
      <header class="history-header">
        <div><h2>Import history</h2><p>Return to recent batch jobs and inspect their saved progress.</p></div>
        <span v-if="historyTotal">{{ historyTotal.toLocaleString() }} {{ historyTotal === 1 ? 'job' : 'jobs' }}</span>
      </header>

      <div v-if="historyError" class="history-error" role="alert"><span>{{ historyError }}</span><button type="button" @click="loadHistory()">Retry</button></div>
      <p v-if="historyLoading && !historyJobs.length" class="history-state">Loading import history…</p>
      <p v-else-if="!historyJobs.length && !historyError" class="history-state">No import jobs yet. Completed and active batch imports will appear here.</p>
      <div v-else class="history-list">
        <article v-for="job in historyJobs" :key="job.job_id" class="history-job" :class="{ selected: selectedJobId === job.job_id }">
          <div class="history-job-head">
            <span class="history-time"><Clock3 :size="15" />{{ formatCreatedAt(job.created_at) }}</span>
            <span class="status-pill" :class="taskStatusClass(job.status)">{{ statusLabel(job.status) }}</span>
          </div>
          <div class="history-progress-copy"><strong>{{ processedCount(job.counts) }} / {{ job.counts.total }} papers</strong><span>{{ progressPercent(job.counts) }}%</span></div>
          <div class="progress-track history-track"><span :style="{ width: `${progressPercent(job.counts)}%` }"></span></div>
          <div class="history-counts">
            <span><strong>{{ job.counts.successful }}</strong> successful</span>
            <span><strong>{{ job.counts.duplicate }}</strong> duplicates</span>
            <span><strong>{{ job.counts.missing_fields }}</strong> missing</span>
            <span><strong>{{ job.counts.failed }}</strong> failed</span>
          </div>
          <button class="view-details" type="button" :disabled="detailLoading && selectedJobId === job.job_id" @click="selectHistoryJob(job.job_id)">
            {{ detailLoading && selectedJobId === job.job_id ? 'Loading…' : 'View details' }} <ArrowRight :size="15" />
          </button>
        </article>
      </div>
      <button v-if="historyHasMore" class="load-more" type="button" :disabled="historyLoadingMore" @click="loadHistory({ append: true })">{{ historyLoadingMore ? 'Loading…' : 'Load more jobs' }}</button>
    </section>
  </div>
</template>

<style scoped>
.page-head { margin-bottom:34px; }
h1 { margin:0; font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.import-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.import-card { min-height:394px; padding:24px; }
.import-card h2, .import-task h2, .import-history h2 { margin:0 0 8px; font-family:var(--font-display); font-size:24px; }
.import-card > p { margin:0 0 24px; color:var(--text-secondary); font-size:15px; }
.paper-input { display:flex; min-height:46px; padding:0 16px; border:1px solid var(--border); border-radius:12px; }
.paper-input input { width:100%; border:0; outline:0; background:transparent; font:inherit; font-size:15px; }
.paper-input input::placeholder { color:var(--text-muted); }
.dark-btn, .outline-btn { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-height:46px; padding:0 20px; border-radius:12px; font-size:15px; font-weight:700; }
.dark-btn { border:0; background:var(--text-primary); color:#fff; }
.dark-btn:hover { background:var(--accent); }
button:disabled { cursor:not-allowed; opacity:.55; }
.import-card > .dark-btn { margin-top:14px; min-width:160px; }
.candidate-result { display:flex; flex-direction:column; align-items:flex-start; gap:5px; margin-top:16px; padding:14px 18px; border-radius:14px; background:#e8faf2; }
.candidate-result span, .candidate-result p { margin:0; color:var(--text-secondary); font-size:14px; }
.candidate-result strong { max-width:100%; font-size:14px; }
.small-light { padding:7px 14px; border:1px solid #d9f1e6; border-radius:999px; background:#fff; color:var(--text-primary); font-size:14px; }
.drop-zone { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; min-height:128px; border:1px solid var(--border); border-radius:14px; background:#fafbfe; color:var(--accent); cursor:pointer; }
.drop-zone strong { color:var(--text-primary); font-size:16px; }
.drop-zone span { color:var(--text-secondary); font-size:14px; }
.drop-zone input { display:none; }
.paste-area { width:100%; margin-top:12px; padding:12px 14px; resize:vertical; border:1px solid var(--border); border-radius:12px; font:inherit; color:var(--text-primary); outline:0; }
.paste-area:focus { border-color:var(--accent); }
.form-error { margin:10px 0 0 !important; color:#d95474 !important; font-size:14px !important; }
.batch-actions { display:flex; gap:18px; margin-top:24px; }
.outline-btn { border:1px solid var(--border); background:#fff; color:var(--text-primary); }
.outline-btn:hover { border-color:var(--accent); color:var(--accent); }
.import-task { min-height:350px; margin-top:30px; padding:24px; }
.task-summary { display:flex; align-items:center; gap:22px; margin:14px 0; font-size:15px; }
.status-pill { display:inline-flex; padding:7px 15px; border-radius:999px; font-size:14px; font-weight:600; text-transform:capitalize; }
.status-pill.processing { background:#fff4d8; color:#bd8c0c; }
.status-pill.complete { background:#e4f8f0; color:#2caa80; }
.status-pill.failed { background:#ffedf2; color:#d95474; }
.progress-track { height:10px; border-radius:999px; background:#f1f3f8; overflow:hidden; }
.progress-track span { display:block; height:100%; border-radius:inherit; background:#f2c452; transition:width .25s ease; }
.progress-label { margin:14px 0 22px; color:var(--text-secondary); font-size:15px; }
.task-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; padding:22px 0; border-top:1px solid var(--border); }
.task-stats div { display:flex; flex-direction:column; gap:9px; }
.task-stats span { color:var(--text-secondary); font-size:14px; }
.task-stats strong { font-family:var(--font-display); font-size:28px; }
.task-actions { display:flex; gap:18px; }
.retry-btn { display:inline-flex; align-items:center; gap:8px; padding:0 20px; min-height:46px; border:1px solid #f8c2cf; border-radius:12px; background:#fff; color:#d95474; font-size:15px; }
.empty-task { margin:56px 0; color:var(--text-secondary); font-size:15px; }
.task-state { display:flex; min-height:220px; align-items:center; justify-content:center; margin:0; color:var(--text-secondary); font-size:15px; }
.task-error { flex-direction:column; gap:12px; color:#b74461; text-align:center; }
.task-error button, .task-inline-error button, .history-error button { color:inherit; font-weight:700; }
.task-inline-error, .history-error { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:14px 0; padding:10px 13px; border-radius:10px; color:#b74461; background:#ffedf2; font-size:14px; }
.import-log { display:grid; gap:8px; max-height:260px; margin-top:18px; padding-top:18px; overflow:auto; border-top:1px solid var(--border); }
.import-log div { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 16px; padding:8px 0; font-size:14px; }
.import-log strong { text-transform:capitalize; }
.import-log small { grid-column:1 / -1; color:#d95474; }
.item-successful { color:#2caa80; } .item-duplicate, .item-missing_fields { color:#bd8c0c; } .item-failed { color:#d95474; }
.import-history { margin-top:30px; padding:24px; }
.history-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:18px; }
.history-header p { margin:0; color:var(--text-secondary); font-size:15px; }
.history-header > span { flex:0 0 auto; padding:6px 10px; border-radius:999px; color:var(--accent); background:var(--accent-soft); font-size:13px; font-weight:700; }
.history-state { display:flex; min-height:130px; align-items:center; justify-content:center; margin:0; color:var(--text-secondary); font-size:15px; text-align:center; }
.history-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.history-job { min-width:0; padding:17px; border:1px solid var(--border); border-radius:13px; background:#fff; transition:border-color .15s ease, box-shadow .15s ease; }
.history-job:hover, .history-job.selected { border-color:#cec5ff; box-shadow:0 6px 20px rgba(75,63,145,.08); }
.history-job.selected { background:#fcfbff; }
.history-job-head, .history-progress-copy { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.history-time { display:inline-flex; min-width:0; align-items:center; gap:7px; overflow:hidden; color:var(--text-secondary); font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
.history-time svg { flex:0 0 auto; }
.history-job .status-pill { padding:5px 10px; font-size:12px; }
.history-progress-copy { margin-top:16px; font-size:14px; }
.history-progress-copy span { color:var(--text-secondary); }
.history-track { height:7px; margin-top:8px; }
.history-counts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 12px; margin-top:14px; color:var(--text-secondary); font-size:12px; }
.history-counts strong { color:var(--text-primary); }
.view-details { display:inline-flex; align-items:center; gap:7px; margin-top:15px; color:var(--accent); font-size:13px; font-weight:700; }
.view-details:hover { gap:10px; }
.load-more { display:flex; min-height:42px; align-items:center; justify-content:center; margin:18px auto 0; padding:0 18px; border:1px solid var(--border); border-radius:10px; color:var(--text-primary); font-size:14px; font-weight:700; }
.load-more:hover { border-color:var(--accent); color:var(--accent); }
@media (max-width:900px) { .import-grid { grid-template-columns:1fr; } }
@media (max-width:760px) { .history-list { grid-template-columns:1fr; } }
@media (max-width:640px) { .import-card, .import-task, .import-history { padding:24px 20px; } .task-stats { grid-template-columns:repeat(2,1fr); } .batch-actions, .task-actions { flex-wrap:wrap; } .history-header { align-items:flex-start; flex-direction:column; } }
</style>
