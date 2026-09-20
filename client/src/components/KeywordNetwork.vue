<template>
  <section class="card network-card">
    <header class="card-header">
      <div class="card-title">
        <Network color="#6c5ce7" :stroke-width="2" />
        Keyword Network
      </div>
      <router-link to="/keyword-map" class="card-go" title="Open keyword map">
        <ArrowRight />
      </router-link>
    </header>

    <svg class="overview-network" viewBox="0 0 600 335" role="img" aria-label="Keyword network overview">
      <g class="network-links">
        <line x1="300" y1="150" x2="165" y2="66" />
        <line x1="300" y1="150" x2="435" y2="66" />
        <line x1="300" y1="150" x2="165" y2="248" />
        <line x1="300" y1="150" x2="435" y2="248" />
        <line x1="300" y1="150" x2="300" y2="296" />
      </g>
      <g class="network-node">
        <circle cx="300" cy="150" r="32" fill="#9b7aff" />
        <text x="300" y="209" class="strong">Vision-Language</text>
      </g>
      <g class="network-node">
        <circle cx="165" cy="66" r="18" fill="#52d49c" /><text x="165" y="98">Diffusion</text>
        <circle cx="435" cy="66" r="16" fill="#ffa365" /><text x="435" y="98">Autonomous</text>
        <circle cx="165" cy="248" r="15" fill="#6ca8ff" /><text x="165" y="279">3D Vision</text>
        <circle cx="435" cy="248" r="15" fill="#f06f89" /><text x="435" y="279">Segmentation</text>
        <circle cx="300" cy="296" r="12" fill="#9b7aff" /><text x="300" y="328">Video</text>
      </g>
    </svg>
  </section>
</template>

<script setup>
import { Network, ArrowRight } from 'lucide-vue-next'
</script>

<style scoped>
.network-card { display:flex; flex-direction:column; overflow:hidden; }
.overview-network { display:block; width:100%; height:335px; flex:0 0 335px; }
.network-links line { stroke:#d9def1; stroke-width:1.2; }
.network-node circle { opacity:.96; }
.network-node text { fill:var(--text-primary); font-size:13px; text-anchor:middle; }
.network-node .strong { font-weight:700; }
</style>
