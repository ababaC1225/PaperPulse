<script setup>
import {
  Home,
  Flame,
  Network,
  BarChart3,
  Library,
  CloudUpload,
  Sparkles,
  ArrowRight
} from 'lucide-vue-next'

const navItems = [
  { to: '/', label: 'Overview', icon: Home, exact: true },
  { to: '/hot-topics', label: 'Hot Topics', icon: Flame },
  { to: '/keyword-map', label: 'Keyword Map', icon: Network },
  { to: '/trend-analysis', label: 'Trend Analysis', icon: BarChart3 },
  { to: '/papers', label: 'Paper Library', icon: Library },
  { to: '/import', label: 'Import Papers', icon: CloudUpload }
]
</script>

<template>
  <aside class="sidebar">
    <router-link to="/" class="logo">
      <span class="logo-mark">
        <span class="logo-mark-a"></span>
        <span class="logo-mark-b"></span>
      </span>
      <span class="logo-text">PaperPulse</span>
    </router-link>

    <nav class="nav">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: item.exact ? $route.path === item.to : $route.path.startsWith(item.to) }"
      >
        <component :is="item.icon" class="nav-icon" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>

    <div class="promo">
      <div class="promo-icon">
        <Sparkles :size="22" />
      </div>
      <p class="promo-text">Discover<br />what's next<br />in computer vision.</p>
      <router-link to="/papers" class="promo-btn">
        Explore papers
        <ArrowRight :size="15" />
      </router-link>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 250px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px 18px 20px;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 16px;
  height: calc(100vh - 32px);
}

.logo {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 10px;
  margin-bottom: 30px;
}

.logo-mark {
  position: relative;
  width: 34px;
  height: 34px;
}

.logo-mark-a {
  position: absolute;
  left: 0;
  top: 0;
  width: 24px;
  height: 24px;
  border-radius: 8px 8px 8px 2px;
  background: linear-gradient(135deg, #7ee8c7, #34c98e);
}

.logo-mark-b {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 24px;
  height: 24px;
  border-radius: 8px 8px 8px 2px;
  background: linear-gradient(135deg, #a99bff, #6c5ce7);
  opacity: 0.9;
}

.logo-text {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 800;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 15px;
  border-radius: 11px;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: background 0.15s ease, color 0.15s ease;
}

.nav-item:hover {
  background: var(--bg-soft);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-soft);
  color: var(--text-primary);
  font-weight: 600;
}

.nav-icon {
  width: 21px;
  height: 21px;
  stroke-width: 1.8;
}

.promo {
  margin-top: auto;
  background: linear-gradient(160deg, #f0fdf7, #e6faf1);
  border-radius: 16px;
  padding: 14px 16px 14px;
}

.promo-icon {
  color: var(--green);
  margin-bottom: 8px;
}

.promo-text {
  margin: 0 0 16px;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-primary);
}

.promo-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 100%;
  padding: 9px 0;
  background: #14152b;
  color: #fff;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s ease, gap 0.15s ease;
}

.promo-btn:hover {
  background: var(--accent);
  gap: 13px;
}
</style>
