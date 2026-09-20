# Paper acquisition and cleaning pipeline

## Architecture

The module follows the existing Express/Vue architecture and keeps responsibilities separate:

- `server/src/sources`: one adapter per public source behind `SourceAdapter`.
- `server/src/http`: respectful HTTP transport, robots rules, rate limits, bounded concurrency, retries, timeouts, and response caching.
- `server/src/domain`: deterministic cleaning, matching, candidate merging, and import-file parsing.
- `server/src/persistence`: SQLite schema, duplicate lookup, candidate TTL storage, import progress, and response cache.
- `server/src/services`: single-search/confirmation and batch orchestration.
- `server/src/routes`: validation-aware HTTP interfaces.
- `client/src/services/paperApi.js`: browser API client used by Import Papers, Paper Library, and Paper Detail.

SQLite is created at `server/data/paperpulse.db` by default. Search candidates are temporary and are not papers: a record enters `papers` only after confirmation, either directly in the UI or by the batch worker.

## Sources and acquisition method

All enabled sources are searched concurrently. Equivalent results are merged, exact normalized-title matches rank before fuzzy matches, and official-source records outrank the DBLP fallback when choosing the record used for detail retrieval.

| Source | Acquisition method | Typical fields |
| --- | --- | --- |
| CVF Open Access | Conference index `https://openaccess.thecvf.com/{CVPR|ICCV}{year}?day=all`, followed by the selected public detail page | title, conference, year, URL, authors, abstract, sometimes DOI |
| ECVA | Public index `https://www.ecva.net/papers.php`, followed by the selected public detail page | title, ECCV, year, URL, abstract, authors, sometimes DOI |
| DBLP | Public publication-search JSON API at `https://dblp.org/search/publ/api` | title, venue, year, authors, DOI, electronic-edition URL, DBLP key |

These URLs and the adapter code are the acquisition record that should be cited in the course blog. Page markup and source coverage can change; parser fixtures capture representative, sanitized responses but do not guarantee future upstream HTML compatibility.

The implementation does not scrape Google Scholar and does not bypass authentication, CAPTCHAs, access controls, or anti-bot systems. The HTTP client checks `robots.txt` by default, uses a descriptive User-Agent, limits request rate and concurrency, caches successful responses, and retries only transient failures (HTTP 429/5xx and transport errors).

## Cleaning and matching rules

Cleaning is deterministic and does not generate content:

1. Decode HTML entities and remove markup, scripts, and styles.
2. Apply Unicode NFKC normalization.
3. Normalize whitespace and common typographic punctuation.
4. Preserve the cleaned display title and separately create a lowercase, punctuation-free `normalized_title`.
5. Canonicalize supported venues to `CVPR`, `ICCV`, or `ECCV`; validate four-digit years against a safe range.
6. Store unavailable abstracts as `null` and unavailable keywords as `[]`.
7. Case-fold, trim, stopword-filter, word-form-normalize, synonym-map, and deduplicate keywords.
8. Canonicalize URLs by removing fragments and common tracking parameters.

Stopwords and synonym mappings are configuration, not hard-coded conclusions. The default lists remove general function words and low-information CV terms such as `paper`, `method`, `model`, and `result`. Override them with the environment variables below.

Candidate scoring combines normalized edit similarity, token overlap, and containment. Exact normalized titles always sort ahead of fuzzy candidates. Equivalent candidates merge on DOI when possible, otherwise on `normalized_title + conference + year`.

## Persistence, duplicates, and quality states

The main duplicate key is `normalized_title + conference + year`. Partial unique indexes also enforce DOI, `source_name + source_record_id`, and canonical original URL. `paper_id` is a stable SHA-256-derived local identifier. Repeating an import returns the existing paper and does not insert another row. A later successful retrieval may upgrade a previously failed or less-complete record.

Stored paper states are:

- `complete`: title, conference, year, abstract, keywords, and original URL are present.
- `missing_fields`: the record is saved, with unavailable required fields listed in `missing_fields`.
- `fetch_failed`: a confirmed candidate is retained but detail retrieval failed; `retrieval_error` explains the failure.
- `duplicate`: an import outcome referring to an already stored record; it is not a second stored paper.

The default analysis rule requires both `abstract` and `keywords`. API paper objects expose `eligible` and `excluded_for`. Downstream analyses must filter on `eligible`; incomplete or failed records must never be silently included. This policy is intentionally visible in the Paper Detail screen.

## Batch behavior

CSV uses a `title`/`paper title` header when present; otherwise column 1 is the title. TXT and pasted input use one title per line. Blank rows are ignored, quoted CSV fields are supported, and original physical row numbers/input values are retained. Repeated normalized titles inside one submission are classified as duplicates before source access.

Jobs run in-process with bounded concurrency. Each item transitions through `pending` and `processing` to `successful`, `duplicate`, `missing_fields`, or `failed`. A failing item does not stop its siblings. The job API returns total/pending/processing/successful/duplicate/missing-field/failed counts, a failure reason, and retry eligibility per item. Retry resets only eligible failures.

Jobs and progress survive an application restart because they are in SQLite, but a job that was processing when the process stopped is not automatically resumed. See known limitations.

## Configuration

Copy values from `server/.env.example` into your process environment. This project does not load `.env` files automatically; use the environment mechanism of your shell, process manager, or deployment platform.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Express port |
| `PAPERPULSE_DB_PATH` | `server/data/paperpulse.db` | SQLite file |
| `PAPERPULSE_USER_AGENT` | descriptive project UA | Source request identity |
| `PAPERPULSE_HTTP_TIMEOUT_MS` | `12000` | Per-request timeout |
| `PAPERPULSE_HTTP_CONCURRENCY` | `3` | Global source-request bound |
| `PAPERPULSE_HTTP_INTERVAL_MS` | `1500` | Minimum per-origin interval |
| `PAPERPULSE_HTTP_RETRIES` | `2` | Retry count after first attempt |
| `PAPERPULSE_HTTP_BACKOFF_MS` | `400` | Exponential backoff base |
| `PAPERPULSE_CACHE_TTL_SECONDS` | `86400` | Successful response TTL |
| `PAPERPULSE_RESPECT_ROBOTS` | `true` | Enforce robots rules |
| `PAPERPULSE_ENABLED_SOURCES` | `cvf,ecva,dblp` | Adapter allow-list |
| `PAPERPULSE_SOURCE_YEARS` | `2021,2022,2023,2024,2025` | Official index years |
| `PAPERPULSE_MAX_SEARCH_RESULTS` | `20` | Ranked candidates returned |
| `PAPERPULSE_CANDIDATE_TTL_SECONDS` | `3600` | Confirmation window |
| `PAPERPULSE_IMPORT_CONCURRENCY` | `2` | Concurrent import items |
| `PAPERPULSE_MAX_BATCH_SIZE` | `500` | Titles per job |
| `PAPERPULSE_GENERAL_STOPWORDS` | built-in list | Comma-separated stopwords |
| `PAPERPULSE_CV_STOPWORDS` | built-in list | CV-specific stopwords |
| `PAPERPULSE_SYNONYMS` | built-in JSON object | Explicit keyword aliases |

## API and CLI

Run the backend with `npm run dev:server` and frontend with `npm run dev`. The Vite development server proxies `/api` to port 3000.

```text
POST /api/papers/search                    { "title": "complete or partial title" }
POST /api/papers/search/:candidateId/confirm
POST /api/papers                           { "title": "...", "conference": "CVPR", "year": 2025, ... }
PATCH /api/papers/:paperId                 { "title": "updated title", ... }
DELETE /api/papers/:paperId
POST /api/imports                         { "content": "...", "format": "txt|csv" }
GET  /api/imports/:jobId
POST /api/imports/:jobId/retry
GET  /api/papers?query=&conference=&year=&status=&limit=&offset=
GET  /api/papers/:paperId
```

The compatibility endpoint `POST /api/papers/import` starts the same batch workflow.

```powershell
npm run cli -- search "Scalable Vision-Language Models"
npm run cli -- import examples/papers.csv
npm run cli -- import examples/papers.txt
npm run cli -- clean examples/paper-record.json
npm run cli -- summary <job-id>
```

## Tests and fixtures

`npm test` runs Node's test runner. Tests use in-memory SQLite, fake adapters, mocked `fetch`, and the sanitized files under `server/test/fixtures`; they never require a live website. Coverage includes cleaning, missing data, matching, duplicate/idempotent persistence, malformed input, partial batch success, timeout/retry exhaustion, source parsing, and every required API workflow.

## Known limitations

- Upstream HTML structures and availability can change; parser failures are logged and shown as source errors.
- CVF does not consistently publish author keywords. Missing keywords remain missing rather than being inferred.
- DBLP is bibliographic fallback data and normally does not provide abstracts or keywords.
- The ECVA index layout may cover different years unevenly.
- Batch execution is an in-process worker. For durable automatic resume and multiple server replicas, replace it with a persistent queue and startup recovery policy.
- SQLite uses Node's built-in `node:sqlite`, which is marked experimental in the current Node 22 runtime even though the exercised API is functional.

## Adding another source

1. Create an adapter in `server/src/sources` that extends `SourceAdapter` and implements `search(query, options)`; implement `fetchDetails(candidate)` when the source has a detail page.
2. Return the unified candidate keys used by existing adapters. Never invent unavailable metadata.
3. Register the adapter factory in `server/src/context.js` and add its name to `PAPERPULSE_ENABLED_SOURCES`.
4. Add sanitized HTML/JSON fixtures and offline parser, timeout, and invalid-response tests.
5. Document the public endpoint, fields, terms/robots behavior, rate expectations, and citation method in this file.
