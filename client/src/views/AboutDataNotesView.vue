<template>
  <div class="screen-page about-page">
    <TopBar />
    <div class="page-head"><div><h1>About &amp; Data Notes</h1><p class="subtitle">Understand where the data comes from and how to read the analysis.</p></div></div>
    <div class="about-layout">
      <section class="card about-card">
        <h2>About PaperPulse</h2>
        <p class="lead">A research hotspot exploration workbench for computer vision.</p>
        <hr />
        <h3>Data sources</h3>
        <div class="source-pills"><span>CVF Open Access</span><span>DBLP</span><span>Public conference pages</span></div>
        <h3>Coverage</h3>
        <p>CVPR · ICCV · ECCV<br /><span>2021–2025 collections</span></p>
        <h3>Method notes</h3>
        <p class="method-notes">Heat = normalized paper share and growth signal.<br />Keyword links = co-occurrence in the same paper.<br />These signals do not represent paper quality or causality.</p>
        <button class="dark-btn">Read methodology <ArrowRight :size="16" /></button>
      </section>
      <aside class="about-aside">
        <p class="eyebrow">Latest sync</p><div class="sync-stat">2 hours ago</div><strong>Up to date</strong><hr />
        <h3>Version</h3><p>v1.0 · Research edition</p>
        <h3>Limitations</h3><p>Missing abstracts are marked explicitly.<br />Results should be reviewed against original papers.</p>
        <h3>Feedback</h3><button class="light-btn">Send feedback <ArrowRight :size="16" /></button>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ArrowRight } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
</script>

<style scoped>
.page-head { margin-bottom:47px; }
h1 { margin:0; font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.about-layout { display:grid; grid-template-columns:minmax(0,1.9fr) minmax(300px,1fr); gap:28px; }
.about-card { height:640px; min-height:0; padding:28px 24px; }
.about-card h2 { margin:0 0 10px; font-family:var(--font-display); font-size:24px; }
.lead { margin:0; color:var(--text-secondary); font-size:16px; }
.about-card hr, .about-aside hr { border:0; border-top:1px solid var(--border); margin:26px 0 34px; }
.about-card h3 { margin:0 0 14px; font-size:18px; }
.source-pills { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:38px; }
.source-pills span { padding:7px 15px; border-radius:999px; background:#efebff; color:#9b7aff; font-size:14px; }
.source-pills span:nth-child(2) { background:#e9f2ff; color:#5d94e8; }
.source-pills span:nth-child(3) { background:#e3f8ef; color:#2ca87e; }
.about-card h3:not(:first-of-type) { margin-top:34px; }
.about-card p { margin:0; font-size:16px; line-height:1.65; }
.about-card p span { color:var(--text-secondary); }
.method-notes { color:var(--text-secondary); }
.dark-btn, .light-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 20px; border-radius:12px; font-size:15px; font-weight:700; }
.dark-btn { margin-top:36px; background:var(--text-primary); color:#fff; }
.dark-btn:hover { background:var(--accent); }
.about-aside { padding:28px 26px; border-radius:16px; background:#e8faf2; }
.eyebrow { margin:0 0 12px; color:var(--text-secondary); font-size:14px; }
.sync-stat { font-family:var(--font-display); font-size:30px; font-weight:800; }
.about-aside > strong { color:#2caa80; font-size:16px; }
.about-aside hr { border-color:#ccefe0; margin:26px 0 34px; }
.about-aside h3 { margin:0 0 12px; font-size:18px; }
.about-aside p { margin:0 0 34px; color:var(--text-secondary); font-size:15px; line-height:1.5; }
.about-aside .light-btn { width:100%; border:1px solid var(--border); background:#fff; color:var(--text-primary); }
@media (max-width:1000px) { .about-layout { grid-template-columns:1fr; } .about-card { min-height:0; } }
@media (max-width:640px) { .about-card, .about-aside { padding:28px 22px; } }
</style>
