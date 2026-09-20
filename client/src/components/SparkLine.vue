<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, required: true },
  color: { type: String, default: '#2dd4bf' },
  width: { type: Number, default: 110 },
  height: { type: Number, default: 36 }
})

const points = computed(() => {
  const max = Math.max(...props.data)
  const min = Math.min(...props.data)
  const range = max - min || 1
  const stepX = props.width / (props.data.length - 1)
  return props.data
    .map((v, i) => {
      const x = i * stepX
      const y = props.height - 4 - ((v - min) / range) * (props.height - 10)
      return [x, y]
    })
})

const path = computed(() => {
  const pts = points.value
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const cx = (x0 + x1) / 2
    d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`
  }
  return d
})

const areaPath = computed(() => {
  const pts = points.value
  if (pts.length < 2) return ''
  return `${path.value} L ${pts[pts.length - 1][0]},${props.height} L 0,${props.height} Z`
})

const gradientId = `sg-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" fill="none" aria-hidden="true">
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.25" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="areaPath" :fill="`url(#${gradientId})`" />
    <path :d="path" :stroke="color" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>
