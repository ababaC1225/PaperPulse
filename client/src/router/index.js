import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'overview',
    component: () => import('@/views/OverviewView.vue'),
    meta: { title: 'Overview' }
  },
  {
    path: '/hot-topics',
    name: 'hot-topics',
    component: () => import('@/views/HotTopicsView.vue'),
    meta: { title: 'Hot Topics' }
  },
  {
    path: '/keyword-map',
    name: 'keyword-map',
    component: () => import('@/views/KeywordMapView.vue'),
    meta: { title: 'Keyword Map', icon: 'network' }
  },
  {
    path: '/trend-analysis',
    name: 'trend-analysis',
    component: () => import('@/views/TrendAnalysisView.vue'),
    meta: { title: 'Trend Analysis', icon: 'chart' }
  },
  {
    path: '/papers',
    name: 'paper-library',
    component: () => import('@/views/PaperLibraryView.vue'),
    meta: { title: 'Paper Library', icon: 'library' }
  },
  {
    path: '/papers/:id',
    name: 'paper-detail',
    component: () => import('@/views/PaperDetailView.vue'),
    meta: { title: 'Paper Detail', icon: 'library' }
  },
  {
    path: '/import',
    name: 'import-papers',
    component: () => import('@/views/ImportPapersView.vue'),
    meta: { title: 'Import Papers', icon: 'import' }
  },
  {
    path: '/about',
    name: 'about-data-notes',
    component: () => import('@/views/AboutDataNotesView.vue'),
    meta: { title: 'About & Data Notes' }
  },
  {
    path: '/states-errors',
    name: 'states-errors',
    component: () => import('@/views/StatesErrorsView.vue'),
    meta: { title: 'States & Errors' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} - PaperPulse`
    : 'PaperPulse'
})

export default router
