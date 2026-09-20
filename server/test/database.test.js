import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initializeDatabase, openDatabase } from '../src/persistence/database.js'

const expectedTables = [
  'import_items',
  'import_jobs',
  'papers',
  'response_cache',
  'schema_migrations',
  'search_candidates'
]

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'paperpulse-db-'))
  return {
    databasePath: path.join(directory, 'paperpulse.db'),
    remove() { fs.rmSync(directory, { recursive: true, force: true }) }
  }
}

test('database initialization creates all required tables and records the migration', () => {
  const temporary = temporaryDatabase()
  try {
    const result = initializeDatabase(temporary.databasePath)
    assert.deepEqual(result.tables, expectedTables)
    assert.equal(result.schemaVersion, 1)
    assert.equal(result.appliedMigrations.length, 1)
    assert.equal(result.appliedMigrations[0].name, 'initial_schema')
  } finally {
    temporary.remove()
  }
})

test('database initialization is idempotent and preserves existing rows', () => {
  const temporary = temporaryDatabase()
  try {
    const database = openDatabase(temporary.databasePath)
    database.prepare(`
      INSERT INTO papers (
        paper_id, title, normalized_title, conference, year, source_name,
        data_status, retrieved_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'PP-INITIALIZED',
      'Initialized Paper',
      'initialized paper',
      'CVPR',
      2025,
      'fixture',
      'complete',
      '2025-01-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z'
    )
    database.close()

    const secondResult = initializeDatabase(temporary.databasePath)
    assert.equal(secondResult.appliedMigrations.length, 1)

    const reopened = openDatabase(temporary.databasePath)
    try {
      assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM papers').get().count, 1)
      assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1)
    } finally {
      reopened.close()
    }
  } finally {
    temporary.remove()
  }
})

test('paper table defines required metadata and data-quality fields', () => {
  const database = openDatabase(':memory:')
  try {
    const columns = new Set(database.prepare('PRAGMA table_info(papers)').all().map((row) => row.name))
    const required = [
      'paper_id',
      'title',
      'normalized_title',
      'conference',
      'year',
      'abstract',
      'keywords_json',
      'original_url',
      'source_name',
      'source_record_id',
      'doi',
      'authors_json',
      'data_status',
      'missing_fields_json',
      'retrieval_error',
      'retrieved_at',
      'created_at',
      'updated_at'
    ]
    for (const field of required) assert.ok(columns.has(field), `missing papers.${field}`)
    assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
  } finally {
    database.close()
  }
})

test('database constraints reject invalid conferences and duplicate paper identities', () => {
  const database = openDatabase(':memory:')
  const insert = database.prepare(`
    INSERT INTO papers (
      paper_id, title, normalized_title, conference, year, source_name,
      data_status, retrieved_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const timestamps = ['2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z']
  try {
    assert.throws(
      () => insert.run('PP-INVALID', 'Invalid', 'invalid', 'NEURIPS', 2025, 'fixture', 'complete', ...timestamps),
      /CHECK constraint failed/
    )
    insert.run('PP-ONE', 'Same Paper', 'same paper', 'ICCV', 2025, 'fixture', 'complete', ...timestamps)
    assert.throws(
      () => insert.run('PP-TWO', 'Same  Paper', 'same paper', 'ICCV', 2025, 'fixture-2', 'complete', ...timestamps),
      /UNIQUE constraint failed/
    )
  } finally {
    database.close()
  }
})
