<script setup>
import SearchBox from './SearchBox.vue'
import { Bell, ChevronDown } from 'lucide-vue-next'
</script>

<template>
  <div class="topbar">
    <SearchBox />

    <div class="topbar-right">
      <button class="icon-btn" title="Notifications">
        <Bell :size="19" />
        <span class="dot"></span>
      </button>
      <button class="workspace-btn">
        <span class="workspace-mark">
          <span class="wm-a"></span>
          <span class="wm-b"></span>
        </span>
        <span>PaperPulse</span>
        <ChevronDown :size="15" class="chevron" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  position: relative;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  box-shadow: var(--shadow-card);
  transition: color 0.15s ease, border-color 0.15s ease;
}

.icon-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.dot {
  position: absolute;
  top: 9px;
  right: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff6b6b;
  border: 2px solid #fff;
}

.workspace-btn {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 15px 9px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  box-shadow: var(--shadow-card);
  transition: border-color 0.15s ease;
}

.workspace-btn:hover {
  border-color: var(--accent);
}

.workspace-mark {
  position: relative;
  width: 28px;
  height: 28px;
}

.wm-a {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 17px;
  height: 17px;
  border-radius: 6px 6px 6px 2px;
  background: linear-gradient(135deg, #7ee8c7, #34c98e);
}

.wm-b {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 17px;
  height: 17px;
  border-radius: 6px 6px 6px 2px;
  background: linear-gradient(135deg, #a99bff, #6c5ce7);
  opacity: 0.9;
}

.chevron {
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .topbar { align-items: stretch; flex-direction: column-reverse; }
  .topbar-right { justify-content: flex-end; }
}
</style>
