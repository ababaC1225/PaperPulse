<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FileText, Hash, LoaderCircle, RotateCw, Search, UserRound, X } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { paperApi } from '@/services/paperApi'

const router = useRouter()
const root = ref(null)
const input = ref(null)
const query = ref('')
const results = ref({ papers: [], topics: [], authors: [] })
const loading = ref(false)
const error = ref('')
const open = ref(false)
const focused = ref(false)
const activeIndex = ref(-1)
const hasSearched = ref(false)
let debounceTimer = null
let requestSequence = 0

const trimmedQuery = computed(() => query.value.trim())
const groups = computed(() => [
  {
    key: 'papers',
    label: 'Papers',
    icon: FileText,
    items: results.value.papers.map((paper) => ({
      key: `paper-${paper.paper_id}`,
      label: paper.title,
      meta: [paper.conference, paper.year, paper.authors?.[0]].filter(Boolean).join(' · '),
      to: `/papers/${encodeURIComponent(paper.paper_id)}`
    }))
  },
  {
    key: 'topics',
    label: 'Topics',
    icon: Hash,
    items: results.value.topics.map((topic) => ({
      key: `topic-${topic.topic}`,
      label: topic.topic,
      meta: `${topic.paper_count.toLocaleString()} ${topic.paper_count === 1 ? 'paper' : 'papers'}`,
      to: { path: '/hot-topics', query: { topic: topic.topic } }
    }))
  },
  {
    key: 'authors',
    label: 'Authors',
    icon: UserRound,
    items: results.value.authors.map((author) => ({
      key: `author-${author.author}`,
      label: author.author,
      meta: `${author.paper_count.toLocaleString()} ${author.paper_count === 1 ? 'paper' : 'papers'}`,
      to: { path: '/papers', query: { author: author.author } }
    }))
  }
].filter((group) => group.items.length))

const options = computed(() => groups.value.flatMap((group) => group.items.map((item) => ({ ...item, group: group.key }))))
const activeOptionId = computed(() => activeIndex.value >= 0 ? `global-search-option-${activeIndex.value}` : undefined)
const hasResults = computed(() => options.value.length > 0)

function highlightedParts(value) {
  const text = String(value || '')
  const needle = trimmedQuery.value.toLocaleLowerCase('en-US')
  const index = text.toLocaleLowerCase('en-US').indexOf(needle)
  if (!needle || index < 0) return [{ text, match: false }]
  return [
    { text: text.slice(0, index), match: false },
    { text: text.slice(index, index + needle.length), match: true },
    { text: text.slice(index + needle.length), match: false }
  ].filter((part) => part.text)
}

function resetResults() {
  results.value = { papers: [], topics: [], authors: [] }
  activeIndex.value = -1
  hasSearched.value = false
}

async function searchNow(requestId = ++requestSequence) {
  const requestedQuery = trimmedQuery.value
  if (requestedQuery.length < 2) return
  loading.value = true
  error.value = ''
  open.value = focused.value
  try {
    const response = await paperApi.globalSearch(requestedQuery, 5)
    if (requestId !== requestSequence || requestedQuery !== trimmedQuery.value) return
    results.value = response
    activeIndex.value = -1
    hasSearched.value = true
  } catch (requestError) {
    if (requestId !== requestSequence) return
    error.value = requestError.message || 'Search is temporarily unavailable.'
    resetResults()
    hasSearched.value = true
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

function retry() {
  if (trimmedQuery.value.length < 2) return
  window.clearTimeout(debounceTimer)
  hasSearched.value = false
  searchNow()
}

function clearSearch() {
  query.value = ''
  input.value?.focus()
}

function closePanel() {
  open.value = false
  activeIndex.value = -1
}

async function selectOption(option) {
  if (!option) return
  closePanel()
  query.value = ''
  await router.push(option.to)
}

function optionIndex(key) {
  return options.value.findIndex((option) => option.key === key)
}

function moveActive(step) {
  if (!hasResults.value) return
  open.value = true
  activeIndex.value = activeIndex.value < 0
    ? step > 0 ? 0 : options.value.length - 1
    : (activeIndex.value + step + options.value.length) % options.value.length
  nextTick(() => document.getElementById(activeOptionId.value)?.scrollIntoView({ block: 'nearest' }))
}

function handleKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
  } else if (event.key === 'Enter' && open.value && activeIndex.value >= 0) {
    event.preventDefault()
    selectOption(options.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePanel()
  }
}

function handleFocus() {
  focused.value = true
  if (trimmedQuery.value.length >= 2) open.value = true
}

function handleBlur() {
  focused.value = false
}

function handleOutsidePointer(event) {
  if (!root.value?.contains(event.target)) closePanel()
}

watch(query, () => {
  requestSequence += 1
  window.clearTimeout(debounceTimer)
  error.value = ''
  activeIndex.value = -1
  if (trimmedQuery.value.length < 2) {
    loading.value = false
    open.value = false
    resetResults()
    return
  }
  loading.value = true
  open.value = focused.value
  hasSearched.value = false
  const requestId = requestSequence
  debounceTimer = window.setTimeout(() => searchNow(requestId), 300)
})

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointer))
onBeforeUnmount(() => {
  requestSequence += 1
  window.clearTimeout(debounceTimer)
  document.removeEventListener('pointerdown', handleOutsidePointer)
})
</script>

<template>
  <div ref="root" class="global-search">
    <label class="sr-only" for="global-search-input">Search papers, topics, authors, and keywords</label>
    <div class="search" :class="{ expanded: open }">
      <Search :size="18" class="search-icon" aria-hidden="true" />
      <input
        id="global-search-input"
        ref="input"
        v-model="query"
        type="search"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        aria-controls="global-search-results"
        :aria-expanded="open"
        :aria-activedescendant="activeOptionId"
        placeholder="Search papers, topics, authors, or keywords..."
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
      />
      <LoaderCircle v-if="loading" :size="17" class="search-spinner" aria-label="Searching" />
      <button v-else-if="query" class="search-clear" type="button" aria-label="Clear global search" @click="clearSearch">
        <X :size="17" />
      </button>
    </div>

    <section v-if="open && trimmedQuery.length >= 2" id="global-search-results" class="search-results" role="listbox" aria-label="Global search results">
      <div v-if="loading && !hasSearched" class="search-state" role="status">
        <LoaderCircle :size="18" class="search-spinner" />
        <span>Searching PaperPulse…</span>
      </div>
      <div v-else-if="error" class="search-state search-error" role="alert">
        <span>{{ error }}</span>
        <button type="button" @mousedown.prevent @click="retry"><RotateCw :size="15" /> Retry</button>
      </div>
      <div v-else-if="hasSearched && !hasResults" class="search-state" role="status">
        No results for “{{ trimmedQuery }}”.
      </div>
      <template v-else>
        <div v-for="group in groups" :key="group.key" class="result-group" role="group" :aria-label="group.label">
          <p class="result-heading"><component :is="group.icon" :size="14" />{{ group.label }}</p>
          <button
            v-for="item in group.items"
            :id="`global-search-option-${optionIndex(item.key)}`"
            :key="item.key"
            class="result-option"
            :class="{ active: optionIndex(item.key) === activeIndex }"
            type="button"
            role="option"
            :aria-selected="optionIndex(item.key) === activeIndex"
            @mouseenter="activeIndex = optionIndex(item.key)"
            @mousedown.prevent
            @click="selectOption(item)"
          >
            <span class="result-copy">
              <strong><template v-for="(part, index) in highlightedParts(item.label)" :key="index"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></strong>
              <small v-if="item.meta">{{ item.meta }}</small>
            </span>
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.global-search { position:relative; z-index:100; width:420px; max-width:100%; }
.global-search .search { width:100%; }
.global-search .search.expanded { border-color:var(--accent); box-shadow:0 0 0 3px rgba(108,92,231,.1), var(--shadow-card); }
.search-clear { display:grid; flex:0 0 auto; place-items:center; width:28px; height:28px; border-radius:7px; color:var(--text-muted); }
.search-clear:hover { color:var(--text-primary); background:var(--bg-soft); }
.search-spinner { flex:0 0 auto; color:var(--accent); animation:search-spin .8s linear infinite; }
.search-results { position:absolute; top:calc(100% + 8px); left:0; z-index:110; width:100%; max-height:min(560px,calc(100vh - 100px)); overflow-y:auto; padding:8px; border:1px solid var(--border); border-radius:14px; background:#fff; box-shadow:0 18px 50px rgba(20,21,43,.16); }
.search-state { display:flex; min-height:64px; align-items:center; justify-content:center; gap:9px; padding:14px; color:var(--text-secondary); font-size:14px; text-align:center; }
.search-error { flex-wrap:wrap; color:#a83d57; }
.search-error button { display:inline-flex; align-items:center; gap:5px; color:inherit; font-weight:700; }
.result-group + .result-group { margin-top:6px; padding-top:6px; border-top:1px solid var(--border); }
.result-heading { display:flex; align-items:center; gap:7px; margin:0; padding:7px 10px 5px; color:var(--text-muted); font-size:12px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
.result-option { display:flex; width:100%; align-items:center; padding:9px 10px; border-radius:9px; color:var(--text-primary); text-align:left; }
.result-option:hover, .result-option.active { background:var(--accent-soft); }
.result-copy { display:flex; min-width:0; flex:1; align-items:baseline; justify-content:space-between; gap:18px; }
.result-copy strong { min-width:0; overflow:hidden; font-size:14px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.result-copy small { flex:0 0 auto; max-width:48%; overflow:hidden; color:var(--text-secondary); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.result-copy mark { color:var(--accent); background:transparent; font-weight:800; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@keyframes search-spin { to { transform:rotate(360deg); } }
@media (max-width:720px) {
  .global-search { width:100%; }
  .result-copy { align-items:flex-start; flex-direction:column; gap:2px; }
  .result-copy small { max-width:100%; }
}
</style>
