import { createApp } from './app.js'
import { createContext } from './context.js'

const context = createContext()
const app = createApp(context)
const server = app.listen(context.config.port, () => {
  context.logger.info('server_started', { port: context.config.port, sources: context.adapters.map((adapter) => adapter.name) })
})

function shutdown(signal) {
  context.logger.info('server_stopping', { signal })
  server.close(async () => {
    await context.importService.drain()
    context.close()
    process.exit(0)
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
