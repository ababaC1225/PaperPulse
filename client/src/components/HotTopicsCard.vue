<script setup>
import { computed } from 'vue'
import { Flame, ArrowRight, RefreshCw } from 'lucide-vue-next'

const props = defineProps({
  topics: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  emptyMessage: { type: String, default: 'No eligible topics are available.' },
  baselineYear: { type: Number, default: null }
})

defineEmits(['retry'])

const colors = ['#6f61ef', '#27c3b2', '#5f8df6', '#ffa34c', '#f27698', '#20ad84', '#527cf0', '#8765ed', '#15a985', '#e6a700']
const displayedTopics = computed(() => props.topics.slice(0, 10))

function growthLabel(value) {
  if (value == null) return 'No baseline'
  return `${value > 0 ? '+' : ''}${value}%`
}
</script>

<template>
  <section class="card">
    <header class="card-header">
      <div class="card-title">
        <Flame color="#ff922b" :stroke-width="2" />
        Top 10 Hot Topics
      </div>
      <router-link to="/hot-topics" class="card-go" title="View all hot topics">
        <ArrowRight />
      </router-link>
    </header>

    <div v-if="error && displayedTopics.length" class="inline-error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="$emit('retry')"><RefreshCw :size="13" /> Retry</button>
    </div>
    <div v-if="error && !displayedTopics.length" class="card-state error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="$emit('retry')"><RefreshCw :size="14" /> Retry</button>
    </div>
    <div v-if="!error && loading && !displayedTopics.length" class="card-state" role="status">Loading live topics…</div>
    <div v-if="!error && !loading && !displayedTopics.length" class="card-state">{{ emptyMessage }}</div>

    <table v-if="displayedTopics.length" class="topics-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th class="col-topic">Topic</th>
          <th class="col-papers">Papers</th>
          <th class="col-share">Share</th>
          <th class="col-trend">{{ baselineYear ? `Growth vs ${baselineYear}` : 'Growth' }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(topic, index) in displayedTopics" :key="topic.topic">
          <td class="col-rank">{{ topic.rank }}</td>
          <td class="col-topic">
            <router-link to="/hot-topics" class="topic-name">
              <span class="topic-dot" :style="{ background: colors[index % colors.length] }"></span>
              {{ topic.topic }}
            </router-link>
          </td>
          <td class="col-papers">{{ topic.paper_count }}</td>
          <td class="col-share">{{ topic.share_percent }}%</td>
          <td class="col-trend" :class="{ neutral: topic.growth_percent == null, negative: topic.growth_percent < 0 }">
            {{ growthLabel(topic.growth_percent) }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.topics-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  padding-bottom: 8px;
}

.topics-table th {
  text-align: left;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 3px 20px 5px;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
}

.topics-table td {
  height: 30px;
  padding: 1px 20px;
  font-size: 14px;
  border-bottom: 1px solid #f3f4f9;
}

.topics-table tr:last-child td {
  border-bottom: none;
}

.topics-table tbody tr {
  transition: background 0.12s ease;
}

.topics-table tbody tr:hover {
  background: #fafbff;
}

.col-rank {
  width: 7%;
  color: var(--text-secondary);
}

.topic-name {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  font-weight: 600;
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
  max-width: none;
}

.col-topic {
  width: 37%;
}

.col-topic .topic-name {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  font-weight: 600;
}

.topic-name:hover {
  color: var(--accent);
}

.topic-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.col-papers {
  width: 13%;
  font-weight: 500;
}

.col-share {
  width: 14%;
  font-weight: 500;
}

.col-trend {
  width: 29%;
  color: var(--green);
  font-weight: 600;
}

.col-trend.neutral {
  color: var(--text-muted);
  font-weight: 500;
}

.col-trend.negative {
  color: #cf6077;
}

.card-state {
  display: flex;
  min-height: 310px;
  padding: 24px;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

.card-state.error {
  flex-direction: column;
  gap: 12px;
  color: #a83d57;
}

.card-state button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  font-weight: 700;
}

.inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 16px 4px;
  padding: 6px 9px;
  border-radius: 8px;
  color: #a83d57;
  background: #ffedf2;
  font-size: 12px;
}

.inline-error span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inline-error button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  color: inherit;
  font-weight: 700;
}
</style>
