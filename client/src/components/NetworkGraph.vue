<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  interactive: { type: Boolean, default: true }
})

const emit = defineEmits(['select', 'reset'])

const viewBox = { width: 900, height: 700, centerX: 450, centerY: 340 }
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const dragging = ref(false)
let dragStart = null

const colors = ['#7061ee', '#2bbfab', '#5e8df2', '#f3a04b', '#ed7292', '#20aa82', '#8a67e9', '#397ac9']

function compareTopic(left, right) {
  return left.topic < right.topic ? -1 : left.topic > right.topic ? 1 : 0
}

const sortedNodes = computed(() => [...props.nodes].sort((left, right) => (
  right.weighted_degree - left.weighted_degree
  || right.paper_count - left.paper_count
  || compareTopic(left, right)
)))

const positionedNodes = computed(() => {
  if (!sortedNodes.value.length) return []
  const counts = sortedNodes.value.map((node) => node.paper_count)
  const minCount = Math.min(...counts)
  const maxCount = Math.max(...counts)
  let ring = 0
  let ringIndex = 0
  let ringCapacity = 8

  return sortedNodes.value.map((node, index) => {
    let x = viewBox.centerX
    let y = viewBox.centerY
    if (index > 0) {
      if (ringIndex >= ringCapacity) {
        ring += 1
        ringIndex = 0
        ringCapacity = 8 + ring * 6
      }
      const radius = props.compact ? 185 + ring * 90 : 112 + ring * 64
      const angleOffset = ring % 2 ? Math.PI / ringCapacity : 0
      const angle = -Math.PI / 2 + angleOffset + (ringIndex * Math.PI * 2) / ringCapacity
      x = viewBox.centerX + Math.cos(angle) * radius
      y = viewBox.centerY + Math.sin(angle) * radius
      ringIndex += 1
    }
    const normalized = maxCount === minCount ? 0.55 : (Math.sqrt(node.paper_count) - Math.sqrt(minCount)) / (Math.sqrt(maxCount) - Math.sqrt(minCount))
    const radius = (props.compact ? 12 : 13) + normalized * (props.compact ? 13 : 17)
    return { ...node, x, y, radius, color: colors[index % colors.length] }
  })
})

const positionById = computed(() => new Map(positionedNodes.value.map((node) => [node.id, node])))
const renderedLinks = computed(() => props.links
  .map((link) => ({ ...link, sourceNode: positionById.value.get(link.source), targetNode: positionById.value.get(link.target) }))
  .filter((link) => link.sourceNode && link.targetNode))
const connectedIds = computed(() => {
  const ids = new Set()
  if (!props.selectedId) return ids
  for (const link of renderedLinks.value) {
    if (link.source === props.selectedId) ids.add(link.target)
    if (link.target === props.selectedId) ids.add(link.source)
  }
  return ids
})
const maximumEdgeCount = computed(() => Math.max(...props.links.map((link) => link.cooccurrence_count), 1))
const graphTransform = computed(() => (
  `translate(${viewBox.centerX + pan.value.x} ${viewBox.centerY + pan.value.y}) scale(${zoom.value}) translate(${-viewBox.centerX} ${-viewBox.centerY})`
))

function edgeWidth(link) {
  return 1.1 + (link.cooccurrence_count / maximumEdgeCount.value) * 5
}

function edgeOpacity(link) {
  return Math.min(0.9, 0.3 + Number(link.jaccard_similarity) * 0.65)
}

function shortLabel(topic) {
  return topic.length > 26 ? `${topic.slice(0, 24)}…` : topic
}

function nodeClass(node) {
  return {
    selected: props.selectedId === node.id,
    connected: props.selectedId && connectedIds.value.has(node.id),
    muted: props.selectedId && props.selectedId !== node.id && !connectedIds.value.has(node.id)
  }
}

function linkClass(link) {
  return {
    active: props.selectedId && (link.source === props.selectedId || link.target === props.selectedId),
    muted: props.selectedId && link.source !== props.selectedId && link.target !== props.selectedId
  }
}

function selectNode(node) {
  if (!props.interactive) return
  emit('select', node.id)
}

function zoomIn() {
  zoom.value = Math.min(2.2, Number((zoom.value + 0.15).toFixed(2)))
}

function zoomOut() {
  zoom.value = Math.max(0.6, Number((zoom.value - 0.15).toFixed(2)))
}

function resetView() {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
  emit('reset')
}

function startPan(event) {
  if (!props.interactive) return
  dragging.value = true
  dragStart = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function movePan(event) {
  if (!dragging.value || !dragStart) return
  const bounds = event.currentTarget.getBoundingClientRect()
  pan.value = {
    x: dragStart.panX + ((event.clientX - dragStart.x) / bounds.width) * viewBox.width,
    y: dragStart.panY + ((event.clientY - dragStart.y) / bounds.height) * viewBox.height
  }
}

function endPan() {
  dragging.value = false
  dragStart = null
}

defineExpose({ zoomIn, zoomOut, resetView })
</script>

<template>
  <div class="network-graph" :class="{ compact, dragging, static: !interactive }">
    <svg
      :viewBox="`0 0 ${viewBox.width} ${viewBox.height}`"
      role="group"
      :aria-label="`Keyword co-occurrence network with ${nodes.length} nodes and ${links.length} undirected edges`"
      @pointermove="movePan"
      @pointerup="endPan"
      @pointercancel="endPan"
      @pointerleave="endPan"
    >
      <rect class="pan-surface" x="0" y="0" :width="viewBox.width" :height="viewBox.height" @pointerdown="startPan" />
      <g :transform="graphTransform">
        <g class="links" aria-hidden="true">
          <line
            v-for="link in renderedLinks"
            :key="`${link.source}--${link.target}`"
            :class="linkClass(link)"
            :x1="link.sourceNode.x"
            :y1="link.sourceNode.y"
            :x2="link.targetNode.x"
            :y2="link.targetNode.y"
            :stroke-width="edgeWidth(link)"
            :stroke-opacity="edgeOpacity(link)"
          />
        </g>
        <g
          v-for="node in positionedNodes"
          :key="node.id"
          class="network-node"
          :class="nodeClass(node)"
          :role="interactive ? 'button' : undefined"
          :tabindex="interactive ? 0 : undefined"
          :aria-pressed="interactive ? selectedId === node.id : undefined"
          :aria-label="`${node.topic}: ${node.paper_count} papers, ${node.degree} returned connections`"
          @click.stop="selectNode(node)"
          @keydown.enter.prevent="selectNode(node)"
          @keydown.space.prevent="selectNode(node)"
        >
          <circle v-if="selectedId === node.id" class="selection-ring" :cx="node.x" :cy="node.y" :r="node.radius + 7" />
          <circle class="node-circle" :cx="node.x" :cy="node.y" :r="node.radius" :fill="node.color" />
          <text :x="node.x" :y="node.y + node.radius + 19">{{ shortLabel(node.topic) }}</text>
          <text v-if="!compact" class="node-count" :x="node.x" :y="node.y + 4">{{ node.paper_count }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.network-graph { width:100%; height:100%; min-height:480px; touch-action:none; user-select:none; }
.network-graph.compact { min-height:280px; }
svg { display:block; width:100%; height:100%; overflow:hidden; cursor:grab; }
.dragging svg { cursor:grabbing; }
.static svg { cursor:default; }
.pan-surface { fill:transparent; }
.links line { stroke:#aeb7d8; transition:opacity .15s ease, stroke .15s ease; }
.links line.active { stroke:#6655df; stroke-opacity:.92 !important; }
.links line.muted { opacity:.16; }
.network-node { cursor:pointer; outline:none; transition:opacity .15s ease; }
.static .network-node { cursor:default; }
.network-node .node-circle { opacity:.94; stroke:#fff; stroke-width:3; vector-effect:non-scaling-stroke; }
.network-node text { fill:var(--text-primary); font-size:13px; font-weight:650; text-anchor:middle; paint-order:stroke; stroke:#fff; stroke-width:4px; stroke-linejoin:round; pointer-events:none; }
.network-node .node-count { fill:#fff; font-size:12px; font-weight:800; stroke:none; }
.network-node.connected .node-circle { stroke:#302694; stroke-width:4; }
.network-node.selected .node-circle { stroke:#21166f; stroke-width:5; }
.network-node.selected text { font-weight:800; }
.network-node.muted { opacity:.28; }
.selection-ring { fill:none; stroke:#6c5ce7; stroke-width:3; stroke-dasharray:6 4; vector-effect:non-scaling-stroke; }
.network-node:focus-visible .node-circle { stroke:#11142d; stroke-width:5; }
.compact .network-node text { font-size:15px; }
.compact .network-node .node-circle { stroke-width:2; }
@media (max-width:700px) { .network-graph { min-height:430px; } .network-node text { font-size:15px; } }
</style>
