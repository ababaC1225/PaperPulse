<script setup>
import { computed } from 'vue'

const props = defineProps({
  compact: { type: Boolean, default: false }
})

const width = computed(() => (props.compact ? 560 : 820))
const height = computed(() => (props.compact ? 150 : 300))
const years = [2020, 2021, 2022, 2023, 2024, 2025]
const series = [
  { key: 'diffusion', color: '#9b7aff', points: [20, 22, 30, 43, 54, 74] },
  { key: 'vision', color: '#52d49c', points: [28, 34, 38, 45, 53, 62] },
  { key: 'vlm', color: '#6ca8ff', points: [10, 18, 25, 32, 45, 52] },
  { key: 'segment', color: '#f06f89', points: [42, 49, 46, 48, 52, 58] }
]

const x = (index) => 28 + (index / (years.length - 1)) * (width.value - 56)
const y = (value) => height.value - 24 - (value / 120) * (height.value - 48)
const gridY = (step) => 18 + ((step - 1) / 4) * (height.value - 42)

function pathFor(points) {
  let path = `M ${x(0)} ${y(points[0])}`
  points.slice(1).forEach((value, index) => {
    const currentX = x(index)
    const nextX = x(index + 1)
    const middleX = currentX + (nextX - currentX) * 0.5
    path += ` H ${middleX} V ${y(value)} H ${nextX}`
  })
  return path
}
</script>

<template>
  <div class="trend-chart" :class="{ compact }">
    <svg :viewBox="`0 0 ${width} ${height}`" role="img" aria-label="Topic heat over time">
      <g class="grid-lines">
        <line v-for="step in 5" :key="step" x1="28" :x2="width - 28" :y1="gridY(step)" :y2="gridY(step)" />
      </g>
      <g v-for="line in series" :key="line.key" class="series-line">
        <path :d="pathFor(line.points)" :stroke="line.color" />
        <circle
          v-for="(point, index) in line.points"
          :key="`${line.key}-${index}`"
          :cx="x(index)"
          :cy="y(point)"
          r="5"
          :fill="line.color"
        />
      </g>
      <g class="axis-labels">
        <text v-for="(year, index) in years" :key="year" :x="x(index)" :y="height - 4">{{ year }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.trend-chart {
  width: 100%;
  min-height: 300px;
}

.trend-chart.compact {
  min-height: 150px;
}

svg {
  display: block;
  width: 100%;
  height: auto;
}

.grid-lines line {
  stroke: #edf0f7;
  stroke-width: 1;
}

.series-line path {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.axis-labels text {
  fill: #a0a2b8;
  font-size: 14px;
  text-anchor: middle;
}
</style>
