<script setup>
import AppSidebar from '@/components/AppSidebar.vue'
</script>

<template>
  <div class="app-shell">
    <AppSidebar />
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>
