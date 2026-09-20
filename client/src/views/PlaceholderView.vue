<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Network, BarChart3, Library, CloudUpload, Hammer } from 'lucide-vue-next'

const route = useRoute()

const icons = {
  network: Network,
  chart: BarChart3,
  library: Library,
  import: CloudUpload
}

const title = computed(() => route.meta.title || 'Coming soon')
const icon = computed(() => icons[route.meta.icon] || Hammer)
</script>

<template>
  <div class="placeholder-page">
    <div class="page-head">
      <div>
        <h1>{{ title }}</h1>
        <p class="subtitle">This module is wired into the router and ready to be built out.</p>
      </div>
    </div>

    <section class="card placeholder-card">
      <div class="placeholder-icon">
        <component :is="icon" :size="30" />
      </div>
      <h2>{{ title }} is on the way</h2>
      <p>
        The route <code>{{ route.path }}</code> is already connected. The backend API for this
        module will plug in here next.
      </p>
      <router-link to="/" class="back-btn">Back to Overview</router-link>
    </section>
  </div>
</template>

<style scoped>
.placeholder-page {
  max-width: 100%;
  margin: 0 auto;
}

.page-head {
  margin-bottom: 24px;
}

h1 {
  font-size: 37px;
  font-weight: 800;
}

.subtitle {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 18.5px;
}

.placeholder-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 80px 24px;
}

.placeholder-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--accent-soft);
  color: var(--accent);
  margin-bottom: 18px;
}

h2 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
}

p {
  margin: 0 0 22px;
  color: var(--text-secondary);
  max-width: 420px;
}

code {
  background: var(--bg-soft);
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 15.5px;
  color: var(--accent);
}

.back-btn {
  padding: 10px 22px;
  border-radius: var(--radius-pill);
  background: #14152b;
  color: #fff;
  font-size: 16.5px;
  font-weight: 600;
  transition: background 0.15s ease;
}

.back-btn:hover {
  background: var(--accent);
}
</style>
