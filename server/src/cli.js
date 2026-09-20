import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext } from './context.js'
import { cleanPaperRecord } from './domain/cleaning.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function resolveInputPath(value) {
  const fromWorkingDirectory = path.resolve(value)
  if (fs.existsSync(fromWorkingDirectory)) return fromWorkingDirectory
  return path.resolve(projectRoot, value)
}

function usage() {
  return `PaperPulse CLI

Commands:
  search <title>                 Search sources without saving
  import <file.csv|file.txt>     Start an import and wait for its summary
  clean <json-or-file.json>      Normalize one paper record
  summary <job-id>               Display a stored import summary`
}

function parseRecord(value) {
  const input = resolveInputPath(value)
  const raw = fs.existsSync(input) ? fs.readFileSync(input, 'utf8') : value
  try { return JSON.parse(raw) } catch { throw new Error('clean expects a JSON object or the path to a JSON file') }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || ['help', '--help', '-h'].includes(command)) {
    console.log(usage())
    return
  }

  const context = createContext()
  try {
    if (command === 'search') {
      const title = args.join(' ')
      console.log(JSON.stringify(await context.searchService.search(title), null, 2))
      return
    }
    if (command === 'import') {
      if (!args[0]) throw new Error('import requires a CSV or TXT file path')
      const filePath = resolveInputPath(args[0])
      const extension = path.extname(filePath).slice(1).toLowerCase()
      if (!['csv', 'txt'].includes(extension)) throw new Error('import file extension must be .csv or .txt')
      const content = fs.readFileSync(filePath, 'utf8')
      const job = context.importService.create({ content, format: extension, file_name: path.basename(filePath) })
      console.log(`Import ${job.job_id} started (${job.counts.total} titles)`)
      const completed = await context.importService.wait(job.job_id)
      console.log(JSON.stringify(completed, null, 2))
      return
    }
    if (command === 'clean') {
      if (!args[0]) throw new Error('clean requires a JSON object or file path')
      const record = cleanPaperRecord(parseRecord(args.join(' ')), {
        generalStopwords: context.config.generalStopwords,
        cvStopwords: context.config.cvStopwords,
        synonyms: context.config.synonyms
      })
      console.log(JSON.stringify(record, null, 2))
      return
    }
    if (command === 'summary') {
      if (!args[0]) throw new Error('summary requires an import job ID')
      console.log(JSON.stringify(context.importService.get(args[0]), null, 2))
      return
    }
    throw new Error(`Unknown command: ${command}\n\n${usage()}`)
  } finally {
    context.close()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
