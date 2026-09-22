import crypto from 'node:crypto'
import { cleanPaperRecord } from './domain/cleaning.js'
import { parseCvfIndex } from './sources/cvfAdapter.js'
import { parseEcvaIndex } from './sources/ecvaAdapter.js'

export const DEMO_COHORTS = [['CVPR', 2023], ['CVPR', 2024], ['ICCV', 2021], ['ICCV', 2023], ['ECCV', 2022], ['ECCV', 2024]]

export function selectSample(records, count) {
  // Stable hash sampling avoids taking only the first alphabetical/session entries.
  return [...new Map(records.filter((r) => r.original_url).map((r) => [r.original_url, r])).values()]
    .sort((a, b) => crypto.createHash('sha256').update(a.original_url).digest('hex')
      .localeCompare(crypto.createHash('sha256').update(b.original_url).digest('hex'))).slice(0, count)
}

export async function importDemoDataset(context, count = 20) {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Sample size must be an integer from 1 to 100 per conference/year')
  const report = { generated_at: new Date().toISOString(), sampling: 'SHA-256 URL order, first N per conference/year; demonstration sample, not full proceedings', requested_per_cohort: count, cohorts: [], errors: [] }
  let ecvaRecords
  for (const [conference, year] of DEMO_COHORTS) {
    const cohort = { conference, year, available: 0, selected: 0, inserted: 0, duplicates: 0, eligible: 0, failed: 0, paper_ids: [] }
    report.cohorts.push(cohort)
    try {
      let records
      if (conference === 'ECCV') {
        if (!ecvaRecords) ecvaRecords = parseEcvaIndex((await context.httpClient.get('https://www.ecva.net/papers.php', { source: 'ecva' })).body)
        records = ecvaRecords.filter((r) => r.year === year)
      } else {
        const baseUrl = `https://openaccess.thecvf.com/${conference}${year}?day=all`
        records = parseCvfIndex((await context.httpClient.get(baseUrl, { source: 'cvf' })).body, { conference, year, baseUrl })
      }
      cohort.available = records.length
      if (!records.length) throw new Error('No records parsed for this conference/year')
      const selected = selectSample(records, count)
      cohort.selected = selected.length
      for (const candidate of selected) {
        try {
          const existing = context.repository.findDuplicate(cleanPaperRecord(candidate, context.config))
          if (existing?.eligible) {
            cohort.duplicates++; cohort.eligible++; cohort.paper_ids.push(existing.paper_id)
            continue
          }
          const adapter = context.adapters.find((a) => a.name === candidate.source_name)
          const details = await adapter.fetchDetails(candidate)
          const record = cleanPaperRecord(details, context.config)
          const saved = context.repository.savePaper(record)
          cohort[saved.outcome === 'duplicate' ? 'duplicates' : 'inserted']++
          if (saved.paper.eligible) cohort.eligible++
          cohort.paper_ids.push(saved.paper.paper_id)
        } catch (error) {
          cohort.failed++
          report.errors.push({ conference, year, url: candidate.original_url, error: error.message })
        }
      }
    } catch (error) {
      report.errors.push({ conference, year, error: error.message })
    }
    console.log(JSON.stringify(cohort))
  }
  return report
}
