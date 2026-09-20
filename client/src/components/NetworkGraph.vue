<script setup>
const nodes = [
  { name: 'Diffusion Models', x: 50, y: 45, size: 10, color: '#9b7aff', strong: true },
  { name: 'Vision-Language', x: 28, y: 22, size: 6, color: '#6ca8ff' },
  { name: 'Autonomous Driving', x: 76, y: 22, size: 6, color: '#ffa365' },
  { name: '3D Vision', x: 26, y: 65, size: 5, color: '#52d49c' },
  { name: 'Segmentation', x: 77, y: 65, size: 5, color: '#f06f89' },
  { name: 'Video Understanding', x: 51, y: 79, size: 4, color: '#9b7aff' }
]

const leaves = [
  { name: 'Text-to-Image', x: 16, y: 13 },
  { name: 'DIT', x: 20, y: 34 },
  { name: 'Scene Understanding', x: 87, y: 14 },
  { name: 'BEV', x: 89, y: 33 },
  { name: 'NeRF', x: 14, y: 65 },
  { name: '3D Reconstruction', x: 19, y: 76 },
  { name: 'Semantic Segmentation', x: 92, y: 64 },
  { name: 'Medical Imaging', x: 90, y: 76 }
]
</script>

<template>
  <div class="network-graph">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Research keyword network">
      <g class="links">
        <line x1="50" y1="45" x2="28" y2="22" />
        <line x1="50" y1="45" x2="76" y2="22" />
        <line x1="50" y1="45" x2="26" y2="65" />
        <line x1="50" y1="45" x2="77" y2="65" />
        <line x1="50" y1="45" x2="51" y2="79" />
        <line x1="28" y1="22" x2="16" y2="13" />
        <line x1="28" y1="22" x2="20" y2="34" />
        <line x1="76" y1="22" x2="87" y2="14" />
        <line x1="76" y1="22" x2="89" y2="33" />
        <line x1="26" y1="65" x2="14" y2="65" />
        <line x1="26" y1="65" x2="19" y2="76" />
        <line x1="77" y1="65" x2="92" y2="64" />
        <line x1="77" y1="65" x2="90" y2="76" />
      </g>
      <g v-for="node in nodes" :key="node.name" class="network-node" :class="{ strong: node.strong }">
        <circle :cx="node.x" :cy="node.y" :r="node.size / 2" :fill="node.color" />
        <text :x="node.x" :y="node.y + node.size / 2 + 6">{{ node.name }}</text>
      </g>
      <g v-for="leaf in leaves" :key="leaf.name" class="network-leaf">
        <circle :cx="leaf.x" :cy="leaf.y" r="1.2" />
        <text :x="leaf.x + 2" :y="leaf.y + 1">{{ leaf.name }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.network-graph {
  width: 100%;
  height: 100%;
  min-height: 520px;
}

svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.links line {
  stroke: #d9def1;
  stroke-width: 0.25;
}

.network-node circle {
  opacity: 0.95;
}

.network-node text {
  fill: var(--text-primary);
  font-size: 2.3px;
  font-weight: 600;
  text-anchor: middle;
}

.network-node.strong text {
  font-weight: 800;
}

.network-leaf circle {
  fill: #b8d8ff;
}

.network-leaf text {
  fill: var(--text-secondary);
  font-size: 1.8px;
}
</style>
