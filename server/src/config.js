import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(serverRoot, '..')

const DEFAULT_GENERAL_STOPWORDS = [
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with'
]

const DEFAULT_CV_STOPWORDS = [
  'approach', 'experiment', 'experiments', 'method', 'methods', 'model', 'models', 'paper', 'result', 'results', 'study', 'system'
]

function integer(env, key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(env[key] ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function boolean(env, key, fallback) {
  const value = env[key]
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function list(value, fallback = []) {
  if (!value) return [...fallback]
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean)
}

function jsonObject(value, fallback = {}) {
  if (!value) return { ...fallback }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { ...fallback }
  } catch {
    return { ...fallback }
  }
}

export function loadConfig(env = process.env) {
  const currentYear = new Date().getUTCFullYear()
  const sourceYears = list(env.PAPERPULSE_SOURCE_YEARS, ['2021', '2022', '2023', '2024', '2025'])
    .map((year) => Number.parseInt(year, 10))
    .filter((year) => Number.isInteger(year) && year >= 1950 && year <= currentYear + 1)

  return {
    port: integer(env, 'PORT', 3000, { min: 1, max: 65535 }),
    databasePath: env.PAPERPULSE_DB_PATH || path.join(serverRoot, 'data', 'paperpulse.db'),
    serveClient: boolean(env, 'PAPERPULSE_SERVE_CLIENT', env.NODE_ENV === 'production'),
    clientDistPath: path.resolve(env.PAPERPULSE_CLIENT_DIST || path.join(projectRoot, 'client', 'dist')),
    userAgent: env.PAPERPULSE_USER_AGENT || 'PaperPulseCourseProject/1.0 (+https://github.com/paperpulse; educational metadata client)',
    requestTimeoutMs: integer(env, 'PAPERPULSE_HTTP_TIMEOUT_MS', 12_000, { min: 1_000, max: 120_000 }),
    requestConcurrency: integer(env, 'PAPERPULSE_HTTP_CONCURRENCY', 3, { min: 1, max: 10 }),
    requestIntervalMs: integer(env, 'PAPERPULSE_HTTP_INTERVAL_MS', 1_500, { min: 0, max: 60_000 }),
    retryLimit: integer(env, 'PAPERPULSE_HTTP_RETRIES', 2, { min: 0, max: 6 }),
    retryBackoffMs: integer(env, 'PAPERPULSE_HTTP_BACKOFF_MS', 400, { min: 10, max: 60_000 }),
    cacheTtlSeconds: integer(env, 'PAPERPULSE_CACHE_TTL_SECONDS', 86_400, { min: 0, max: 2_592_000 }),
    respectRobots: boolean(env, 'PAPERPULSE_RESPECT_ROBOTS', true),
    enabledSources: list(env.PAPERPULSE_ENABLED_SOURCES, ['cvf', 'ecva', 'dblp']).map((source) => source.toLowerCase()),
    sourceYears,
    maxSearchResults: integer(env, 'PAPERPULSE_MAX_SEARCH_RESULTS', 20, { min: 1, max: 100 }),
    candidateTtlSeconds: integer(env, 'PAPERPULSE_CANDIDATE_TTL_SECONDS', 3_600, { min: 60, max: 86_400 }),
    importConcurrency: integer(env, 'PAPERPULSE_IMPORT_CONCURRENCY', 2, { min: 1, max: 8 }),
    maxBatchSize: integer(env, 'PAPERPULSE_MAX_BATCH_SIZE', 500, { min: 1, max: 5_000 }),
    generalStopwords: list(env.PAPERPULSE_GENERAL_STOPWORDS, DEFAULT_GENERAL_STOPWORDS).map((word) => word.toLowerCase()),
    cvStopwords: list(env.PAPERPULSE_CV_STOPWORDS, DEFAULT_CV_STOPWORDS).map((word) => word.toLowerCase()),
    synonyms: jsonObject(env.PAPERPULSE_SYNONYMS, {
      'vlm': 'vision language model',
      'vision-language': 'vision language',
      '3-d': '3d'
    })
  }
}
