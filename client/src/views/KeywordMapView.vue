<script setup>
import { ref } from 'vue'
import { Minus, Plus, RotateCcw, ArrowRight } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import NetworkGraph from '@/components/NetworkGraph.vue'

const zoom = ref(1)

function changeZoom(delta) {
  zoom.value = Math.min(1.3, Math.max(0.75, Number((zoom.value + delta).toFixed(2))))
}
</script>

<template>
  <div class="screen-page keyword-map-page">
    <TopBar />

    <div class="page-head">
      <div>
        <h1>Keyword Map</h1>
        <p class="subtitle">Explore how research topics connect across the paper collection.</p>
      </div>
    </div>

    <div class="map-toolbar">
      <div class="toolbar-left">
        <span class="soft-pill violet">CVPR</span>
        <span class="soft-pill blue">2025</span>
        <span class="toolbar-note">20 nodes</span>
      </div>
      <div class="zoom-controls">
        <button class="icon-control" title="Zoom out" @click="changeZoom(-0.1)"><Minus :size="18" /></button>
        <button class="icon-control" title="Zoom in" @click="changeZoom(0.1)"><Plus :size="18" /></button>
        <button class="reset-control" @click="zoom = 1"><RotateCcw :size="15" /> Reset</button>
      </div>
    </div>

    <div class="map-layout">
      <section class="card network-panel">
        <div class="panel-heading">
          <div>
            <h2>Research keyword network</h2>
            <p>Node size = topic heat · Edge width = co-occurrence</p>
          </div>
        </div>
        <div class="network-stage" :style="{ transform: `scale(${zoom})` }">
          <NetworkGraph />
        </div>
        <p class="panel-footnote">Association is based on co-occurrence, not causality.</p>
      </section>

      <aside class="card detail-panel">
        <p class="eyebrow">Selected keyword</p>
        <h2>Diffusion Models</h2>
        <span class="soft-pill violet">Hot topic</span>
        <div class="detail-stat">842 papers</div>
        <div class="detail-delta">+42% vs 2024</div>
        <hr />
        <h3>Related keywords</h3>
        <div class="pill-stack">
          <span class="soft-pill blue">Vision-Language</span>
          <span class="soft-pill green">Generative Models</span>
          <span class="soft-pill violet">3D Vision</span>
        </div>
        <h3>Related papers</h3>
        <ul class="related-list">
          <li>Scalable Vision-Language Models...</li>
          <li>4D Gaussian Splatting...</li>
          <li>DriveWorld: World Model...</li>
        </ul>
        <router-link class="dark-btn full-btn" to="/papers">Open paper list <ArrowRight :size="16" /></router-link>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

h1 { font-size: 32px; font-weight: 800; }
.subtitle { margin: 4px 0 0; color: var(--text-secondary); font-size: 16px; }

.map-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
}

.toolbar-left, .zoom-controls { display: flex; align-items: center; gap: 14px; }
.toolbar-note { color: var(--text-secondary); font-size: 15px; }
.soft-pill { display: inline-flex; align-items: center; padding: 5px 16px; border-radius: 999px; font-size: 15px; font-weight: 600; white-space: nowrap; }
.soft-pill.violet { background: #efebff; color: #9b7aff; }
.soft-pill.blue { background: #e9f2ff; color: #5d94e8; }
.soft-pill.green { background: #e3f8ef; color: #2ca87e; }

.icon-control, .reset-control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  color: var(--text-secondary);
  box-shadow: var(--shadow-card);
  transition: border-color .15s ease, color .15s ease;
}
.icon-control { width: 46px; }
.reset-control { padding: 0 18px; font-size: 15px; }
.icon-control:hover, .reset-control:hover { border-color: var(--accent); color: var(--accent); }

.map-layout { display: grid; grid-template-columns: minmax(0, 1fr) 308px; gap: 24px; height: 726px; }
.network-panel { position: relative; height: 726px; min-height: 0; padding: 24px 24px 18px; overflow: hidden; }
.panel-heading h2, .detail-panel h2 { margin: 0; font-family: var(--font-display); font-size: 24px; font-weight: 800; }
.panel-heading p { margin: 5px 0 0; color: var(--text-secondary); font-size: 15px; }
.network-stage { height: 620px; margin-top: -4px; transform-origin: center; transition: transform .2s ease; }
.panel-footnote { margin: 0; color: var(--text-muted); font-size: 14px; }

.detail-panel { height: 726px; overflow: hidden; padding: 28px 24px; }
.eyebrow { margin: 0 0 12px; color: var(--text-secondary); font-size: 14px; }
.detail-panel h2 { margin-bottom: 10px; font-size: 24px; }
.detail-stat { margin-top: 26px; font-family: var(--font-display); font-size: 30px; font-weight: 800; }
.detail-delta { color: var(--green); font-size: 16px; }
.detail-panel hr { border: 0; border-top: 1px solid var(--border); margin: 18px 0 20px; }
.detail-panel h3 { margin: 0 0 14px; font-size: 16px; }
.pill-stack { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-bottom: 12px; }
.related-list { display: grid; gap: 12px; margin: 0 0 60px; padding: 0; list-style: none; color: var(--text-primary); font-size: 14px; }
.dark-btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; border-radius: 12px; background: var(--text-primary); color: #fff; font-size: 15px; font-weight: 700; padding: 12px 18px; transition: background .15s ease, transform .15s ease; }
.dark-btn:hover { background: var(--accent); transform: translateY(-1px); }
.full-btn { width: 100%; }

@media (max-width: 1100px) { .map-layout { grid-template-columns: 1fr; } .detail-panel { min-height: auto; } }
@media (max-width: 640px) { .map-toolbar { align-items: flex-start; flex-direction: column; } .network-panel { padding: 24px 20px; } }
</style>
