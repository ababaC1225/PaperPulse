<script setup>
import { ref } from 'vue'
import { Play, RotateCcw, ArrowRight } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import TrendStepChart from '@/components/TrendStepChart.vue'

const playing = ref(false)
const replay = () => { playing.value = !playing.value }
</script>

<template>
  <div class="screen-page trend-page">
    <TopBar />
    <div class="page-head">
      <div>
        <h1>Trend Analysis</h1>
        <p class="subtitle">Compare topic momentum across years and conferences.</p>
      </div>
    </div>

    <div class="trend-toolbar">
      <div class="conference-row">
        <span class="toolbar-note">2021–2025</span>
        <span class="soft-pill violet">CVPR</span>
        <span class="soft-pill blue">ICCV</span>
        <span class="soft-pill green">ECCV</span>
      </div>
      <div class="trend-actions">
        <button class="outline-btn">Paper count</button>
        <button class="outline-btn" @click="playing = !playing"><Play :size="15" /> {{ playing ? 'Pause' : 'Play' }}</button>
        <button class="dark-btn" @click="replay"><RotateCcw :size="15" /> Replay</button>
      </div>
    </div>

    <div class="trend-layout">
      <section class="card trend-card">
        <h2>Topic heat over time</h2>
        <p class="card-subtitle">Normalized share of papers</p>
        <div class="legend-row">
          <span class="soft-pill violet">Diffusion Models</span>
          <span class="soft-pill green">3D Vision</span>
          <span class="soft-pill blue">V-L Models</span>
          <span class="soft-pill pink">Segmentation</span>
        </div>
        <TrendStepChart />
      </section>

      <aside class="insight-card">
        <h2>Insight</h2>
        <p class="insight-copy">Diffusion has <strong>accelerated fastest</strong> across all three conferences since 2022.</p>
        <hr />
        <p class="eyebrow">Peak year</p>
        <div class="insight-stat">2025</div>
        <div class="detail-delta">+42% normalized growth</div>
        <p class="eyebrow methodology-label">Methodology</p>
        <p class="method-copy">Values are normalized by papers per conference/year.</p>
        <button class="light-btn">View data notes <ArrowRight :size="16" /></button>
      </aside>
    </div>

    <section class="card data-source-card">
      <div><p class="eyebrow">Data source</p><strong>CVF Open Access · DBLP · Updated 2 hours ago</strong></div>
      <p>Heat is a directional signal, not a measure of paper quality or causality.</p>
    </section>
  </div>
</template>

<style scoped>
.page-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:18px; }
h1 { font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.trend-toolbar { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:20px; }
.conference-row, .trend-actions, .legend-row { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.toolbar-note { color:var(--text-secondary); font-size:15px; margin-right:20px; }
.soft-pill { display:inline-flex; align-items:center; padding:8px 16px; border-radius:999px; font-size:15px; font-weight:600; white-space:nowrap; }
.soft-pill.violet { background:#efebff; color:#9b7aff; }
.soft-pill.blue { background:#e9f2ff; color:#5d94e8; }
.soft-pill.green { background:#e3f8ef; color:#2ca87e; }
.soft-pill.pink { background:#ffedf2; color:#ef7893; }
.outline-btn, .light-btn { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-height:44px; padding:0 18px; border:1px solid var(--border); border-radius:12px; background:#fff; color:var(--text-secondary); font-size:15px; font-weight:600; box-shadow:var(--shadow-card); }
.outline-btn:hover, .light-btn:hover { border-color:var(--accent); color:var(--accent); }
.dark-btn { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-height:44px; padding:0 22px; border-radius:12px; background:var(--text-primary); color:#fff; font-size:15px; font-weight:700; }
.dark-btn:hover { background:var(--accent); }
.trend-layout { display:grid; grid-template-columns:minmax(0, 2.9fr) minmax(280px, 1fr); gap:24px; height:598px; }
.trend-card { height:598px; min-height:0; overflow:hidden; padding:28px 24px 22px; }
.trend-card h2 { margin:0; font-family:var(--font-display); font-size:24px; font-weight:800; }
.card-subtitle { margin:5px 0 22px; color:var(--text-secondary); font-size:15px; }
.legend-row { margin-bottom:16px; }
.insight-card { height:598px; overflow:hidden; padding:28px 24px; border-radius:16px; background:#e8faf2; }
.insight-card h2 { margin:0 0 32px; font-family:var(--font-display); font-size:22px; }
.insight-copy { margin:0; font-size:20px; line-height:1.45; }
.insight-card hr { margin:22px 0; border:0; border-top:1px solid #ccefe0; }
.eyebrow { margin:0 0 8px; color:var(--text-secondary); font-size:14px; }
.insight-stat { font-family:var(--font-display); font-size:30px; font-weight:800; }
.detail-delta { color:var(--green); font-size:16px; }
.methodology-label { margin-top:58px; }
.method-copy { max-width:250px; margin:0 0 24px; color:var(--text-secondary); font-size:14px; line-height:1.5; }
.light-btn { width:100%; color:var(--text-primary); }
.data-source-card { display:flex; justify-content:space-between; align-items:center; gap:24px; margin-top:28px; padding:22px 24px; color:var(--text-secondary); font-size:14px; }
.data-source-card .eyebrow { margin-bottom:8px; }
.data-source-card strong { color:var(--text-primary); font-size:15px; font-weight:500; }
.data-source-card > p { margin:0; }
@media (max-width: 1100px) { .trend-layout { grid-template-columns:1fr; } .trend-toolbar { align-items:flex-start; flex-direction:column; } }
@media (max-width: 640px) { .trend-card { padding:24px 20px; } .data-source-card { align-items:flex-start; flex-direction:column; } }
</style>
