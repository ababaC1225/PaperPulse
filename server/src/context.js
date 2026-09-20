import { loadConfig } from './config.js'
import { logger as defaultLogger } from './lib/logger.js'
import { PaperRepository } from './persistence/paperRepository.js'
import { ReliableHttpClient } from './http/reliableHttpClient.js'
import { CvfAdapter } from './sources/cvfAdapter.js'
import { EcvaAdapter } from './sources/ecvaAdapter.js'
import { DblpAdapter } from './sources/dblpAdapter.js'
import { SearchService } from './services/searchService.js'
import { ImportService } from './services/importService.js'

export function createContext(options = {}) {
  const config = options.config || loadConfig()
  const logger = options.logger || defaultLogger
  const repository = options.repository || new PaperRepository(config.databasePath)
  const httpClient = options.httpClient || new ReliableHttpClient({
    config,
    repository,
    logger: logger.child({ component: 'http-client' }),
    fetchImpl: options.fetchImpl || globalThis.fetch
  })
  const available = {
    cvf: () => new CvfAdapter({ httpClient, logger, years: config.sourceYears }),
    ecva: () => new EcvaAdapter({ httpClient, logger }),
    dblp: () => new DblpAdapter({ httpClient, logger })
  }
  const adapters = options.adapters || config.enabledSources.filter((name) => available[name]).map((name) => available[name]())
  const searchService = options.searchService || new SearchService({ adapters, repository, config, logger })
  const importService = options.importService || new ImportService({ repository, searchService, config, logger })
  return {
    config,
    logger,
    repository,
    httpClient,
    adapters,
    searchService,
    importService,
    close() { repository.close() }
  }
}
