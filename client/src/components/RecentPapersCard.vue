<script setup>
import { Newspaper, ArrowRight } from 'lucide-vue-next'

defineProps({
  papers: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  emptyMessage: { type: String, default: 'No recent papers are available.' }
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric'
})

function formatAuthors(value) {
  const authors = Array.isArray(value)
    ? value.map((author) => String(author).trim()).filter(Boolean)
    : []
  if (!authors.length) return 'Not available'
  if (authors.length <= 2) return authors.join(', ')
  return `${authors[0]} et al.`
}

function formatConference(paper) {
  const values = [paper?.conference, paper?.year].filter((value) => value != null && value !== '')
  return values.length ? values.join(' ') : 'Not available'
}

function formatDate(value) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? dateFormatter.format(timestamp) : 'Not available'
}

function paperRoute(paper) {
  return paper?.paper_id ? `/papers/${encodeURIComponent(paper.paper_id)}` : '/papers'
}
</script>

<template>
  <section class="card recent-card" :aria-busy="loading">
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
          <tr v-for="paper in papers" :key="paper.paper_id">
            <td class="col-title">
              <router-link :to="paperRoute(paper)" class="paper-title">{{ paper.title || 'Not available' }}</router-link>
            </td>
            <td class="col-authors">{{ formatAuthors(paper.authors) }}</td>
            <td class="col-conf">{{ formatConference(paper) }}</td>
            <td class="col-date">{{ formatDate(paper.updated_at) }}</td>
          </tr>
          <tr v-if="loading && !papers.length" class="state-row"><td colspan="4">Loading recent papers…</td></tr>
          <tr v-else-if="!papers.length" class="state-row"><td colspan="4">{{ emptyMessage }}</td></tr>
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

.papers-table .state-row:hover {
  background: transparent;
}

.papers-table .state-row td {
  height: 118px;
  color: var(--text-secondary);
  text-align: center;
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
