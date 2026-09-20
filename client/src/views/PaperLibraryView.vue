<script setup>
import { computed, onMounted, ref } from 'vue'
import { ChevronDown, MoreHorizontal, Plus, Search } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import { libraryPapers } from '@/data/mock'
import { paperApi } from '@/services/paperApi'

const query = ref('')
const papers = ref([])
const total = ref(0)
const loadError = ref('')
const usingFallback = ref(false)
const filteredPapers = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return papers.value
  return papers.value.filter((paper) => `${paper.id} ${paper.title} ${paper.topic} ${paper.authors?.join(' ')}`.toLowerCase().includes(needle))
})

const statusClass = (status) => status.toLowerCase().replace(/\s+/g, '-')

onMounted(async () => {
  try {
    const result = await paperApi.list({ limit: 200 })
    total.value = result.total
    papers.value = result.items.map((paper) => ({
      ...paper,
      id: paper.paper_id,
      topic: paper.keywords?.[0] || 'Unclassified',
      status: paper.data_status === 'complete' ? 'Complete' : 'Needs review'
    }))
  } catch (error) {
    loadError.value = `Live library unavailable: ${error.message}`
    usingFallback.value = true
    papers.value = libraryPapers
    total.value = libraryPapers.length
  }
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

    <div class="library-toolbar">
      <label class="local-search">
        <Search :size="18" />
        <input v-model="query" placeholder="Search by title, author, keyword..." />
      </label>
      <button class="outline-btn">Filters <ChevronDown :size="15" /></button>
      <button class="outline-btn">CVPR · 2025</button>
      <router-link class="dark-btn add-paper" to="/import"><Plus :size="16" /> Add paper</router-link>
    </div>

    <p v-if="loadError" class="load-note">{{ loadError }} Displaying reference data.</p>

    <section class="card library-card">
      <header class="library-card-header">
        <div><h2>All papers</h2><p>{{ total.toLocaleString() }} records<span v-if="usingFallback"> · reference preview</span></p></div>
        <div class="status-legend">
          <span class="status-pill complete">Complete</span>
          <span class="status-pill review">Needs review</span>
          <span class="status-pill duplicate">Duplicate</span>
        </div>
      </header>
      <div class="table-scroll">
        <table class="library-table">
          <thead><tr><th>ID</th><th>Paper title</th><th>Conference</th><th>Year</th><th>Topics</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="paper in filteredPapers" :key="paper.id" @click="$router.push(`/papers/${paper.id}`)">
              <td class="muted">{{ paper.id }}</td>
              <td class="title-cell">{{ paper.title }}</td>
              <td class="muted">{{ paper.conference }}</td>
              <td class="muted">{{ paper.year }}</td>
              <td><span class="topic-tag">{{ paper.topic }}</span></td>
              <td><span class="status-pill" :class="statusClass(paper.status)">{{ paper.status }}</span></td>
              <td><MoreHorizontal :size="18" class="muted" /></td>
            </tr>
            <tr v-if="!filteredPapers.length" class="empty-row"><td colspan="7">No stored papers match this view. Add a paper to begin.</td></tr>
          </tbody>
        </table>
      </div>
      <footer class="library-footer"><span>Showing {{ filteredPapers.length ? 1 : 0 }}–{{ filteredPapers.length }} of {{ total.toLocaleString() }} papers</span><div class="pagination"><button>‹</button><button class="current">1</button><button>›</button></div></footer>
    </section>
  </div>
</template>

<style scoped>
.page-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:5px; }
h1 { font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.library-toolbar { display:grid; grid-template-columns:minmax(300px,1fr) auto auto auto; align-items:center; gap:16px; margin-bottom:28px; }
.load-note { margin:-16px 0 16px; color:#bd8c0c; font-size:14px; }
.local-search { display:flex; align-items:center; gap:11px; min-height:52px; padding:0 18px; border:1px solid var(--border); border-radius:12px; color:var(--text-muted); }
.local-search input { min-width:0; flex:1; border:0; outline:0; font:inherit; color:var(--text-primary); background:transparent; font-size:17px; }
.local-search input::placeholder { color:var(--text-muted); }
.outline-btn, .dark-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:52px; padding:0 22px; border-radius:12px; font-size:16px; font-weight:600; }
.outline-btn { border:1px solid var(--border); background:#fff; color:var(--text-primary); box-shadow:var(--shadow-card); }
.outline-btn:hover { border-color:var(--accent); color:var(--accent); }
.dark-btn { border:0; background:var(--text-primary); color:#fff; }
.dark-btn:hover { background:var(--accent); }
.add-paper { min-width:170px; }
.library-card { display:flex; flex-direction:column; height:726px; overflow:hidden; padding:24px 24px 0; }
.library-card-header { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:14px; }
.library-card-header h2 { margin:0; font-family:var(--font-display); font-size:24px; }
.library-card-header p { margin:4px 0 0; color:var(--text-secondary); font-size:15px; }
.status-legend { display:flex; gap:18px; align-items:center; }
.status-pill { display:inline-flex; align-items:center; justify-content:center; padding:7px 15px; border-radius:999px; font-size:14px; font-weight:600; white-space:nowrap; }
.status-pill.complete { background:#e4f8f0; color:#2caa80; }
.status-pill.needs-review, .status-pill.review { background:#fff4d8; color:#bd8c0c; }
.status-pill.duplicate { background:#ffedf2; color:#ed7692; }
.table-scroll { flex:1; min-height:0; overflow-x:auto; }
.library-table { width:100%; min-width:1000px; border-collapse:collapse; }
.library-table th { padding:10px 0; text-align:left; color:var(--text-muted); font-size:14px; font-weight:500; border-bottom:1px solid var(--border); }
.library-table td { padding:20px 0; font-size:14px; border-bottom:1px solid #f0f1f6; }
.library-table tbody tr { cursor:pointer; transition:background .15s ease; }
.library-table tbody tr:hover { background:#fafbff; }
.library-table .empty-row { cursor:default; }
.library-table .empty-row td { padding:54px 16px; text-align:center; color:var(--text-secondary); }
.library-table th:not(:first-child), .library-table td:not(:first-child) { padding-left:18px; }
.title-cell { min-width:430px; color:var(--text-primary); font-weight:500; white-space:nowrap; }
.library-table th:first-child, .library-table td:first-child { width:72px; white-space:nowrap; }
.muted { color:var(--text-secondary); }
.topic-tag { display:inline-flex; padding:7px 15px; border-radius:999px; background:#efeaff; color:#9b7aff; white-space:nowrap; }
.library-footer { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:22px 0 26px; color:var(--text-secondary); font-size:16px; }
.pagination { display:flex; align-items:center; gap:12px; color:var(--text-primary); }
.pagination button { min-width:28px; height:28px; border-radius:7px; color:inherit; font-size:16px; }
.pagination button:hover, .pagination .current { background:var(--accent-soft); color:var(--accent); }
@media (max-width:900px) { .library-toolbar { grid-template-columns:1fr 1fr; } .add-paper { width:100%; } .status-legend { flex-wrap:wrap; justify-content:flex-end; } }
@media (max-width:640px) { .library-toolbar { grid-template-columns:1fr; } .library-card { padding:24px 20px 0; } .library-card-header, .library-footer { align-items:flex-start; flex-direction:column; } }
</style>
