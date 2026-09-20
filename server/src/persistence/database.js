import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    file: path.join(currentDirectory, 'schema', '001_initial.sql')
  }
]

function configureDatabase(database, databasePath) {
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA busy_timeout = 10000;')
  if (databasePath !== ':memory:') database.exec('PRAGMA journal_mode = WAL;')
}

function ensureMigrationTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `)
}

export function runMigrations(database) {
  ensureMigrationTable(database)
  const appliedVersions = new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version)
  )
  const insertMigration = database.prepare(`
    INSERT INTO schema_migrations(version, name, applied_at)
    VALUES (?, ?, ?)
  `)
  const newlyApplied = []

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue
    const sql = fs.readFileSync(migration.file, 'utf8')
    database.exec('BEGIN IMMEDIATE;')
    try {
      database.exec(sql)
      insertMigration.run(migration.version, migration.name, new Date().toISOString())
      database.exec('COMMIT;')
      newlyApplied.push(migration.version)
    } catch (error) {
      database.exec('ROLLBACK;')
      throw new Error(`Database migration ${migration.version} (${migration.name}) failed`, { cause: error })
    }
  }

  return newlyApplied
}

export function openDatabase(databasePath = ':memory:') {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true })
  }
  const database = new DatabaseSync(databasePath)
  try {
    configureDatabase(database, databasePath)
    runMigrations(database)
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

export function inspectDatabase(database) {
  const tables = database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name)
  const appliedMigrations = database.prepare(`
    SELECT version, name, applied_at
    FROM schema_migrations
    ORDER BY version
  `).all()
  const userVersion = appliedMigrations.at(-1)?.version ?? 0
  return { tables, appliedMigrations, schemaVersion: userVersion }
}

export function initializeDatabase(databasePath) {
  const database = openDatabase(databasePath)
  try {
    return { databasePath, ...inspectDatabase(database) }
  } finally {
    database.close()
  }
}
