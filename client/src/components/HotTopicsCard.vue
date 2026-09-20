<script setup>
import { Flame, ArrowRight } from 'lucide-vue-next'
import SparkLine from './SparkLine.vue'
import { hotTopics } from '@/data/mock'
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

    <table class="topics-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th class="col-topic">Topic</th>
          <th class="col-papers">Papers</th>
          <th class="col-trend">Trend (vs 2024)</th>
          <th class="col-spark"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="topic in hotTopics.slice(0, 8)" :key="topic.rank">
          <td class="col-rank">{{ topic.rank }}</td>
          <td class="col-topic">
            <router-link to="/hot-topics" class="topic-name">
              <span class="topic-dot" :style="{ background: topic.color }"></span>
              {{ topic.name }}
            </router-link>
          </td>
          <td class="col-papers">{{ topic.papers }}</td>
          <td class="col-trend">+{{ topic.trend }}%</td>
          <td class="col-spark">
            <SparkLine :data="topic.spark" color="#22c38b" :width="84" :height="24" />
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
  padding: 2px 20px;
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
  width: 40%;
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
  width: 14%;
  font-weight: 500;
}

.col-trend {
  width: 20%;
  color: var(--green);
  font-weight: 600;
}

.col-spark {
  width: 19%;
  text-align: right;
}
</style>
