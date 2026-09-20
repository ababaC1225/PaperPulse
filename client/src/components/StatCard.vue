<script setup>
import { FileText, Tag, Users, RefreshCw, TrendingUp, Check } from 'lucide-vue-next'
import SparkLine from './SparkLine.vue'

const props = defineProps({
  stat: { type: Object, required: true }
})

const icons = {
  papers: FileText,
  topics: Tag,
  conferences: Users,
  sync: RefreshCw
}

const sparkColors = {
  teal: '#2dd4bf',
  violet: '#845ef7'
}
</script>

<template>
  <div class="card stat-card">
    <div class="stat-top">
      <span class="stat-icon" :class="`tone-${stat.tone}`">
        <component :is="icons[stat.icon]" :size="19" />
      </span>
      <span class="stat-label">{{ stat.label }}</span>
    </div>

    <div class="stat-body">
      <div>
        <div class="stat-value">{{ stat.value }}</div>
        <div class="stat-delta" :class="{ positive: stat.deltaPositive }">
          <TrendingUp v-if="stat.key !== 'sync'" :size="13" />
          <span v-else class="status-dot"></span>
          {{ stat.delta }}
        </div>
      </div>

      <SparkLine
        v-if="stat.spark"
        :data="stat.spark"
        :color="sparkColors[stat.sparkTone] || '#2dd4bf'"
        :width="110"
        :height="42"
      />

      <div v-else-if="stat.bars" class="bars">
        <span
          v-for="(b, i) in stat.bars"
          :key="i"
          class="bar"
          :style="{ height: `${b}px` }"
        ></span>
      </div>

      <div v-else-if="stat.status" class="status-badge">
        <Check :size="22" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  height: 133px;
  min-height: 0;
  padding: 18px 22px 14px;
}

.stat-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: none;
}

.tone-blue { background: #e7efff; color: #4f7cff; }
.tone-violet { background: #ecebfd; color: #6c5ce7; }
.tone-teal { background: #e4f8f0; color: #0ca678; }

.stat-label {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
}

.stat-body {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}

.stat-body :deep(svg) {
  height: 26px;
  width: 82px;
}

.stat-value {
  font-family: var(--font-display);
  font-size: 31px;
  font-weight: 800;
  line-height: 1.2;
}

.stat-delta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
}

.stat-delta.positive {
  color: var(--green);
}

.stat-delta .lucide {
  display: none;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 32px;
}

.bar {
  width: 10px;
  border-radius: 4px 4px 2px 2px;
  background: linear-gradient(180deg, #9db9ff, #c9d8ff);
}

.status-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--green-soft);
  color: var(--green);
  display: none;
}
</style>
