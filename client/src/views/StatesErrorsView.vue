<script setup>
import { Check, Search, RotateCcw, Undo2 } from 'lucide-vue-next'
import TopBar from '@/components/TopBar.vue'
</script>

<template>
  <div class="screen-page states-page">
    <TopBar />
    <div class="page-head"><div><h1>States &amp; Errors</h1><p class="subtitle">Reusable feedback patterns for loading, empty, error, and success.</p></div></div>
    <div class="states-grid">
      <section class="state-card loading-state"><h2>Loading</h2><p>Skeleton state while analysis refreshes</p><div class="skeletons"><span></span><span></span><span></span><span></span><span></span></div></section>
      <section class="state-card empty-state"><h2>Empty</h2><p>No papers match the current filters</p><div class="state-icon purple"><Search :size="24" /></div><strong>No results found</strong><button class="dark-btn">Clear filters</button></section>
      <section class="state-card error-state"><h2>Error</h2><p>Data source request failed</p><div class="state-icon pink">!</div><strong>We couldn't load this data.</strong><button class="retry-btn"><RotateCcw :size="15" /> Try again</button></section>
      <section class="state-card success-state"><h2>Success</h2><p>Saved to your paper library</p><div class="state-icon green"><Check :size="24" /></div><strong>Paper added successfully</strong><button class="success-btn">View library</button></section>
    </div>
    <section class="card examples-card">
      <h2>Toast and modal examples</h2>
      <div class="examples-grid">
        <div class="toast-success"><span class="state-icon green"><Check :size="20" /></span><strong>Paper saved to your library</strong><button>Undo</button></div>
        <div class="example-stack">
          <div class="modal-example"><div><strong>Delete paper?</strong><span>This removes it from future analysis.</span></div><button>Delete</button></div>
          <div class="toast-error"><Undo2 :size="16" /><div><strong>Data source unavailable</strong><span>Check your connection and retry.</span></div></div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page-head { margin-bottom:51px; }
h1 { margin:0; font-size:32px; font-weight:800; }
.subtitle { margin:4px 0 0; color:var(--text-secondary); font-size:16px; }
.states-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; }
.state-card { height:280px; min-height:0; padding:24px; border:1px solid var(--border); border-radius:16px; background:#fff; display:flex; flex-direction:column; align-items:flex-start; }
.state-card h2 { margin:0 0 6px; font-family:var(--font-display); font-size:20px; }
.state-card > p { margin:0; color:var(--text-secondary); font-size:14px; }
.loading-state { overflow:hidden; }
.skeletons { display:flex; flex-direction:column; gap:17px; width:100%; margin-top:38px; }
.skeletons span { display:block; height:12px; border-radius:999px; background:#e8ebf2; }
.skeletons span:nth-child(1), .skeletons span:nth-child(4) { width:76%; }
.skeletons span:nth-child(2), .skeletons span:nth-child(5) { width:100%; }
.skeletons span:nth-child(3) { width:62%; }
.empty-state, .error-state, .success-state { align-items:center; text-align:center; }
.error-state { background:#fff0f3; border-color:#ffc4d0; }
.success-state { background:#e8faf2; border-color:#c5efdc; }
.state-card h2, .state-card > p { align-self:stretch; text-align:left; }
.state-icon { display:flex; align-items:center; justify-content:center; width:52px; height:52px; margin:40px auto 24px; border-radius:50%; font-size:24px; font-weight:800; }
.state-icon.purple { border:2px solid #aa8cff; color:#9b7aff; background:#f5f1ff; }
.state-icon.pink { background:#ef6f89; color:#fff; }
.state-icon.green { background:#55d49c; color:#fff; }
.state-card strong { font-size:16px; }
.dark-btn, .retry-btn, .success-btn { margin-top:18px; min-height:42px; padding:0 18px; border-radius:12px; font-size:14px; font-weight:700; }
.dark-btn { background:var(--text-primary); color:#fff; }
.retry-btn { border:1px solid #ef7893; background:#fff; color:#ef7893; }
.success-btn { border:1px solid #c4efdd; background:#fff; color:#2caa80; }
.examples-card { margin-top:44px; padding:24px; min-height:309px; }
.examples-card h2 { margin:0 0 24px; font-family:var(--font-display); font-size:24px; }
.examples-grid { display:grid; grid-template-columns:1fr 1.35fr; gap:24px; align-items:start; }
.example-stack { display:grid; gap:28px; }
.toast-success, .modal-example, .toast-error { min-height:72px; border-radius:14px; display:flex; align-items:center; gap:14px; padding:16px 20px; }
.toast-success { background:#e8faf2; }
.toast-success .state-icon { width:38px; height:38px; margin:0; flex:0 0 auto; }
.toast-success strong { font-size:15px; }
.toast-success button { margin-left:auto; color:#2caa80; font-size:15px; font-weight:700; }
.modal-example { border:1px solid var(--border); justify-content:space-between; }
.modal-example div, .toast-error div { display:flex; flex-direction:column; gap:8px; }
.modal-example strong, .toast-error strong { font-size:15px; }
.modal-example span, .toast-error span { color:var(--text-secondary); font-size:14px; }
.modal-example button { padding:10px 18px; border-radius:11px; background:#ffedf2; color:#ef7893; font-size:14px; font-weight:700; }
.toast-error { border:1px solid var(--border); }
@media (max-width:1150px) { .states-grid { grid-template-columns:repeat(2,1fr); } .examples-grid { grid-template-columns:1fr; } }
@media (max-width:640px) { .states-grid { grid-template-columns:1fr; } .state-card { min-height:300px; } }
</style>
