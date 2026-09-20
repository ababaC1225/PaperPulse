const SECRET_KEYS = new Set(['authorization', 'cookie', 'set-cookie', 'password', 'token', 'api_key', 'apikey', 'secret'])

function sanitize(value, depth = 0) {
  if (depth > 6) return '[truncated]'
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, depth + 1))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SECRET_KEYS.has(key.toLowerCase()) ? '[redacted]' : sanitize(entry, depth + 1)
  ]))
}

export class Logger {
  constructor(context = {}, sink = console) {
    this.context = context
    this.sink = sink
  }

  child(context) {
    return new Logger({ ...this.context, ...context }, this.sink)
  }

  write(level, event, fields = {}) {
    const payload = sanitize({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...this.context,
      ...fields
    })
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    this.sink[method](JSON.stringify(payload))
  }

  info(event, fields) { this.write('info', event, fields) }
  warn(event, fields) { this.write('warn', event, fields) }
  error(event, fields) { this.write('error', event, fields) }
}

export const logger = new Logger({ service: 'paperpulse-server' })
