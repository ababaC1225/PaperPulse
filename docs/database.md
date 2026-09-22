# Database design and initialization

PaperPulse uses the SQLite implementation built into Node.js 22.5 or newer. The
database is local by default and does not require a separate database service.
Set `PAPERPULSE_DB_PATH` when a different persistent location is needed.

## Initialize the database

From the repository root:

```powershell
npm run db:init
```

The command creates `server/data/paperpulse.db`, enables foreign-key checks and
WAL mode, runs pending migrations, and reports the resulting schema version and
table list. It is safe to run repeatedly. Existing records are preserved and
already-applied migrations are not rerun.

To choose another location:

```powershell
$env:PAPERPULSE_DB_PATH = "E:\data\paperpulse.db"
npm run db:init
```

Local `.db`, `.db-shm`, and `.db-wal` files are excluded from Git.

## Tables

| Table | Purpose |
| --- | --- |
| `papers` | Cleaned paper metadata, source provenance, missing fields, and data-quality state |
| `search_candidates` | Short-lived external-search results awaiting user confirmation |
| `import_jobs` | Status and timestamps for CSV, TXT, or pasted-title imports |
| `import_items` | Per-row input, paper link, outcome, failure reason, and retry eligibility |
| `response_cache` | Expiring HTTP responses used to reduce requests to public sources |
| `schema_migrations` | Applied schema versions and timestamps |

## Paper fields

The `papers` table stores the assignment's required fields: local paper ID,
title, conference, year, abstract, keywords, original link, and source. It also
stores the normalized title used for matching; author, DOI, canonical URL, and
source record identifiers; explicit missing-field and retrieval-error data; and
retrieval/creation/update timestamps.

Migration 2 adds `keyword_provenance_json`. The API exposes this as
`keyword_provenance`, recording `provided`, `manual`, `unavailable`, or
`textrank-v1`, with input fields and scored phrases for extracted keywords.
Historical records default to `provided`; the backfill command upgrades records
with no usable keywords without replacing existing supplied keywords.

Arrays and source payloads are encoded as JSON text because SQLite has no native
array type. Application code converts `keywords_json`, `authors_json`, and
`missing_fields_json` back to arrays when reading a record.

## Integrity rules and indexes

- Duplicate paper identities are rejected by the unique normalized-title,
  conference, and year index.
- DOI, canonical source URL, and source-name/source-record-ID pairs are unique
  when present.
- Conference values are limited to CVPR, ICCV, and ECCV; temporarily unknown
  values may remain `NULL` and are reflected in the paper's missing-field state.
- Year values must be between 1980 and 2100 when present.
- Import items are deleted with their parent job; deleting a paper retains the
  import audit row and clears its paper reference.
- Conference/year, data-status, import-status, and cache-expiry indexes support
  common filtering and cleanup operations.

## Adding a migration

Add the next numbered SQL file under `server/src/persistence/schema`, then add
its version, name, and file path to the migration list in
`server/src/persistence/database.js`. Never edit an already-deployed migration;
use a new migration for changes so local and deployed databases advance through
the same history.
