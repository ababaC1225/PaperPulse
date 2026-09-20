<script setup>
import { Calendar, Layers, ChevronDown } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
import StatCard from '@/components/StatCard.vue'
import HotTopicsCard from '@/components/HotTopicsCard.vue'
import KeywordNetwork from '@/components/KeywordNetwork.vue'
import RecentPapersCard from '@/components/RecentPapersCard.vue'
import { stats } from '@/data/mock'
</script>

<template>
  <div class="overview">
    <TopBar />

    <div class="page-head">
      <div>
        <h1>Good morning!</h1>
        <p class="subtitle">Explore the latest research trends in computer vision.</p>
      </div>
      <div class="page-filters">
        <button class="select-btn">
          <Calendar />
          2025 CVPR
          <ChevronDown class="chevron" />
        </button>
        <button class="select-btn">
          <Layers />
          All Topics
          <ChevronDown class="chevron" />
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <StatCard v-for="stat in stats" :key="stat.key" :stat="stat" />
    </div>

    <div class="mid-grid">
      <HotTopicsCard />
      <KeywordNetwork />
    </div>

    <RecentPapersCard />
  </div>
</template>

<style scoped>
.overview {
  max-width: 100%;
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 7px;
}

h1 {
  font-size: 32px;
  font-weight: 800;
}

.subtitle {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 16px;
}

.page-filters {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}


.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.mid-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  height: 421px;
  margin-bottom: 24px;
}

.mid-grid > .card {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .mid-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
