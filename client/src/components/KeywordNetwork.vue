<script setup>
import { computed } from 'vue'
import { ArrowRight, Network, RefreshCw } from 'lucide-vue-next'
import NetworkGraph from './NetworkGraph.vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  emptyMessage: { type: String, default: 'No eligible keyword relationships are available.' }
})

defineEmits(['retry'])

const previewNodeLimit = 10
const previewLinkLimit = 20

function compareNodes(left, right) {
  return right.weighted_degree - left.weighted_degree
    || right.paper_count - left.paper_count
    || (left.topic < right.topic ? -1 : left.topic > right.topic ? 1 : 0)
}

function compareLinks(left, right) {
  return right.cooccurrence_count - left.cooccurrence_count
    || right.jaccard_similarity - left.jaccard_similarity
    || (left.source < right.source ? -1 : left.source > right.source ? 1 : 0)
    || (left.target < right.target ? -1 : left.target > right.target ? 1 : 0)
}

const previewNodes = computed(() => {
  const rankedNodes = [...props.nodes].sort(compareNodes)
  const nodeById = new Map(rankedNodes.map((node) => [node.id, node]))
  const rankedLinks = [...props.links].sort(compareLinks)
  const selected = []
  const selectedIds = new Set()
  const addNode = (id) => {
    const node = nodeById.get(id)
    if (node && !selectedIds.has(id) && selected.length < previewNodeLimit) {
      selected.push(node)
      selectedIds.add(id)
    }
  }

  // Keep the strongest node visible, then grow the preview through real
  // co-occurrence links so a sparse network does not render as disconnected dots.
  addNode(rankedNodes[0]?.id)
  while (selected.length < previewNodeLimit && selected.length < rankedNodes.length) {
    const connectedCandidate = rankedNodes
      .filter((node) => !selectedIds.has(node.id))
      .map((node) => ({
        node,
        connectionWeight: rankedLinks.reduce((total, link) => {
          const touchesNode = link.source === node.id || link.target === node.id
          const otherId = link.source === node.id ? link.target : link.source
          return total + (touchesNode && selectedIds.has(otherId) ? link.cooccurrence_count : 0)
        }, 0)
      }))
      .sort((left, right) => right.connectionWeight - left.connectionWeight || compareNodes(left.node, right.node))[0]
    if (connectedCandidate?.connectionWeight > 0) addNode(connectedCandidate.node.id)
    else addNode(rankedNodes.find((node) => !selectedIds.has(node.id))?.id)
  }
  return selected
})
const previewNodeIds = computed(() => new Set(previewNodes.value.map((node) => node.id)))
const previewLinks = computed(() => props.links
  .filter((link) => previewNodeIds.value.has(link.source) && previewNodeIds.value.has(link.target))
  .sort(compareLinks)
  .slice(0, previewLinkLimit))
</script>

<template>
  <section class="card network-card">
    <header class="card-header">
      <div class="card-title"><Network color="#6c5ce7" :stroke-width="2" />Keyword Network</div>
      <router-link to="/keyword-map" class="card-go" title="Open keyword map"><ArrowRight /></router-link>
    </header>

    <div v-if="error && previewNodes.length" class="inline-error" role="alert">
      <span>{{ error }}</span><button type="button" @click="$emit('retry')"><RefreshCw :size="13" /> Retry</button>
    </div>
    <div v-if="error && !previewNodes.length" class="network-state error" role="alert">
      <span>{{ error }}</span><button type="button" @click="$emit('retry')"><RefreshCw :size="14" /> Retry</button>
    </div>
    <div v-if="!error && loading && !previewNodes.length" class="network-state" role="status">Loading live network…</div>
    <div v-if="!error && !loading && !previewNodes.length" class="network-state">{{ emptyMessage }}</div>
    <div v-if="previewNodes.length" class="preview-stage">
      <NetworkGraph :nodes="previewNodes" :links="previewLinks" compact :interactive="false" />
      <p v-if="!previewLinks.length">No qualifying edges connect the preview nodes.</p>
    </div>
  </section>
</template>

<style scoped>
.network-card { display:flex; flex-direction:column; overflow:hidden; }
.preview-stage { position:relative; flex:1; min-height:0; padding:0 12px 6px; }
.preview-stage :deep(.network-graph) { height:100%; min-height:290px; }
.preview-stage p { position:absolute; right:18px; bottom:10px; left:18px; margin:0; padding:6px 9px; border-radius:8px; color:#876614; background:#fff8e7; font-size:11px; text-align:center; }
.network-state { display:flex; min-height:310px; padding:24px; align-items:center; justify-content:center; color:var(--text-secondary); text-align:center; font-size:14px; }
.network-state.error { flex-direction:column; gap:12px; color:#a83d57; }
.network-state button, .inline-error button { display:inline-flex; align-items:center; gap:5px; color:inherit; font-weight:700; }
.inline-error { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 16px 4px; padding:6px 9px; border-radius:8px; color:#a83d57; background:#ffedf2; font-size:12px; }
.inline-error span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.inline-error button { flex-shrink:0; }
</style>
