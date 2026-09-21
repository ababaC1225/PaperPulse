<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import { paperApi } from '@/services/paperApi'

const maximumYear = new Date().getUTCFullYear() + 1
const query = ref('')
const papers = ref([])
const total = ref(0)
const offset = ref(0)
const page = ref(1)
const pageCount = ref(0)
const hasPrevious = ref(false)
const hasNext = ref(false)
const loadError = ref('')
const listLoading = ref(false)
const filtersOpen = ref(false)
const filters = ref(defaultFilters())
const draftFilters = ref(defaultFilters())
const filterError = ref('')
const formOpen = ref(false)
const formMode = ref('create')
const editingId = ref(null)
const form = ref(emptyForm())
const formErrors = ref({})
const formError = ref('')
const saving = ref(false)
const deleteTarget = ref(null)
const deleteError = ref('')
const deleting = ref(false)
const notice = ref('')
let searchTimer = null
let requestSequence = 0

const activeFilterCount = computed(() => ['conference', 'year', 'dataStatus', 'sourceName']
  .filter((key) => filters.value[key] !== '').length)
const hasActiveCriteria = computed(() => Boolean(query.value.trim()) || activeFilterCount.value > 0)
const showingStart = computed(() => total.value ? offset.value + 1 : 0)
const showingEnd = computed(() => Math.min(offset.value + papers.value.length, total.value))
const visiblePages = computed(() => {
  const count = pageCount.value
  if (count <= 5) return Array.from({ length: count }, (_, index) => index + 1)
  const start = Math.min(Math.max(page.value - 2, 1), count - 4)
  return Array.from({ length: 5 }, (_, index) => start + index)
})

const statusClass = (status) => status.toLowerCase().replace(/\s+/g, '-')

function defaultFilters() {
  return { conference: '', year: '', dataStatus: '', sourceName: '', sort: 'updated_desc', pageSize: 20 }
}

function emptyForm() {
  return {
    title: '', conference: 'CVPR', year: new Date().getUTCFullYear(), authors: '',
    abstract: '', keywords: '', original_url: '', doi: ''
  }
}

function displayPaper(paper) {
  const statuses = {
    complete: 'Complete',
    missing_fields: 'Missing fields',
    fetch_failed: 'Fetch failed'
  }
  return {
    ...paper,
    id: paper.paper_id,
    topic: paper.keywords?.[0] || 'Unclassified',
    status: statuses[paper.data_status] || paper.data_status
  }
}

async function loadPapers() {
  const requestId = ++requestSequence
  listLoading.value = true
  loadError.value = ''
  const requestedOffset = (page.value - 1) * filters.value.pageSize
  try {
    const result = await paperApi.list({
      query: query.value.trim(),
      conference: filters.value.conference,
      year: filters.value.year,
      data_status: filters.value.dataStatus,
      source_name: filters.value.sourceName.trim(),
      sort: filters.value.sort,
      limit: filters.value.pageSize,
      offset: requestedOffset
    })
    if (requestId !== requestSequence) return
    papers.value = result.items.map(displayPaper)
    total.value = result.total
    offset.value = result.offset
    page.value = result.page
    pageCount.value = result.page_count
    hasPrevious.value = result.has_previous
    hasNext.value = result.has_next
  } catch (error) {
    if (requestId !== requestSequence) return
    loadError.value = `Unable to load the paper library: ${error.message}`
  } finally {
    if (requestId === requestSequence) listLoading.value = false
  }
}

async function loadValidPage() {
  await loadPapers()
  if (loadError.value) return
  if (pageCount.value > 0 && page.value > pageCount.value) {
    page.value = pageCount.value
    await loadPapers()
  } else if (pageCount.value === 0) {
    page.value = 1
  }
}

function toggleFilters() {
  if (!filtersOpen.value) draftFilters.value = { ...filters.value }
  filterError.value = ''
  filtersOpen.value = !filtersOpen.value
}

function applyFilters() {
  const year = draftFilters.value.year === '' ? '' : Number(draftFilters.value.year)
  if (year !== '' && (!Number.isInteger(year) || year < 1980 || year > maximumYear)) {
    filterError.value = `Enter a year from 1980 to ${maximumYear}.`
    return
  }
  filters.value = {
    ...draftFilters.value,
    year,
    sourceName: draftFilters.value.sourceName.trim(),
    pageSize: Number(draftFilters.value.pageSize)
  }
  filterError.value = ''
  filtersOpen.value = false
  page.value = 1
  loadPapers()
}

function clearFilters() {
  filters.value = defaultFilters()
  draftFilters.value = defaultFilters()
  filterError.value = ''
  filtersOpen.value = false
  page.value = 1
  loadPapers()
}

function goToPage(target) {
  if (listLoading.value || target < 1 || target > pageCount.value || target === page.value) return
  page.value = target
  loadPapers()
}

function openCreate() {
  formMode.value = 'create'
  editingId.value = null
  form.value = emptyForm()
  formErrors.value = {}
  formError.value = ''
  formOpen.value = true
}

function openEdit(paper) {
  formMode.value = 'edit'
  editingId.value = paper.paper_id || paper.id
  form.value = {
    title: paper.title || '',
    conference: paper.conference || 'CVPR',
    year: paper.year || new Date().getUTCFullYear(),
    authors: paper.authors?.join(', ') || '',
    abstract: paper.abstract || '',
    keywords: paper.keywords?.join(', ') || '',
    original_url: paper.original_url || '',
    doi: paper.doi || ''
  }
  formErrors.value = {}
  formError.value = ''
  formOpen.value = true
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
}

function validateForm() {
  const errors = {}
  if (!form.value.title.trim()) errors.title = 'Title is required.'
  if (!['CVPR', 'ICCV', 'ECCV'].includes(form.value.conference)) errors.conference = 'Choose CVPR, ICCV, or ECCV.'
  const year = Number(form.value.year)
  if (!Number.isInteger(year) || year < 1980 || year > maximumYear) errors.year = `Enter a year from 1980 to ${maximumYear}.`
  if (form.value.original_url.trim()) {
    try {
      const url = new URL(form.value.original_url.trim())
      if (!['http:', 'https:'].includes(url.protocol)) errors.original_url = 'Use an HTTP or HTTPS URL.'
    } catch { errors.original_url = 'Enter a valid URL.' }
  }
  formErrors.value = errors
  return Object.keys(errors).length === 0
}

async function savePaper() {
  if (saving.value || !validateForm()) return
  saving.value = true
  formError.value = ''
  formErrors.value = {}
  const payload = {
    ...form.value,
    year: Number(form.value.year)
  }
  try {
    if (formMode.value === 'create') {
      await paperApi.create(payload)
      notice.value = 'Paper created successfully.'
      page.value = 1
    } else {
      await paperApi.update(editingId.value, payload)
      notice.value = 'Paper updated successfully.'
    }
    formOpen.value = false
    await loadValidPage()
  } catch (error) {
    formError.value = error.message
    formErrors.value = error.details?.fields || {}
  } finally { saving.value = false }
}

function requestDelete(paper) {
  deleteTarget.value = paper
  deleteError.value = ''
}

function closeDelete() {
  if (deleting.value) return
  deleteTarget.value = null
}

async function confirmDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await paperApi.delete(deleteTarget.value.paper_id || deleteTarget.value.id)
    deleteTarget.value = null
    notice.value = 'Paper deleted. It will no longer appear in subsequent analysis.'
    await loadValidPage()
  } catch (error) { deleteError.value = error.message }
  finally { deleting.value = false }
}

watch(query, () => {
  requestSequence += 1
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadPapers()
  }, 350)
})

onMounted(loadPapers)
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  requestSequence += 1
})
</script>

<template>
  <div class="screen-page library-page">
    <TopBar />
    <div class="page-head">
      <div>
        <h1>Paper Library</h1>
        <p class="subtitle">Search, review, and maintain the papers behind your analysis.</p>
      </div>
    </div>

    <div v-if="notice" class="notice success" role="status"><CheckCircle2 :size="18" /><span>{{ notice }}</span><button aria-label="Dismiss notification" @click="notice = ''"><X :size="16" /></button></div>

    <div class="library-toolbar">
      <label class="local-search">
        <Search :size="18" />
        <input v-model="query" type="search" aria-label="Search papers" placeholder="Search ID, title, author, or keyword..." />
      </label>
      <button class="outline-btn filter-toggle" :class="{ active: filtersOpen || activeFilterCount }" type="button" aria-controls="paper-filters" :aria-expanded="filtersOpen" @click="toggleFilters">
        Filters <span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span><ChevronDown :size="15" :class="{ rotated: filtersOpen }" />
      </button>
      <router-link class="outline-btn" to="/import">Import papers</router-link>
      <button class="dark-btn add-paper" type="button" @click="openCreate"><Plus :size="16" /> New paper</button>
    </div>

    <form v-if="filtersOpen" id="paper-filters" class="filter-panel" @submit.prevent="applyFilters">
      <label><span>Conference</span><select v-model="draftFilters.conference"><option value="">All conferences</option><option value="CVPR">CVPR</option><option value="ICCV">ICCV</option><option value="ECCV">ECCV</option></select></label>
      <label><span>Year</span><input v-model="draftFilters.year" type="number" min="1980" :max="maximumYear" placeholder="Any year" /></label>
      <label><span>Data status</span><select v-model="draftFilters.dataStatus"><option value="">All statuses</option><option value="complete">Complete</option><option value="missing_fields">Missing fields</option><option value="fetch_failed">Fetch failed</option></select></label>
      <label><span>Source name</span><input v-model="draftFilters.sourceName" maxlength="100" placeholder="Any source" /></label>
      <label><span>Sort by</span><select v-model="draftFilters.sort"><option value="updated_desc">Recently updated</option><option value="updated_asc">Oldest updated</option><option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option><option value="year_desc">Year newest first</option><option value="year_asc">Year oldest first</option></select></label>
      <label><span>Rows per page</span><select v-model.number="draftFilters.pageSize"><option :value="10">10</option><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label>
      <p v-if="filterError" class="filter-error" role="alert">{{ filterError }}</p>
      <div class="filter-actions"><button class="clear-filter" type="button" @click="clearFilters">Clear filters</button><button class="dark-btn" type="submit">Apply filters</button></div>
    </form>

    <p v-if="loadError" class="load-note" role="alert"><span>{{ loadError }}</span><button type="button" @click="loadPapers">Retry</button></p>

    <section class="card library-card" :class="{ loading: listLoading }" :aria-busy="listLoading">
      <header class="library-card-header">
        <div><h2>All papers</h2><p>{{ total.toLocaleString() }} records</p></div>
        <div class="status-legend">
          <span class="status-pill complete">Complete</span>
          <span class="status-pill missing-fields">Missing fields</span>
          <span class="status-pill fetch-failed">Fetch failed</span>
        </div>
      </header>
      <div class="table-scroll">
        <table class="library-table">
          <thead><tr><th>ID</th><th>Paper title</th><th>Conference</th><th>Year</th><th>Topics</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="paper in papers" :key="paper.id" tabindex="0" @click="$router.push(`/papers/${paper.id}`)" @keydown.enter.self="$router.push(`/papers/${paper.id}`)">
              <td class="muted">{{ paper.id }}</td>
              <td class="title-cell">{{ paper.title }}</td>
              <td class="muted">{{ paper.conference }}</td>
              <td class="muted">{{ paper.year }}</td>
              <td><span class="topic-tag">{{ paper.topic }}</span></td>
              <td><span class="status-pill" :class="statusClass(paper.status)">{{ paper.status }}</span></td>
              <td class="row-actions">
                <button :aria-label="`Edit ${paper.title}`" title="Edit paper" @click.stop="openEdit(paper)"><Pencil :size="16" /></button>
                <button class="delete-action" :aria-label="`Delete ${paper.title}`" title="Delete paper" @click.stop="requestDelete(paper)"><Trash2 :size="16" /></button>
              </td>
            </tr>
            <tr v-if="!papers.length" class="empty-row"><td colspan="7">{{ listLoading ? 'Loading papers…' : hasActiveCriteria ? 'No papers match the current search and filters.' : 'No stored papers yet. Add a paper to begin.' }}</td></tr>
          </tbody>
        </table>
      </div>
      <footer class="library-footer">
        <span>Showing {{ showingStart }}–{{ showingEnd }} of {{ total.toLocaleString() }} papers</span>
        <nav class="pagination" aria-label="Paper library pages">
          <button type="button" aria-label="Previous page" :disabled="!hasPrevious || listLoading" @click="goToPage(page - 1)"><ChevronLeft :size="17" /></button>
          <button v-for="pageNumber in visiblePages" :key="pageNumber" type="button" :class="{ current: pageNumber === page }" :aria-current="pageNumber === page ? 'page' : undefined" @click="goToPage(pageNumber)">{{ pageNumber }}</button>
          <button type="button" aria-label="Next page" :disabled="!hasNext || listLoading" @click="goToPage(page + 1)"><ChevronRight :size="17" /></button>
        </nav>
      </footer>
    </section>

    <Teleport to="body">
      <div v-if="formOpen" class="modal-backdrop" role="presentation" @click.self="closeForm">
        <section class="paper-modal" role="dialog" aria-modal="true" aria-labelledby="paper-form-title">
          <header><div><p class="eyebrow">Paper Library</p><h2 id="paper-form-title">{{ formMode === 'create' ? 'New paper' : 'Edit paper' }}</h2></div><button aria-label="Close paper form" :disabled="saving" @click="closeForm"><X :size="20" /></button></header>
          <form @submit.prevent="savePaper">
            <p v-if="formError" class="form-alert" role="alert">{{ formError }}</p>
            <div class="form-grid">
              <label class="field field-wide"><span>Title *</span><input v-model="form.title" :class="{ invalid: formErrors.title }" autocomplete="off" /><small v-if="formErrors.title">{{ formErrors.title }}</small></label>
              <label class="field"><span>Conference *</span><select v-model="form.conference" :class="{ invalid: formErrors.conference }"><option>CVPR</option><option>ICCV</option><option>ECCV</option></select><small v-if="formErrors.conference">{{ formErrors.conference }}</small></label>
              <label class="field"><span>Year *</span><input v-model.number="form.year" type="number" min="1980" :max="maximumYear" :class="{ invalid: formErrors.year }" /><small v-if="formErrors.year">{{ formErrors.year }}</small></label>
              <label class="field field-wide"><span>Authors</span><input v-model="form.authors" placeholder="Separate names with commas" :class="{ invalid: formErrors.authors }" /><small v-if="formErrors.authors">{{ formErrors.authors }}</small></label>
              <label class="field field-wide"><span>Abstract</span><textarea v-model="form.abstract" rows="4" :class="{ invalid: formErrors.abstract }"></textarea><small v-if="formErrors.abstract">{{ formErrors.abstract }}</small></label>
              <label class="field field-wide"><span>Keywords</span><input v-model="form.keywords" placeholder="Separate keywords with commas" :class="{ invalid: formErrors.keywords }" /><small v-if="formErrors.keywords">{{ formErrors.keywords }}</small></label>
              <label class="field field-wide"><span>Original URL</span><input v-model="form.original_url" type="url" placeholder="https://..." :class="{ invalid: formErrors.original_url }" /><small v-if="formErrors.original_url">{{ formErrors.original_url }}</small></label>
              <label class="field field-wide"><span>DOI</span><input v-model="form.doi" placeholder="10.xxxx/xxxxx" :class="{ invalid: formErrors.doi }" /><small v-if="formErrors.doi">{{ formErrors.doi }}</small></label>
            </div>
            <footer><button type="button" class="outline-btn" :disabled="saving" @click="closeForm">Cancel</button><button type="submit" class="dark-btn" :disabled="saving">{{ saving ? 'Saving…' : formMode === 'create' ? 'Create paper' : 'Save changes' }}</button></footer>
          </form>
        </section>
      </div>

      <div v-if="deleteTarget" class="modal-backdrop" role="presentation" @click.self="closeDelete">
        <section class="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
          <div class="warning-icon"><AlertTriangle :size="24" /></div>
          <h2 id="delete-title">Delete this paper?</h2>
          <p><strong>{{ deleteTarget.title }}</strong> will be permanently removed from the library and excluded from all subsequent analysis.</p>
          <p v-if="deleteError" class="form-alert" role="alert">{{ deleteError }}</p>
          <footer><button class="outline-btn" :disabled="deleting" @click="closeDelete">Cancel</button><button class="danger-btn" :disabled="deleting" @click="confirmDelete"><Trash2 :size="16" /> {{ deleting ? 'Deleting…' : 'Delete paper' }}</button></footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:5px; }
h1 { font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.notice { display:flex; align-items:center; gap:10px; margin:14px 0; padding:12px 16px; border-radius:12px; font-size:14px; }
.notice.success { color:#197a5b; background:#e4f8f0; }
.notice span { flex:1; }
.notice button { display:grid; place-items:center; color:inherit; }
.library-toolbar { display:grid; grid-template-columns:minmax(280px,1fr) auto auto auto; align-items:center; gap:16px; margin-bottom:28px; }
.load-note { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:-12px 0 18px; padding:11px 14px; border-radius:10px; color:#9a6d00; background:#fff8e7; font-size:14px; }
.load-note button { flex:0 0 auto; color:var(--accent); font-weight:700; }
.local-search { display:flex; align-items:center; gap:11px; min-height:52px; padding:0 18px; border:1px solid var(--border); border-radius:12px; color:var(--text-muted); }
.local-search input { min-width:0; flex:1; border:0; outline:0; font:inherit; color:var(--text-primary); background:transparent; font-size:17px; }
.local-search input::placeholder { color:var(--text-muted); }
.outline-btn, .dark-btn, .danger-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:52px; padding:0 22px; border-radius:12px; font-size:16px; font-weight:600; }
.outline-btn { border:1px solid var(--border); background:#fff; color:var(--text-primary); box-shadow:var(--shadow-card); }
.outline-btn:hover { border-color:var(--accent); color:var(--accent); }
.filter-toggle.active { border-color:#cfc6ff; color:var(--accent); background:#faf8ff; }
.filter-toggle svg { transition:transform .18s ease; }
.filter-toggle svg.rotated { transform:rotate(180deg); }
.filter-count { display:inline-grid; place-items:center; min-width:22px; height:22px; padding:0 6px; border-radius:999px; color:#fff; background:var(--accent); font-size:12px; }
.dark-btn { border:0; background:var(--text-primary); color:#fff; }
.dark-btn:hover { background:var(--accent); }
.danger-btn { border:0; color:#fff; background:#df5d79; }
.danger-btn:hover { background:#c94b68; }
button:disabled, a[aria-disabled="true"] { cursor:not-allowed; opacity:.55; }
.add-paper { min-width:155px; }
.filter-panel { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px 18px; margin:-10px 0 24px; padding:20px; border:1px solid var(--border); border-radius:14px; background:#fff; box-shadow:var(--shadow-card); }
.filter-panel label { display:flex; flex-direction:column; gap:7px; color:var(--text-primary); font-size:14px; font-weight:600; }
.filter-panel input, .filter-panel select { width:100%; min-height:43px; padding:0 12px; border:1px solid var(--border); border-radius:9px; outline:0; color:var(--text-primary); background:#fff; font:inherit; font-weight:400; }
.filter-panel input:focus, .filter-panel select:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(108,92,231,.1); }
.filter-error { grid-column:1 / -1; margin:0; color:#c94b68; font-size:13px; }
.filter-actions { grid-column:1 / -1; display:flex; justify-content:flex-end; align-items:center; gap:14px; padding-top:2px; }
.filter-actions .dark-btn { min-height:43px; padding:0 20px; font-size:14px; }
.clear-filter { color:var(--text-secondary); font-size:14px; font-weight:600; }
.clear-filter:hover { color:var(--accent); }
.library-card { display:flex; flex-direction:column; height:726px; overflow:hidden; padding:24px 24px 0; transition:opacity .2s ease; }
.library-card.loading { opacity:.65; }
.library-card-header { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:14px; }
.library-card-header h2 { margin:0; font-family:var(--font-display); font-size:24px; }
.library-card-header p { margin:4px 0 0; color:var(--text-secondary); font-size:15px; }
.status-legend { display:flex; gap:18px; align-items:center; }
.status-pill { display:inline-flex; align-items:center; justify-content:center; padding:7px 15px; border-radius:999px; font-size:14px; font-weight:600; white-space:nowrap; }
.status-pill.complete { background:#e4f8f0; color:#2caa80; }
.status-pill.needs-review, .status-pill.review, .status-pill.missing-fields { background:#fff4d8; color:#bd8c0c; }
.status-pill.fetch-failed { background:#ffedf2; color:#c94b68; }
.table-scroll { flex:1; min-height:0; overflow:auto; }
.library-table { width:100%; min-width:1080px; border-collapse:collapse; }
.library-table th { padding:10px 0; text-align:left; color:var(--text-muted); font-size:14px; font-weight:500; border-bottom:1px solid var(--border); }
.library-table td { padding:17px 0; font-size:14px; border-bottom:1px solid #f0f1f6; }
.library-table tbody tr { cursor:pointer; transition:background .15s ease; }
.library-table tbody tr:hover, .library-table tbody tr:focus { background:#fafbff; outline:0; }
.library-table .empty-row { cursor:default; }
.library-table .empty-row td { padding:54px 16px; text-align:center; color:var(--text-secondary); }
.library-table th:not(:first-child), .library-table td:not(:first-child) { padding-left:18px; }
.title-cell { min-width:340px; color:var(--text-primary); font-weight:500; white-space:nowrap; }
.library-table th:first-child, .library-table td:first-child { width:72px; white-space:nowrap; }
.muted { color:var(--text-secondary); }
.topic-tag { display:inline-flex; padding:7px 15px; border-radius:999px; background:#efeaff; color:#9b7aff; white-space:nowrap; }
.row-actions { display:flex; gap:7px; min-width:86px; }
.row-actions button { display:grid; place-items:center; width:34px; height:34px; border:1px solid var(--border); border-radius:9px; color:var(--text-secondary); background:#fff; }
.row-actions button:hover { color:var(--accent); border-color:var(--accent); }
.row-actions .delete-action:hover { color:#df5d79; border-color:#f2a8b9; }
.library-footer { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:22px 0 26px; color:var(--text-secondary); font-size:16px; }
.pagination { display:flex; align-items:center; gap:12px; color:var(--text-primary); }
.pagination button { display:grid; place-items:center; min-width:30px; height:30px; padding:0 6px; border-radius:7px; color:inherit; font-size:15px; }
.pagination button:hover, .pagination .current { background:var(--accent-soft); color:var(--accent); }
.pagination button:disabled { color:var(--text-muted); background:transparent; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.modal-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:24px; background:rgba(20,21,43,.38); backdrop-filter:blur(3px); }
.paper-modal, .confirm-modal { width:min(720px,100%); max-height:calc(100vh - 48px); overflow:auto; border:1px solid var(--border); border-radius:18px; background:#fff; box-shadow:0 24px 70px rgba(20,21,43,.22); }
.paper-modal > header { display:flex; justify-content:space-between; align-items:flex-start; padding:24px 26px 18px; border-bottom:1px solid var(--border); }
.paper-modal header button { display:grid; place-items:center; width:36px; height:36px; border-radius:9px; color:var(--text-secondary); }
.paper-modal header button:hover { background:var(--bg-soft); }
.eyebrow { margin:0 0 4px; color:var(--accent); font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
.paper-modal h2, .confirm-modal h2 { margin:0; font-size:24px; }
.paper-modal form { padding:22px 26px 26px; }
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:17px 18px; }
.field { display:flex; flex-direction:column; gap:7px; color:var(--text-primary); font-size:14px; font-weight:600; }
.field-wide { grid-column:1 / -1; }
.field input, .field select, .field textarea { width:100%; border:1px solid var(--border); border-radius:10px; padding:11px 13px; outline:0; color:var(--text-primary); background:#fff; font:inherit; font-weight:400; }
.field textarea { resize:vertical; min-height:96px; line-height:1.5; }
.field input:focus, .field select:focus, .field textarea:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(108,92,231,.1); }
.field .invalid { border-color:#df5d79; }
.field small { color:#c94b68; font-size:12px; font-weight:500; }
.form-alert { margin:0 0 16px; padding:11px 13px; border-radius:10px; color:#a83d57; background:#ffedf2; font-size:14px; }
.paper-modal footer, .confirm-modal footer { display:flex; justify-content:flex-end; gap:12px; margin-top:24px; }
.paper-modal footer .outline-btn, .paper-modal footer .dark-btn, .confirm-modal footer button { min-height:44px; font-size:14px; }
.confirm-modal { width:min(470px,100%); padding:28px; text-align:center; }
.warning-icon { display:grid; place-items:center; width:52px; height:52px; margin:0 auto 16px; border-radius:50%; color:#c94b68; background:#ffedf2; }
.confirm-modal p { margin:12px 0 0; color:var(--text-secondary); font-size:15px; line-height:1.55; }
.confirm-modal p strong { color:var(--text-primary); }
.confirm-modal .form-alert { margin-top:18px; text-align:left; }
@media (max-width:1000px) { .library-toolbar { grid-template-columns:1fr 1fr; } .filter-panel { grid-template-columns:repeat(2,minmax(0,1fr)); } .add-paper { width:100%; } .status-legend { flex-wrap:wrap; justify-content:flex-end; } }
@media (max-width:640px) { .library-toolbar, .filter-panel { grid-template-columns:1fr; } .filter-actions, .filter-error { grid-column:auto; } .filter-actions { justify-content:space-between; } .library-card { padding:24px 20px 0; } .library-card-header, .library-footer { align-items:flex-start; flex-direction:column; } .pagination { flex-wrap:wrap; } .modal-backdrop { align-items:end; padding:0; } .paper-modal, .confirm-modal { max-height:92vh; border-radius:18px 18px 0 0; } .form-grid { grid-template-columns:1fr; } .field-wide { grid-column:auto; } .paper-modal form, .paper-modal > header { padding-left:20px; padding-right:20px; } }
</style>
