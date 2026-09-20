// Placeholder data layer - swap with real DB queries when the data pipeline lands.
export function getOverviewStats(req, res) {
  res.json({
    papers: { value: 4892, delta: '+12% vs 2024' },
    topics: { value: 186, delta: '+8% vs 2024' },
    conferences: { value: 12, delta: '+0% vs last year' },
    lastSync: { value: '2 hours ago', status: 'up-to-date' }
  })
}
