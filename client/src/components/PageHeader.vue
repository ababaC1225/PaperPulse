<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, required: true }
})
</script>

<template>
  <div class="page-header">
    <div>
      <h1>{{ title }}</h1>
      <p class="page-subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" class="page-header-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

h1 {
  font-size: 37px;
  font-weight: 800;
}

.page-subtitle {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 18.5px;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
</style>
