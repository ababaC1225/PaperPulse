<script setup>
import { computed, ref } from 'vue'
import { Search } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import { hotTopics, recentPapers } from '@/data/mock'

const query = ref('')
const sortedTopics = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return hotTopics
    .filter((topic) => !needle || topic.name.toLowerCase().includes(needle))
    .slice(0, 8)
})
const maxPapers = Math.max(...hotTopics.map((topic) => topic.papers))
</script>

<template>
  <div class="hot-topics">
    <TopBar />

    <div class="page-head">
      <div>
        <h1>Hot Topics</h1>
        <p class="subtitle">Compare the research directions shaping computer vision.</p>
      </div>
    </div>

    <div class="topic-toolbar">
      <div class="toolbar-left">
        <span class="soft-pill violet">CVPR</span>
        <span class="soft-pill blue">2025</span>
        <span class="toolbar-note">Sort: Growth rate</span>
      </div>
      <div class="toolbar-right">
        <label class="topic-search"><Search :size="15" /><input v-model="query" placeholder="Search topics" /></label>
        <button class="dark-btn export-btn">Export report</button>
      </div>
    </div>

    <div class="hot-grid">
      <section class="card ranking-card">
        <header>
          <h2>Top 10 research directions</h2>
          <p>Ranked by normalized growth</p>
        </header>
        <div class="rank-list">
          <div v-for="(topic, index) in sortedTopics" :key="topic.rank" class="rank-row">
            <span class="rank-circle" :style="{ color: topic.color, borderColor: topic.color }">{{ index + 1 }}</span>
            <span class="rank-name">{{ topic.name }}</span>
            <span class="rank-bar"><i :style="{ width: `${(topic.papers / maxPapers) * 100}%`, background: topic.color }"></i></span>
            <span class="rank-papers">{{ topic.papers }}</span>
            <span class="rank-trend">+{{ topic.trend }}%</span>
          </div>
        </div>
      </section>

      <aside class="card topic-detail">
        <h2>Diffusion Models</h2>
        <span class="soft-pill violet selected-pill">Selected</span>
        <div class="detail-count">842 papers</div>
        <div class="detail-delta">+42% vs 2024</div>
        <p class="detail-copy">Diffusion-based methods remain the fastest-growing topic in the selected CVPR 2025 collection.</p>
        <h3>Trend over time</h3>
        <svg class="mini-step" viewBox="0 0 430 115" role="img" aria-label="Diffusion Models trend over time">
          <line x1="12" y1="88" x2="418" y2="88" />
          <path d="M18 74 H70 V58 H132 V38 H192 V59 H254 V28 H316 V52 H378 V26 H410" />
          <circle cx="18" cy="74" r="4" /><circle cx="132" cy="38" r="4" /><circle cx="254" cy="28" r="4" /><circle cx="378" cy="26" r="4" />
          <text x="14" y="108">2021</text><text x="194" y="108">2023</text><text x="392" y="108">2025</text>
        </svg>
      </aside>
    </div>

    <section class="card related-card">
      <h2>Related papers</h2>
      <div class="related-header"><span>Paper title</span><span>Authors</span><span>Date</span></div>
      <div v-for="paper in recentPapers.slice(0, 2)" :key="paper.title" class="related-row">
        <span>{{ paper.title }}</span><span>{{ paper.authors }}</span><span>{{ paper.date }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page-head { margin-bottom: 9px; }
h1 { font-size: 32px; font-weight: 800; }
.subtitle { margin: 4px 0 0; color: var(--text-secondary); font-size: 16px; }
.topic-toolbar { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:29px; }
.toolbar-left, .toolbar-right { display:flex; align-items:center; gap:14px; }
.toolbar-note { color:var(--text-secondary); font-size:15px; margin-left:6px; }
.soft-pill { display:inline-flex; align-items:center; padding:5px 16px; border-radius:999px; font-size:15px; font-weight:600; white-space:nowrap; }
.soft-pill.violet { background:#efebff; color:#9b7aff; }
.soft-pill.blue { background:#e9f2ff; color:#5d94e8; }
.topic-search { display:flex; align-items:center; gap:9px; width:240px; height:46px; padding:0 16px; border:1px solid var(--border); border-radius:12px; color:var(--text-muted); }
.topic-search input { min-width:0; width:100%; border:0; outline:0; color:var(--text-primary); font:inherit; font-size:15px; }
.topic-search input::placeholder { color:var(--text-muted); }
.dark-btn { display:inline-flex; align-items:center; justify-content:center; min-height:46px; padding:0 24px; border-radius:12px; background:var(--text-primary); color:#fff; font-size:15px; font-weight:700; }
.dark-btn:hover { background:var(--accent); }
.hot-grid { display:grid; grid-template-columns:minmax(0,1.12fr) minmax(0,1fr); gap:24px; }
.ranking-card, .topic-detail { min-height:520px; padding:26px 24px 24px; }
.ranking-card h2, .topic-detail h2 { margin:0; font-family:var(--font-display); font-size:24px; font-weight:800; }
.ranking-card header p { margin:4px 0 8px; color:var(--text-secondary); font-size:15px; }
.rank-list { display:grid; gap:0; }
.rank-row { display:grid; grid-template-columns:34px minmax(160px,1fr) minmax(130px,1fr) 46px 48px; align-items:center; gap:12px; min-height:47px; }
.rank-circle { display:inline-flex; align-items:center; justify-content:center; width:25px; height:25px; border:1.5px solid; border-radius:50%; font-size:14px; }
.rank-name { font-size:16px; white-space:nowrap; }
.rank-bar { height:8px; border-radius:999px; background:#f3f4f8; overflow:hidden; }
.rank-bar i { display:block; height:100%; border-radius:inherit; opacity:.85; }
.rank-papers, .rank-trend { font-size:15px; text-align:right; }
.rank-trend { color:var(--green); }
.topic-detail { padding-right:34px; }
.selected-pill { margin-top:0; }
.detail-count { margin-top:23px; font-family:var(--font-display); font-size:32px; font-weight:800; line-height:1.1; }
.detail-delta { color:var(--green); font-size:17px; }
.detail-copy { max-width:410px; margin:18px 0 24px; color:var(--text-secondary); font-size:16px; line-height:1.55; }
.topic-detail h3 { margin:0 0 12px; font-size:16px; }
.mini-step { display:block; width:100%; height:auto; margin-top:8px; overflow:visible; }
.mini-step line { stroke:#e8eaf1; stroke-width:1; }
.mini-step path { fill:none; stroke:#9b7aff; stroke-width:2; }
.mini-step circle { fill:#9b7aff; }
.mini-step text { fill:#a0a2b8; font-size:12px; }
.related-card { margin-top:24px; padding:26px 24px 16px; }
.related-card h2 { margin:0 0 10px; font-family:var(--font-display); font-size:24px; }
.related-header, .related-row { display:grid; grid-template-columns:1.7fr .7fr .4fr; gap:20px; align-items:center; }
.related-header { padding-bottom:8px; border-bottom:1px solid var(--border); color:var(--text-muted); font-size:14px; }
.related-row { padding-top:8px; color:var(--text-primary); font-size:15px; }
.related-row span:nth-child(2), .related-row span:nth-child(3) { color:var(--text-secondary); }
@media (max-width:1000px) { .topic-toolbar { align-items:flex-start; flex-direction:column; } .hot-grid { grid-template-columns:1fr; } }
@media (max-width:640px) { .toolbar-right { width:100%; } .topic-search { flex:1; } .rank-row { grid-template-columns:30px minmax(120px,1fr) 80px 40px 44px; gap:8px; } .ranking-card, .topic-detail { padding:24px 20px; } }
</style>
