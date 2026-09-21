<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  years: { type: Array, default: () => [] },
  series: { type: Array, default: () => [] },
  metric: { type: String, default: 'share' },
  visibleYear: { type: Number, default: null }
})

const topicColors = ['#6f61ef', '#20ad84', '#527cf0', '#ef7893', '#e89a33']
const conferenceStyles = {
  CVPR: { dash: '', marker: 'circle' },
  ICCV: { dash: '9 5', marker: 'square' },
  ECCV: { dash: '2 5', marker: 'triangle' }
}
const margins = { top: 28, right: 34, bottom: 58, left: 70 }
const height = 390
const activePoint = ref(null)

const width = computed(() => Math.max(760, props.years.length * 92 + margins.left + margins.right))
const plotWidth = computed(() => width.value - margins.left - margins.right)
const plotHeight = height - margins.top - margins.bottom
const visibleYears = computed(() => props.years.filter((year) => props.visibleYear == null || year <= props.visibleYear))
const topicOrder = computed(() => [...new Set(props.series.map((entry) => entry.topic))])

function valueFor(point) {
  return props.metric === 'count' ? point.paper_count : point.share_percent
}

function niceMaximum(maximum) {
  if (!(maximum > 0)) return 1
  const roughStep = maximum / 4
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalized = roughStep / magnitude
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return niceStep * magnitude * 4
}

const maximum = computed(() => niceMaximum(Math.max(
  ...props.series.flatMap((entry) => entry.points)
    .filter((point) => point.has_data && visibleYears.value.includes(point.year))
    .map((point) => Number(valueFor(point))),
  0
)))
const yTicks = computed(() => Array.from({ length: 5 }, (_unused, index) => maximum.value * index / 4))
const unitLabel = computed(() => props.metric === 'count' ? 'Paper count' : 'Normalized share (%)')

function xFor(year) {
  const index = props.years.indexOf(year)
  if (props.years.length <= 1) return margins.left + plotWidth.value / 2
  return margins.left + (index / (props.years.length - 1)) * plotWidth.value
}

function yFor(value) {
  return margins.top + plotHeight - (Number(value) / maximum.value) * plotHeight
}

function topicColor(topic) {
  const index = topicOrder.value.indexOf(topic)
  return topicColors[(index < 0 ? 0 : index) % topicColors.length]
}

function conferenceStyle(conference) {
  return conferenceStyles[conference] || conferenceStyles.CVPR
}

const plottedSeries = computed(() => props.series.map((entry) => {
  const visiblePoints = entry.points.filter((point) => visibleYears.value.includes(point.year))
  const segments = []
  let current = []
  for (const point of visiblePoints) {
    if (point.has_data) {
      current.push({ ...point, x: xFor(point.year), y: yFor(valueFor(point)) })
    } else if (current.length) {
      segments.push(current)
      current = []
    }
  }
  if (current.length) segments.push(current)
  return {
    ...entry,
    color: topicColor(entry.topic),
    style: conferenceStyle(entry.conference),
    segments,
    points: segments.flat(),
    missingPoints: visiblePoints
      .filter((point) => !point.has_data)
      .map((point) => ({ ...point, x: xFor(point.year), y: margins.top + plotHeight }))
  }
}))

const tableRows = computed(() => props.series.flatMap((entry) => entry.points
  .filter((point) => visibleYears.value.includes(point.year))
  .map((point) => ({ topic: entry.topic, conference: entry.conference, ...point }))))

function pathFor(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
}

function formatTick(value) {
  if (props.metric === 'count') return Number.isInteger(value) ? value : value.toFixed(1)
  return `${Number(value.toFixed(1))}%`
}

function pointLabel(entry, point) {
  if (!point.has_data) return `${entry.topic}, ${entry.conference}, ${point.year}: no data`
  return `${entry.topic}, ${entry.conference}, ${point.year}: ${point.paper_count} papers out of ${point.eligible_paper_total}, ${point.share_percent}% share`
}

watch(() => props.visibleYear, (year) => {
  if (activePoint.value && year != null && activePoint.value.year > year) activePoint.value = null
})
</script>

<template>
  <div class="trend-chart">
    <div class="series-legend" aria-label="Trend series legend">
      <span v-for="entry in plottedSeries" :key="`${entry.topic}-${entry.conference}`">
        <i
          :class="[`marker-${entry.style.marker}`, `conference-${entry.conference.toLowerCase()}`]"
          :style="{ '--series-color': entry.color, '--series-dash': entry.style.dash || 'none' }"
          aria-hidden="true"
        ></i>
        {{ entry.topic }} · {{ entry.conference }}
      </span>
    </div>

    <div class="chart-scroll" tabindex="0" aria-label="Scrollable topic trend chart">
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        :style="{ minWidth: `${width}px` }"
        role="img"
        aria-labelledby="trend-chart-title trend-chart-description"
      >
        <title id="trend-chart-title">Topic trends by conference and year</title>
        <desc id="trend-chart-description">
          Lines show {{ unitLabel.toLowerCase() }} through {{ visibleYear || years.at(-1) }}. Missing conference-year data breaks a line.
        </desc>

        <g class="grid-lines">
          <g v-for="tick in yTicks" :key="tick">
            <line :x1="margins.left" :x2="width - margins.right" :y1="yFor(tick)" :y2="yFor(tick)" />
            <text :x="margins.left - 12" :y="yFor(tick) + 4" text-anchor="end">{{ formatTick(tick) }}</text>
          </g>
        </g>

        <g class="axis-labels">
          <text
            v-for="year in years"
            :key="year"
            :x="xFor(year)"
            :y="height - margins.bottom + 25"
            :class="{ future: visibleYear != null && year > visibleYear }"
            text-anchor="middle"
          >{{ year }}</text>
          <text :x="margins.left + plotWidth / 2" :y="height - 9" text-anchor="middle">Publication year</text>
          <text :transform="`translate(17 ${margins.top + plotHeight / 2}) rotate(-90)`" text-anchor="middle">{{ unitLabel }}</text>
        </g>

        <g v-for="entry in plottedSeries" :key="`${entry.topic}-${entry.conference}`" class="series-line">
          <path
            v-for="(segment, index) in entry.segments"
            :key="index"
            :d="pathFor(segment)"
            :stroke="entry.color"
            :stroke-dasharray="entry.style.dash"
          />
          <g
            v-for="point in entry.points"
            :key="point.year"
            class="point-marker"
            tabindex="0"
            role="button"
            :aria-label="pointLabel(entry, point)"
            @focus="activePoint = { topic: entry.topic, conference: entry.conference, ...point }"
            @click="activePoint = { topic: entry.topic, conference: entry.conference, ...point }"
          >
            <circle v-if="entry.style.marker === 'circle'" :cx="point.x" :cy="point.y" r="5" :fill="entry.color" />
            <rect v-else-if="entry.style.marker === 'square'" :x="point.x - 5" :y="point.y - 5" width="10" height="10" rx="1" :fill="entry.color" />
            <polygon
              v-else
              :points="`${point.x},${point.y - 6} ${point.x - 6},${point.y + 5} ${point.x + 6},${point.y + 5}`"
              :fill="entry.color"
            />
          </g>
          <g
            v-for="point in entry.missingPoints"
            :key="`missing-${point.year}`"
            class="missing-marker"
            tabindex="0"
            role="button"
            :aria-label="pointLabel(entry, point)"
            @focus="activePoint = { topic: entry.topic, conference: entry.conference, ...point }"
            @click="activePoint = { topic: entry.topic, conference: entry.conference, ...point }"
          >
            <line :x1="point.x - 4" :x2="point.x + 4" :y1="point.y - 4" :y2="point.y + 4" />
            <line :x1="point.x - 4" :x2="point.x + 4" :y1="point.y + 4" :y2="point.y - 4" />
          </g>
        </g>
      </svg>
    </div>

    <div v-if="activePoint?.has_data" class="point-detail" role="status">
      <strong>{{ activePoint.topic }} · {{ activePoint.conference }} · {{ activePoint.year }}</strong>
      <span>{{ activePoint.paper_count }} papers / {{ activePoint.eligible_paper_total }} eligible</span>
      <span>{{ activePoint.share_percent }}% normalized share</span>
    </div>
    <div v-else-if="activePoint" class="point-detail missing-detail" role="status">
      <strong>{{ activePoint.topic }} · {{ activePoint.conference }} · {{ activePoint.year }}</strong>
      <span>No data — this conference-year has no eligible papers.</span>
    </div>
    <p v-else class="point-hint">Focus or select a marker to inspect its source counts.</p>

    <details class="data-table-wrap">
      <summary>View accessible chart data through {{ visibleYear || years.at(-1) }}</summary>
      <div class="table-scroll">
        <table>
          <caption>Topic trends by conference and publication year</caption>
          <thead>
            <tr><th>Topic</th><th>Conference</th><th>Year</th><th>Paper count</th><th>Eligible papers</th><th>Share</th><th>Availability</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in tableRows" :key="`${row.topic}-${row.conference}-${row.year}`">
              <td>{{ row.topic }}</td>
              <td>{{ row.conference }}</td>
              <td>{{ row.year }}</td>
              <td>{{ row.paper_count }}</td>
              <td>{{ row.eligible_paper_total }}</td>
              <td>{{ row.has_data ? `${row.share_percent}%` : 'No data' }}</td>
              <td>{{ row.has_data ? 'Available' : 'Unavailable' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>

<style scoped>
.trend-chart { min-width:0; }
.series-legend { display:flex; flex-wrap:wrap; gap:8px 13px; margin:4px 0 14px; }
.series-legend span { display:inline-flex; align-items:center; gap:7px; color:var(--text-secondary); font-size:12px; font-weight:650; }
.series-legend i { position:relative; width:26px; height:10px; flex:0 0 auto; border-top:2px var(--series-color) solid; }
.series-legend i::after { position:absolute; top:-5px; left:10px; width:8px; height:8px; border:2px solid #fff; background:var(--series-color); content:''; }
.series-legend i.marker-circle::after { border-radius:50%; }
.series-legend i.marker-square::after { border-radius:1px; }
.series-legend i.marker-triangle::after { width:0; height:0; top:-7px; border:5px solid transparent; border-bottom:9px solid var(--series-color); background:transparent; }
.series-legend i.conference-iccv { border-top-style:dashed; }
.series-legend i.conference-eccv { border-top-style:dotted; }
.chart-scroll { width:100%; overflow-x:auto; border:1px solid #eff0f6; border-radius:12px; background:#fff; }
.chart-scroll:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
svg { display:block; width:100%; height:auto; }
.grid-lines line { stroke:#eceef5; stroke-width:1; }
.grid-lines text, .axis-labels text { fill:#8e91a7; font-size:12px; }
.axis-labels text:last-child, .axis-labels text:nth-last-child(2) { fill:#62657b; font-weight:650; }
.axis-labels .future { fill:#c2c4d1; }
.series-line path { fill:none; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; }
.point-marker { cursor:pointer; outline:none; }
.point-marker circle, .point-marker rect, .point-marker polygon { stroke:#fff; stroke-width:2; transition:filter .12s ease, stroke-width .12s ease; }
.point-marker:hover > *, .point-marker:focus > * { filter:drop-shadow(0 0 3px rgba(20,21,43,.3)); stroke-width:3; }
.missing-marker { cursor:pointer; outline:none; }
.missing-marker line { stroke:#a8aabd; stroke-width:2; }
.missing-marker:hover line, .missing-marker:focus line { stroke:var(--accent); stroke-width:3; }
.point-detail, .point-hint { min-height:34px; margin:9px 0 0; padding:8px 10px; border-radius:9px; font-size:12px; }
.point-detail { display:flex; flex-wrap:wrap; align-items:center; gap:6px 18px; color:var(--text-secondary); background:#f7f6ff; }
.point-detail strong { color:var(--text-primary); }
.point-detail.missing-detail { color:#75622f; background:#fff8df; }
.point-hint { color:var(--text-muted); }
.data-table-wrap { margin-top:12px; border-top:1px solid var(--border); }
.data-table-wrap summary { padding:12px 2px 2px; color:var(--accent); font-size:13px; font-weight:700; cursor:pointer; }
.table-scroll { margin-top:10px; overflow-x:auto; }
table { width:100%; min-width:720px; border-collapse:collapse; font-size:12px; }
caption { padding:0 0 8px; color:var(--text-secondary); text-align:left; }
th, td { padding:8px 10px; border-bottom:1px solid #eff0f5; text-align:left; white-space:nowrap; }
th { color:var(--text-muted); font-size:11px; text-transform:uppercase; }
td { color:var(--text-secondary); }
@media (max-width:720px) { .series-legend { gap:7px 10px; } .series-legend span { font-size:11px; } }
</style>
