<script setup>
import { Newspaper, ArrowRight } from 'lucide-vue-next'
import { recentPapers } from '@/data/mock'
</script>

<template>
  <section class="card recent-card">
    <header class="card-header">
      <div class="card-title">
        <Newspaper color="#14152b" :stroke-width="2" />
        Recent Papers
      </div>
      <router-link to="/papers" class="card-go" title="Open paper library">
        <ArrowRight />
      </router-link>
    </header>

    <div class="table-wrap">
      <table class="papers-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Authors</th>
            <th>Conference</th>
            <th class="col-date">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="paper in recentPapers.slice(0, 4)" :key="paper.title">
            <td class="col-title">
              <router-link to="/papers" class="paper-title">{{ paper.title }}</router-link>
            </td>
            <td class="col-authors">{{ paper.authors }}</td>
            <td class="col-conf">{{ paper.conference }}</td>
            <td class="col-date">{{ paper.date }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
}

.recent-card {
  height: 209px;
  overflow: hidden;
}

.recent-card .card-header {
  padding-bottom: 1px;
}

.papers-table {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
}

.papers-table th {
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 1px 24px 4px;
  border-bottom: 1px solid var(--border);
}

.papers-table td {
  padding: 4px 24px;
  font-size: 14px;
  border-bottom: 1px solid #f3f4f9;
  vertical-align: middle;
}

.papers-table tr:last-child td {
  border-bottom: none;
}

.papers-table tbody tr {
  transition: background 0.12s ease;
}

.papers-table tbody tr:hover {
  background: #fafbff;
}

.col-title {
  width: 48%;
  max-width: 560px;
  white-space: nowrap;
}

.paper-title {
  font-weight: 600;
}

.paper-title:hover {
  color: var(--accent);
}

.col-authors,
.col-conf {
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-date {
  width: 17%;
  color: var(--text-secondary);
  white-space: nowrap;
  text-align: right;
}
</style>
