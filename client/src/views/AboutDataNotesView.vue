<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRight, RefreshCw } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import { paperApi } from '@/services/paperApi'

const overview = ref(null)
const facets = ref({ conferences: [], years: [] })
const eligiblePaperCount = ref(null)
const loading = ref(true)
const loadError = ref('')
const methodologyOpen = ref(false)
const methodologySection = ref(null)
let requestSequence = 0

const totalPapers = computed(() => overview.value?.papers?.value ?? null)
const conferences = computed(() => facets.value.conferences || [])
const years = computed(() => (facets.value.years || []).filter(Number.isFinite))
const conferenceCoverage = computed(() => {
  if (conferences.value.length) return conferences.value.join(' · ')
  return totalPapers.value === 0 ? 'No conferences represented yet' : 'Not available'
})
const yearCoverage = computed(() => {
  if (!years.value.length) return totalPapers.value === 0 ? 'No publication years represented yet' : 'Not available'
  const minimum = Math.min(...years.value)
  const maximum = Math.max(...years.value)
  return minimum === maximum ? String(minimum) : `${minimum}–${maximum}`
})
const emptyDatabase = computed(() => totalPapers.value === 0)

function displayCount(value) {
  return Number.isFinite(value) ? value.toLocaleString() : 'Not available'
}

function formatTimestamp(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Not available'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(timestamp)
}

async function loadDatasetNotes() {
  const requestId = ++requestSequence
  loading.value = true
  loadError.value = ''
  try {
    const [stats, paperFacets, topics] = await Promise.all([
      paperApi.overviewStats(),
      paperApi.facets(),
      paperApi.hotTopics({ sort: 'count', limit: 1 })
    ])
    if (requestId !== requestSequence) return
    overview.value = stats
    facets.value = paperFacets
    eligiblePaperCount.value = Number.isFinite(topics?.methodology?.eligible_paper_total)
      ? topics.methodology.eligible_paper_total
      : null
  } catch (error) {
    if (requestId !== requestSequence) return
    loadError.value = `Unable to load live dataset notes: ${error.message}`
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

async function toggleMethodology() {
  methodologyOpen.value = !methodologyOpen.value
  if (!methodologyOpen.value) return
  await nextTick()
  methodologySection.value?.focus({ preventScroll: true })
  methodologySection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(loadDatasetNotes)
onBeforeUnmount(() => { requestSequence += 1 })
</script>

<template>
  <div class="screen-page about-page">
    <TopBar />
    <div class="page-head"><div><h1>About &amp; Data Notes</h1><p class="subtitle">Understand where the data comes from and how to read the analysis.</p></div></div>

    <section v-if="loading" class="card live-state" aria-live="polite" aria-busy="true">
      <RefreshCw :size="20" />
      <div><strong>Loading live dataset notes</strong><span>Reading the current PaperPulse database.</span></div>
    </section>

    <section v-else-if="loadError" class="card live-state error" role="alert">
      <div><strong>Dataset notes are unavailable</strong><span>{{ loadError }}</span></div>
      <button class="light-btn" type="button" @click="loadDatasetNotes"><RefreshCw :size="16" /> Retry</button>
    </section>

    <template v-else>
      <p v-if="emptyDatabase" class="empty-note">No papers are stored yet. Coverage and update information will appear after papers are imported.</p>

      <div class="about-layout">
        <section class="card about-card">
          <h2>About PaperPulse</h2>
          <p class="lead">A research hotspot exploration workbench for computer vision.</p>
          <hr />
          <h3>Data sources</h3>
          <div class="source-pills"><span>CVF Open Access</span><span>DBLP</span><span>Public conference pages</span></div>

          <h3>Live dataset coverage</h3>
          <p class="coverage-copy"><strong>{{ conferenceCoverage }}</strong><span>{{ yearCoverage }}</span></p>
          <div class="dataset-stats">
            <div><span>Stored papers</span><strong>{{ displayCount(totalPapers) }}</strong></div>
            <div><span>Analysis eligible</span><strong>{{ displayCount(eligiblePaperCount) }}</strong></div>
          </div>

          <h3>Method notes</h3>
          <p class="method-notes">Heat = normalized paper share and growth signal.<br />Keyword links = co-occurrence in the same paper.<br />These signals do not represent paper quality or causality.</p>
          <button class="dark-btn" type="button" aria-controls="methodology-details" :aria-expanded="methodologyOpen" @click="toggleMethodology">
            {{ methodologyOpen ? 'Hide methodology' : 'Read methodology' }} <ArrowRight :size="16" :class="{ rotated: methodologyOpen }" />
          </button>
        </section>

        <aside class="about-aside">
          <p class="eyebrow">Latest stored update</p>
          <div class="sync-stat">{{ formatTimestamp(overview?.last_sync?.value) }}</div>
          <span class="sync-caption">Latest retrieval or record update reported by the database</span>
          <hr />
          <h3>Version</h3><p>v1.0 · Research edition</p>
          <h3>Limitations</h3><p>Missing abstracts are marked explicitly.<br />Results should be reviewed against original papers.<br />Coverage reflects stored records, not complete conference proceedings.</p>
        </aside>
      </div>

      <section v-if="methodologyOpen" id="methodology-details" ref="methodologySection" class="card methodology-details" tabindex="-1" aria-labelledby="methodology-heading">
        <p class="eyebrow">How the analysis works</p>
        <h2 id="methodology-heading">Methodology and interpretation</h2>
        <div class="method-grid">
          <article><h3>Eligibility</h3><p>Analysis uses stored papers with a usable abstract and at least one normalized keyword. Failed retrievals and missing required analysis fields are excluded.</p></article>
          <article><h3>Topics and trends</h3><p>A topic counts distinct eligible papers containing its exact normalized keyword. Share divides that count by eligible papers in the same conference and year.</p></article>
          <article><h3>Keyword network</h3><p>Links count co-occurrence inside the same eligible paper. A link indicates shared usage, not semantic equivalence, quality, or causality.</p></article>
          <article><h3>Coverage limits</h3><p>All totals describe the current local database. Missing conference-years remain unavailable rather than being treated as observed zero values.</p></article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page-head { margin-bottom:32px; }
h1 { margin:0; font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.about-layout { display:grid; grid-template-columns:minmax(0,1.9fr) minmax(300px,1fr); gap:28px; align-items:start; }
.about-card { min-height:0; padding:28px 24px 34px; }
.about-card h2, .methodology-details h2 { margin:0 0 10px; font-family:var(--font-display); font-size:24px; }
.lead { margin:0; color:var(--text-secondary); font-size:16px; }
.about-card hr, .about-aside hr { border:0; border-top:1px solid var(--border); margin:26px 0 30px; }
.about-card h3 { margin:0 0 14px; font-size:18px; }
.source-pills { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:34px; }
.source-pills span { padding:7px 15px; border-radius:999px; background:#efebff; color:#8064df; font-size:14px; }
.source-pills span:nth-child(2) { background:#e9f2ff; color:#4f7fca; }
.source-pills span:nth-child(3) { background:#e3f8ef; color:#238b69; }
.about-card h3:not(:first-of-type) { margin-top:32px; }
.about-card p { margin:0; font-size:16px; line-height:1.65; }
.coverage-copy { display:grid; gap:2px; }
.coverage-copy strong { color:var(--text-primary); }
.coverage-copy span, .method-notes { color:var(--text-secondary); }
.dataset-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:18px; }
.dataset-stats div { padding:15px 16px; border:1px solid var(--border); border-radius:12px; background:#fbfbfe; }
.dataset-stats span, .dataset-stats strong { display:block; }
.dataset-stats span { margin-bottom:5px; color:var(--text-muted); font-size:12px; font-weight:700; }
.dataset-stats strong { font-family:var(--font-display); font-size:23px; font-variant-numeric:tabular-nums; }
.dark-btn, .light-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 20px; border-radius:12px; font-size:15px; font-weight:700; }
.dark-btn { margin-top:30px; background:var(--text-primary); color:#fff; }
.dark-btn:hover { background:var(--accent); }
.dark-btn svg { transition:transform .2s ease; }
.dark-btn svg.rotated { transform:rotate(90deg); }
.about-aside { padding:28px 26px 34px; border-radius:16px; background:#e8faf2; }
.eyebrow { margin:0 0 12px; color:var(--text-secondary); font-size:13px; font-weight:700; letter-spacing:.03em; }
.sync-stat { font-family:var(--font-display); font-size:25px; font-weight:800; line-height:1.25; font-variant-numeric:tabular-nums; }
.sync-caption { display:block; margin-top:8px; color:#238b69; font-size:13px; line-height:1.45; }
.about-aside hr { border-color:#ccefe0; margin:26px 0 30px; }
.about-aside h3 { margin:0 0 10px; font-size:18px; }
.about-aside p { margin:0 0 30px; color:var(--text-secondary); font-size:15px; line-height:1.55; }
.live-state { display:flex; min-height:220px; align-items:center; justify-content:center; gap:14px; padding:32px; color:var(--accent); }
.live-state > svg { animation:spin .9s linear infinite; }
.live-state > div { display:grid; gap:4px; }
.live-state strong { color:var(--text-primary); font-size:17px; }
.live-state span { color:var(--text-secondary); font-size:14px; }
.live-state.error { justify-content:space-between; color:#a83d57; }
.light-btn { border:1px solid var(--border); color:var(--text-primary); background:#fff; }
.light-btn:hover { border-color:var(--accent); color:var(--accent); }
.empty-note { margin:0 0 18px; padding:12px 15px; border-radius:10px; color:#75622f; background:#fff8df; font-size:14px; }
.methodology-details { margin-top:24px; padding:26px; scroll-margin-top:24px; outline:none; }
.methodology-details:focus-visible { box-shadow:0 0 0 3px rgba(108,92,231,.16), var(--shadow-card); }
.method-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-top:20px; }
.method-grid article { padding:17px 18px; border-radius:12px; background:var(--bg-soft); }
.method-grid h3 { margin:0 0 7px; font-size:16px; }
.method-grid p { margin:0; color:var(--text-secondary); font-size:14px; line-height:1.6; }
@keyframes spin { to { transform:rotate(360deg); } }
@media (max-width:1000px) { .about-layout { grid-template-columns:1fr; } }
@media (max-width:640px) { .about-card, .about-aside, .methodology-details { padding:24px 20px; } .dataset-stats, .method-grid { grid-template-columns:1fr; } .live-state, .live-state.error { align-items:flex-start; flex-direction:column; } }
</style>
