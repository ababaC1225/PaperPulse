import path from 'node:path'
import { loadConfig } from './config.js'
import { initializeDatabase } from './persistence/database.js'

const config = loadConfig()
const result = initializeDatabase(config.databasePath)

console.log('PaperPulse database initialized successfully.')
console.log(`Database: ${path.resolve(result.databasePath)}`)
console.log(`Schema version: ${result.schemaVersion}`)
console.log(`Tables: ${result.tables.join(', ')}`)
console.log(`Applied migrations: ${result.appliedMigrations.length}`)
