<script setup>
import { Search } from 'lucide-vue-next'
</script>

<template>
  <label class="search">
    <Search :size="18" class="search-icon" />
    <input type="text" placeholder="Search papers, topics, or keywords..." />
  </label>
</template>
