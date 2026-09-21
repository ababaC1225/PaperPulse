# PaperPulse

PaperPulse is a Vue 3 + Express research-trend dashboard with a local SQLite pipeline for acquiring and cleaning public CVPR, ICCV, and ECCV paper metadata.

## Setup

Node.js 22.5 or newer is required for the built-in SQLite API.

```powershell
npm run setup
npm run db:init      # create/upgrade server/data/paperpulse.db
npm run dev:server   # API at http://localhost:3000
npm run dev          # UI at http://localhost:5173
```

The Vite server proxies `/api` to the Express server. Paper data is stored in `server/data/paperpulse.db` by default. Configure source access and processing with the variables documented in [`server/.env.example`](server/.env.example).

## Implemented workflows

- Search a full or partial paper title across CVF Open Access, ECVA, and DBLP.
- Review ranked, merged candidates and save only after confirmation.
- Import CSV/TXT files or pasted titles with observable per-row progress and retryable failures.
- Deterministically clean metadata without fabricating abstracts or keywords.
- Prevent duplicates by normalized title/conference/year, DOI, source ID, and canonical URL.
- Browse stored records and view source, quality state, missing fields, and analysis eligibility.
- Manually create, edit, and delete library papers with validation and duplicate-conflict protection.
- Search, filter, sort, and paginate the Paper Library through server-side SQLite queries.
- View database-backed Overview metrics and recent papers scoped by conference and publication year.

Frontend routes include `/`, `/hot-topics`, `/keyword-map`, `/trend-analysis`, `/papers`, `/papers/:id`, `/import`, `/about`, and `/states-errors`.

## Validation

```powershell
npm test             # offline backend/unit/API fixture suite
npm run build        # production Vue build
npm run cli -- --help
```

The tests do not contact live websites. Example import files are in [`examples`](examples), and the CLI supports `search`, `import`, `clean`, and `summary` commands.

For database tables, fields, constraints, and migration instructions, see [`docs/database.md`](docs/database.md).
For API examples, architecture, data-source citation details, cleaning and exclusion rules, safeguards, configuration, limitations, and adapter extension instructions, see [`docs/data-pipeline.md`](docs/data-pipeline.md).
