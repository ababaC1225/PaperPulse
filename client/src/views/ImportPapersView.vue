<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { Search, Upload, ArrowRight, RotateCcw } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import { paperApi } from '@/services/paperApi'

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
const importError = ref('')
const importLoading = ref(false)
const showLog = ref(false)
let pollTimer

const counts = computed(() => importJob.value?.counts || {
  total: 0, pending: 0, processing: 0, successful: 0, duplicate: 0, missing_fields: 0, failed: 0
})
const processed = computed(() => counts.value.total - counts.value.pending - counts.value.processing)
const progress = computed(() => counts.value.total ? Math.round(processed.value / counts.value.total * 100) : 0)
const active = computed(() => ['pending', 'processing'].includes(importJob.value?.status))

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

async function pollJob(jobId) {
  clearTimeout(pollTimer)
  try {
    importJob.value = await paperApi.getImport(jobId)
    if (active.value) pollTimer = setTimeout(() => pollJob(jobId), 700)
  } catch (error) { importError.value = error.message }
}

async function startImport() {
  const content = pasteOpen.value ? pastedTitles.value : fileContent.value
  if (!content.trim()) {
    importError.value = pasteOpen.value ? 'Paste at least one paper title.' : 'Choose a CSV/TXT file or paste titles first.'
    return
  }
  importLoading.value = true
  importError.value = ''
  try {
    const format = pasteOpen.value ? 'txt' : fileFormat.value
    importJob.value = await paperApi.createImport({ content, format, file_name: pasteOpen.value ? 'pasted-titles.txt' : fileName.value })
    await pollJob(importJob.value.job_id)
  } catch (error) { importError.value = error.message }
  finally { importLoading.value = false }
}

async function retryFailed() {
  if (!importJob.value) return
  importError.value = ''
  try {
    importJob.value = await paperApi.retryImport(importJob.value.job_id)
    await pollJob(importJob.value.job_id)
  } catch (error) { importError.value = error.message }
}

onBeforeUnmount(() => clearTimeout(pollTimer))
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

    <section class="card import-task">
      <h2>Import task</h2>
      <template v-if="importJob">
        <div class="task-summary"><span class="status-pill" :class="active ? 'processing' : 'complete'">{{ active ? 'Processing' : importJob.status }}</span><strong>{{ processed }} / {{ counts.total }} papers</strong></div>
        <div class="progress-track"><span :style="{ width: `${progress}%` }"></span></div>
        <p class="progress-label">{{ progress }}% complete</p>
        <div class="task-stats"><div><span>Successful</span><strong>{{ counts.successful }}</strong></div><div><span>Duplicates</span><strong>{{ counts.duplicate }}</strong></div><div><span>Missing fields</span><strong>{{ counts.missing_fields }}</strong></div><div><span>Failed</span><strong>{{ counts.failed }}</strong></div></div>
        <div class="task-actions"><button class="outline-btn" @click="showLog = !showLog">{{ showLog ? 'Hide import log' : 'View import log' }} <ArrowRight :size="15" /></button><button v-if="counts.failed && !active" class="retry-btn" @click="retryFailed"><RotateCcw :size="15" /> Retry failed</button></div>
        <div v-if="showLog" class="import-log"><div v-for="item in importJob.items" :key="item.item_id"><span>#{{ item.row_number }} {{ item.input_value }}</span><strong :class="`item-${item.status}`">{{ item.status.replace('_', ' ') }}</strong><small v-if="item.failure_reason">{{ item.failure_reason }}</small></div></div>
      </template>
      <p v-else class="empty-task">No batch import is running. Choose a file or paste titles to begin.</p>
    </section>
  </div>
</template>

<style scoped>
.page-head { margin-bottom:34px; }
h1 { margin:0; font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.import-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.import-card { min-height:394px; padding:24px; }
.import-card h2, .import-task h2 { margin:0 0 8px; font-family:var(--font-display); font-size:24px; }
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
.import-log { display:grid; gap:8px; max-height:260px; margin-top:18px; padding-top:18px; overflow:auto; border-top:1px solid var(--border); }
.import-log div { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 16px; padding:8px 0; font-size:14px; }
.import-log strong { text-transform:capitalize; }
.import-log small { grid-column:1 / -1; color:#d95474; }
.item-successful { color:#2caa80; } .item-duplicate, .item-missing_fields { color:#bd8c0c; } .item-failed { color:#d95474; }
@media (max-width:900px) { .import-grid { grid-template-columns:1fr; } }
@media (max-width:640px) { .import-card, .import-task { padding:24px 20px; } .task-stats { grid-template-columns:repeat(2,1fr); } .batch-actions, .task-actions { flex-wrap:wrap; } }
</style>
