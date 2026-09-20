<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ArrowUpRight, ArrowRight } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import { libraryPapers } from '@/data/mock'
import { paperApi } from '@/services/paperApi'

const route = useRoute()
const paper = ref(null)
const loadError = ref('')
const fallbackPaper = computed(() => libraryPapers.find((item) => item.id === route.params.id) || libraryPapers[0])
const shownPaper = computed(() => paper.value || fallbackPaper.value)
const keywords = computed(() => paper.value?.keywords || [shownPaper.value.topic, 'Multimodal Learning', 'Computer Vision'].filter(Boolean))
const authors = computed(() => paper.value?.authors?.length ? paper.value.authors.join(', ') : 'Authors unavailable')
const updated = computed(() => {
  if (!paper.value?.updated_at) return 'reference preview'
  return `updated ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(paper.value.updated_at))}`
})

watch(() => route.params.id, async (paperId) => {
  loadError.value = ''
  paper.value = null
  try { paper.value = await paperApi.get(paperId) }
  catch (error) { loadError.value = error.message }
}, { immediate: true })
</script>

<template>
  <div class="screen-page detail-page">
    <TopBar />
    <div class="page-head detail-head">
      <div><h1>Paper Detail</h1><p class="subtitle">Review the source, context, and next reading paths.</p></div>
    </div>
    <div class="detail-actions">
      <router-link class="back-link" to="/papers"><ArrowLeft :size="16" /> Back to Paper Library</router-link>
      <a v-if="paper?.original_url" class="dark-btn" :href="paper.original_url" target="_blank" rel="noreferrer">Open original paper <ArrowUpRight :size="16" /></a>
      <button v-else class="dark-btn" disabled>Original unavailable <ArrowUpRight :size="16" /></button>
    </div>

    <div class="detail-layout">
      <article class="card paper-detail-card">
        <div class="detail-tags"><span class="soft-pill violet">{{ shownPaper.conference }} {{ shownPaper.year }}</span><span class="soft-pill neutral">{{ shownPaper.paper_id || shownPaper.id }}</span></div>
        <h2>{{ shownPaper.title }}</h2>
        <p class="paper-meta">{{ authors }} · {{ updated }}</p>
        <p v-if="loadError" class="load-note">{{ loadError }} Showing reference preview.</p>
        <hr />
        <h3>Abstract</h3>
        <p class="abstract">{{ paper?.abstract || 'Abstract not available. This paper is excluded from analyses that require abstract text.' }}</p>
        <h3>Keywords</h3>
        <div v-if="keywords.length" class="keyword-row"><span v-for="(keyword, index) in keywords" :key="keyword" class="soft-pill" :class="['violet', 'green', 'blue'][index % 3]">{{ keyword }}</span></div>
        <p v-else class="abstract">Keywords not available.</p>
        <div class="source-block"><p class="eyebrow">Data source</p><p>{{ paper?.source_name?.toUpperCase() || 'Reference data' }} · {{ paper?.doi ? `DOI ${paper.doi}` : 'DOI unavailable' }}</p><span>{{ paper?.data_status ? `Status: ${paper.data_status.replace('_', ' ')}` : 'Not stored' }}</span></div>
      </article>

      <aside class="context-card">
        <h2>Explore context</h2>
        <p class="eyebrow">Hot topic</p><strong>Vision-Language Models</strong>
        <span class="rank-pill">#3 in 2025</span>
        <hr />
        <h3>Related keywords</h3>
        <div class="keyword-stack"><span>Diffusion Models</span><span>3D Vision</span></div>
        <h3>Same topic</h3>
        <ul><li>4D Gaussian Splatting...</li><li>Towards Generalist Video...</li><li>Segment Anything in 3D</li></ul>
        <router-link class="light-btn" to="/keyword-map">Open Keyword Map <ArrowRight :size="16" /></router-link>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:10px; }
h1 { font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.dark-btn, .light-btn { display:inline-flex; align-items:center; justify-content:center; gap:9px; border-radius:12px; min-height:44px; padding:0 22px; font-size:15px; font-weight:700; }
.dark-btn { background:var(--text-primary); color:#fff; }
.dark-btn:hover { background:var(--accent); }
.dark-btn:disabled { cursor:not-allowed; opacity:.55; }
.detail-actions { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:31px; }
.back-link { display:inline-flex; align-items:center; gap:7px; color:var(--text-secondary); font-size:16px; }
.back-link:hover { color:var(--accent); }
.detail-layout { display:grid; grid-template-columns:minmax(0, 2.2fr) minmax(300px, 1fr); gap:24px; height:726px; }
.paper-detail-card { height:726px; overflow:hidden; padding:28px 24px 40px; }
.detail-tags { display:flex; gap:12px; margin-bottom:22px; }
.soft-pill { display:inline-flex; align-items:center; padding:5px 14px; border-radius:999px; font-size:14px; font-weight:600; }
.soft-pill.violet { background:#efebff; color:#9b7aff; }
.soft-pill.green { background:#e3f8ef; color:#2ca87e; }
.soft-pill.blue { background:#e9f2ff; color:#5d94e8; }
.soft-pill.neutral { background:#f5f6fa; color:var(--text-secondary); }
.paper-detail-card h2 { max-width:620px; margin:0; font-family:var(--font-display); font-size:30px; line-height:1.18; }
.paper-meta { margin:12px 0 28px; color:var(--text-secondary); font-size:16px; }
.load-note { margin:-16px 0 22px; color:#bd8c0c; font-size:14px; }
.paper-detail-card hr { border:0; border-top:1px solid var(--border); margin:0 0 28px; }
.paper-detail-card h3 { margin:0 0 14px; font-size:18px; }
.abstract { max-width:600px; margin:0 0 30px; color:var(--text-secondary); font-size:16px; line-height:1.65; }
.keyword-row { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:58px; }
.source-block .eyebrow { margin:0 0 8px; color:var(--text-secondary); font-size:14px; }
.source-block p { margin:0 0 22px; font-size:15px; }
.source-block span { color:#a0a2b8; font-size:15px; }
.context-card { height:726px; overflow:hidden; padding:28px 24px; border-radius:16px; background:#e8faf2; }
.context-card h2 { margin:0 0 20px; font-family:var(--font-display); font-size:24px; }
.eyebrow { margin:0 0 10px; color:var(--text-secondary); font-size:14px; }
.context-card strong { display:block; font-size:18px; }
.rank-pill { display:inline-flex; margin-top:12px; padding:8px 14px; border-radius:999px; background:#fff; color:#9b7aff; font-size:14px; }
.context-card hr { border:0; border-top:1px solid #ccefe0; margin:18px 0 24px; }
.context-card h3 { margin:0 0 14px; font-size:16px; }
.keyword-stack { display:flex; flex-direction:column; align-items:flex-start; gap:10px; margin-bottom:30px; }
.keyword-stack span { padding:8px 14px; border-radius:999px; background:#fff; color:#9b7aff; font-size:14px; }
.context-card ul { display:grid; gap:14px; margin:0 0 68px; padding:0; list-style:none; font-size:15px; }
.light-btn { width:100%; border:1px solid var(--border); background:#fff; color:var(--text-primary); }
.light-btn:hover { color:var(--accent); border-color:var(--accent); }
@media (max-width:1000px) { .detail-layout { grid-template-columns:1fr; } .context-card { min-height:0; } }
</style>
