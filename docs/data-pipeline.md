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
GET  /api/overview/stats?conference=&year=
GET  /api/topics/hot?conference=&year=&query=&sort=&limit=
GET  /api/topics/:topic?conference=&year=&paper_limit=
GET  /api/topics/network?conference=&year=&max_nodes=&min_node_count=&min_edge_count=&max_edges=&focus=
GET  /api/topics/trends?topic=&topic=&conference=&conference=&start_year=&end_year=&metric=
GET  /api/papers?query=&conference=&year=&data_status=&source_name=&sort=&limit=&offset=
GET  /api/papers/facets
GET  /api/papers/recent?conference=&year=&limit=
GET  /api/papers/:paperId
GET  /api/papers/:paperId/context
```

### Overview metrics and recent papers

`GET /api/overview/stats` accepts optional `conference` (`CVPR`, `ICCV`, or `ECCV`) and publication `year` filters. Blank filter values are treated as unset; invalid values return HTTP 400. Its response is explicit about the selected scope and each metric:

```json
{
  "scope": { "conference": "CVPR", "year": 2025 },
  "papers": { "value": 0, "previous_value": 0, "delta_percent": null },
  "topics": { "value": 0, "previous_value": 0, "delta_percent": null },
  "conferences": { "value": 0 },
  "data_quality": {
    "complete": 0,
    "missing_fields": 0,
    "fetch_failed": 0,
    "complete_percent": 0
  },
  "last_sync": { "value": null, "status": "empty" }
}
```

Metrics use these definitions:

- `papers.value` is the number of all stored papers in the selected scope.
- `topics.value` is the number of distinct lowercase, trimmed, non-empty normalized keywords contributed by analysis-eligible papers. Eligibility requires a non-empty abstract, at least one non-empty keyword, and a status other than `fetch_failed`.
- `conferences.value` is the number of distinct non-null conferences represented in the selected scope.
- `data_quality` counts scoped papers in each stored quality state. `complete_percent` is the complete count divided by all scoped papers, rounded to one decimal place, or zero for an empty scope.
- `last_sync.value` is the newest relevant `updated_at` or `retrieved_at` timestamp. Its status is `empty` when the scope has no papers, `up-to-date` when that timestamp is within the last 24 hours, and `stale` otherwise.

When a year is selected, paper and topic metrics compare with the preceding publication year while retaining the same conference filter. `delta_percent` is rounded to one decimal place. It is `null` when the preceding value is zero, preventing division by zero and misleading percentages. When no year is selected, `previous_value` and `delta_percent` are both `null`; the API does not infer a comparison year.

`GET /api/papers/recent` accepts the same optional conference/year scope plus `limit`. The limit defaults to 4 and must be between 1 and 20. Results are ordered by `updated_at` descending, then title and paper ID for deterministic ties. Each result contains only `paper_id`, `title`, `authors`, `conference`, `year`, `keywords`, `data_status`, and `updated_at`.

`GET /api/papers/facets` returns the distinct stored conferences and publication years, with years newest first. The Overview year selector uses this endpoint rather than a hard-coded year list.

### Hot-topic analysis

`GET /api/topics/hot` derives a ranked topic list from stored normalized keywords. It accepts optional `conference` (`CVPR`, `ICCV`, or `ECCV`), optional publication `year`, an optional case-insensitive topic-name substring `query`, `sort` (`count`, `share`, or `growth`), and `limit` (1–100, default 10). Query values are bound as SQLite parameters. Sort values select one of three fixed server-side SQL clauses and arbitrary client text is never interpolated into the query.

The analysis unit is one distinct eligible paper containing one normalized keyword. A paper contributes at most once to a keyword even if malformed stored JSON repeats it. Eligibility is shared with the Overview analysis: the paper must have a non-empty abstract, at least one non-empty keyword, and `data_status` must not be `fetch_failed`.

For each topic:

- `paper_count` is the number of distinct eligible papers in the selected scope containing the exact normalized keyword.
- `eligible_paper_total` is the number of all eligible papers in that scope.
- `share_percent = paper_count / eligible_paper_total × 100`, rounded to one decimal place. An empty scope reports zero.
- When a year is selected, `previous_paper_count` uses the preceding year with the same conference filter and `growth_percent = (paper_count - previous_paper_count) / previous_paper_count × 100`, rounded to one decimal place.
- A zero previous-year count produces `growth_percent: null`; it is not represented as infinite or 100% growth. Without a selected year, both previous count and growth are `null`.

Ranking is deterministic. Count order is paper count descending then topic ascending. Share order is share descending, paper count descending, then topic ascending. Growth order places numeric growth before null baselines, then uses growth descending, paper count descending, and topic ascending. Returned ranks reflect the filtered, sorted result.

`GET /api/topics/:topic` normalizes the path as one complete keyword and uses exact keyword equality, never substring matching inside JSON. It returns the scoped count/share/growth metrics, supporting papers, and a yearly trend. Unknown topics in the selected scope return HTTP 404. `paper_limit` defaults to 10 and accepts 1–50. Related papers must be eligible and contain the exact keyword; they are ordered by publication year descending, update timestamp descending, title, and paper ID.

The trend retains the optional conference filter but spans all publication years even when a display year is selected. It returns ascending years that contain at least one eligible paper in that conference scope. An available year is included with a zero topic count when appropriate; calendar years with no eligible papers are omitted. Every point includes the raw topic count, eligible-paper denominator, and normalized share.

Topic frequency is a descriptive database measure. It does not establish academic quality, importance, or causality.

### Keyword co-occurrence network

`GET /api/topics/network` builds a deterministic undirected network from the same analysis-eligible papers used by hot-topic analysis. Optional `conference` and `year` values select the scope. `max_nodes` defaults to 20 and accepts 2–50; `min_node_count` defaults to 1 and accepts positive integers; `min_edge_count` defaults to 1 and accepts positive integers; and `max_edges` defaults to 100 and accepts 1–300. `focus` optionally identifies one complete normalized keyword. Invalid values return HTTP 400, while an unknown focus keyword in the selected scope returns HTTP 404.

A node represents one stored normalized keyword. Its `paper_count` is the number of distinct eligible papers containing it, and `share_percent = paper_count / eligible_paper_total × 100`, rounded to one decimal place. Duplicate keyword entries within one paper are collapsed before counting. Eligibility requires a non-empty abstract, at least one non-empty keyword, and a status other than `fetch_failed`; malformed keyword JSON contributes neither a paper nor a keyword and does not interrupt the request.

An edge represents two different normalized keywords in the same eligible paper. Each paper contributes at most once to an unordered pair. Endpoints are stored lexically as `source < target`, preventing separate A–B and B–A edges. `cooccurrence_count` is the number of distinct eligible papers containing both endpoints. Similarity is returned as a rounded number using:

```text
jaccard_similarity =
  cooccurrence_count /
  (source_paper_count + target_paper_count - cooccurrence_count)
```

For a global network, nodes first pass `min_node_count`, then sort by paper count descending and topic ascending before `max_nodes` truncation. Edges are calculated only between the selected nodes, pass `min_edge_count`, sort by co-occurrence descending, Jaccard descending, source, and target, then stop at `max_edges`. Node `degree` counts returned incident edges; `weighted_degree` sums their returned co-occurrence counts.

For a focused network, the focus node is retained even when its count is below `min_node_count`. Direct neighbors must meet the node and edge thresholds and are ranked by co-occurrence descending, Jaccard descending, node paper count descending, then topic ascending. The result contains the focus plus at most `max_nodes - 1` such neighbors. Returned edges include every qualifying pair among the final nodes, including neighbor-to-neighbor edges, and still obey `max_edges`.

The current SQLite implementation expands each eligible paper into distinct keywords and then self-joins those keywords to form pairs. Pair generation is quadratic in the number of keywords on one paper, so unusually large keyword arrays or very large corpora may require precomputed aggregate tables or a background analysis job. Thresholds and response limits bound output size but do not eliminate that intermediate work.

Keyword frequency and co-occurrence are descriptive. They do not imply academic quality, semantic equivalence, importance, or causality.

### Multi-year topic trends and conference comparison

`GET /api/topics/trends` compares exact normalized keywords across CVPR, ICCV, and ECCV using one consistent paper unit. Topics and conferences use repeated query parameters rather than comma-separated values:

```text
GET /api/topics/trends?topic=diffusion%20model&topic=vision%20language%20model&conference=CVPR&conference=ICCV&start_year=2021&end_year=2025&metric=share
```

`topic` accepts one to five unique normalized keywords. Duplicate topics are removed in first-requested order. Each value must normalize to exactly one complete keyword; substring matching inside stored JSON is never used. Requested topics with no eligible occurrence in the selected conference/year scope are returned in `unknown_topics` and omitted from `series`; the API never substitutes another topic. `conference` accepts CVPR, ICCV, and ECCV, removes duplicates, and always returns them in canonical CVPR/ICCV/ECCV order. `metric` is `count` or `share` and defaults to `share`.

When topics are omitted, the API selects up to four topics ranked by aggregate distinct eligible-paper count over the requested conference/year scope, with topic name as the deterministic tie-breaker. When conferences are omitted, all three supported conferences are used. When both year boundaries are omitted, the range starts at the oldest of the latest five represented eligible publication years and ends at the latest represented year. The range includes every intervening calendar year and is capped to the latest 15-calendar-year window if those represented years are unusually sparse. An empty database uses the current UTC year and preceding four years. If only `start_year` is supplied, `end_year = start_year + 4`; if only `end_year` is supplied, `start_year = end_year - 4`. Derived years must pass the same year validation as explicit years. Start must not exceed end, and an inclusive range may contain at most 15 calendar years.

Analysis eligibility is unchanged: a paper must have a non-empty abstract, at least one non-empty keyword, and a status other than `fetch_failed`. For every requested topic, conference, and calendar year:

```text
paper_count = distinct eligible papers containing the exact normalized keyword
eligible_paper_total = all eligible papers in the same conference/year
share_percent = paper_count / eligible_paper_total * 100
```

Shares are rounded to one decimal place. A positive denominator with no topic occurrence is a genuine observation with `paper_count: 0`, `share_percent: 0`, and `has_data: true`. A conference/year with no eligible papers is unavailable and returns `paper_count: 0`, `eligible_paper_total: 0`, `share_percent: null`, and `has_data: false`. The complete topic × conference × calendar-year matrix is returned, allowing clients to break lines at missing data without hiding real zero values.

Series are grouped by normalized topic order and then canonical conference order; years are ascending. The summary peak considers only `has_data: true` points and uses paper count for `metric=count` or normalized share for `metric=share`. Ties resolve by later year, then conference name, then topic name. `latest_year_with_data` is the latest valid matrix year. If no valid point exists, both peak and latest data year are `null`. Source names and the latest relevant record timestamp are included when available.

The Trend Analysis page obtains topic candidates from the live hot-topic endpoint for every selected conference/year, applies the filters through the trends endpoint, and preserves the previous chart while refreshing. Play reveals existing years chronologically, pause freezes the visible year, and replay returns to the first year before advancing. Animation never creates or extrapolates points. Color identifies topics while line patterns and marker shapes identify conferences; unavailable years break lines, and an accessible table exposes all source counts.

These metrics are descriptive database frequencies. They are not forecasts, measures of paper quality, evidence of academic importance, or proof of causal relationships. Comparisons also inherit differences in source coverage and the availability of abstracts and author keywords.

### Paper Library search and pagination

`GET /api/papers` performs all Paper Library search, filtering, sorting, and pagination on the server. `query` is a case-insensitive contains search across paper ID, display title, normalized title, authors, and keywords. Literal `%`, `_`, and backslash characters are escaped before the parameterized SQLite query is executed. `conference` accepts `CVPR`, `ICCV`, or `ECCV`; `data_status` accepts `complete`, `missing_fields`, or `fetch_failed`; `source_name` is an exact case-insensitive source-name filter. The legacy `status` parameter remains accepted as an alias for `data_status`.

The accepted `sort` values are fixed names mapped to trusted SQL fragments:

| Sort value | Order |
| --- | --- |
| `updated_desc` | Recently updated first (default) |
| `updated_asc` | Oldest updated first |
| `title_asc` | Title A–Z |
| `title_desc` | Title Z–A |
| `year_desc` | Newest publication year first |
| `year_asc` | Oldest publication year first |

The default page size is 20; `limit` accepts 1–200 and `offset` accepts 0–1,000,000. The response includes the current items and complete pagination state:

```json
{
  "items": [],
  "total": 0,
  "limit": 20,
  "offset": 0,
  "page": 1,
  "page_count": 0,
  "has_previous": false,
  "has_next": false
}
```

The compatibility endpoint `POST /api/papers/import` starts the same batch workflow.

### Paper detail context and recommendations

`GET /api/papers/:paperId/context` returns the stored paper together with deterministic, database-backed analysis context. An unknown ID returns HTTP 404 and never substitutes another record. The response has this structure:

```json
{
  "paper": {},
  "data_quality": {
    "status": "complete",
    "missing_fields": [],
    "retrieval_error": null,
    "eligible": true,
    "excluded_for": []
  },
  "primary_topic": {
    "topic": "vision language",
    "scope": { "conference": "CVPR", "year": 2025 },
    "rank": 1,
    "paper_count": 12,
    "eligible_paper_total": 80,
    "share_percent": 15,
    "previous_paper_count": 8,
    "growth_percent": 50
  },
  "related_keywords": [],
  "related_papers": [],
  "methodology": {}
}
```

`paper` is the complete stored paper representation exposed by the ordinary detail endpoint. `data_quality` repeats the persisted quality state and the shared analysis-eligibility result so the client can distinguish unavailable fields from analysis exclusions. Malformed keyword, author, or missing-field JSON is represented safely as an empty array. The shared eligibility rule still requires a non-empty abstract, a JSON keyword array with at least one non-empty text keyword, and a state other than `fetch_failed`.

The primary topic is selected only from the paper's normalized keywords. Candidates with statistics in the paper's conference/year scope sort by distinct eligible-paper count descending, then normalized topic name ascending. If no candidate has scoped statistics, the lexical first normalized keyword is retained with unavailable statistics. Rank, paper count, eligible-paper denominator, normalized share, previous-year count, and growth reuse the hot-topic analysis definitions. A paper with no usable keywords has `primary_topic: null`.

Related keywords are the first five direct co-occurrence neighbors of the primary topic in the same topic scope. Ordering is co-occurrence count descending, Jaccard similarity descending, neighbor paper count descending, and topic ascending. Counts use exact normalized keyword equality and distinct eligible papers.

Related papers are limited to three eligible records from the same conference and publication year that share at least one exact normalized keyword with the current paper. The current paper is always excluded. Results prioritize a primary-topic match, then shared-keyword count, title, and paper ID. Each result includes the paper, its exact shared keywords, the shared-keyword count, and whether it matches the primary topic. Missing conference, year, or keywords produces an empty recommendation list rather than a broader or fabricated fallback.

The Paper Detail page consumes only this endpoint. It exposes loading, retry, not-found, incomplete-data, and retrieval-error states; links normalized keywords into the live Hot Topics analysis scope; and reloads context when its route ID changes. Keyword frequency, co-occurrence, and recommendations are descriptive database signals, not measures of paper quality or causality.

```powershell
npm run cli -- search "Scalable Vision-Language Models"
npm run cli -- import examples/papers.csv
npm run cli -- import examples/papers.txt
npm run cli -- clean examples/paper-record.json
npm run cli -- summary <job-id>
```

## Tests and fixtures

`npm test` runs Node's test runner. Tests use in-memory SQLite, fake adapters, mocked `fetch`, and the sanitized files under `server/test/fixtures`; they never require a live website. Coverage includes cleaning, missing data, matching, duplicate/idempotent persistence, malformed input, partial batch success, timeout/retry exhaustion, source parsing, Overview aggregation and scope behavior, hot-topic formulas/filtering/sorting/exact detail matching/trends, keyword-network nodes/pairs/Jaccard/thresholds/focus behavior, recent-paper ordering and filtering, Paper Library query/filter/sort/pagination behavior, and every required API workflow.

## Known limitations

- Upstream HTML structures and availability can change; parser failures are logged and shown as source errors.
- CVF does not consistently publish author keywords. Missing keywords remain missing rather than being inferred.
- DBLP is bibliographic fallback data and normally does not provide abstracts or keywords.
- The ECVA index layout may cover different years unevenly.
- Batch execution is an in-process worker. For durable automatic resume and multiple server replicas, replace it with a persistent queue and startup recovery policy.
- The SQLite keyword-network query computes pairs on demand. Large corpora or papers with unusually many keywords will eventually need precomputed aggregates or a background analysis job.
- SQLite uses Node's built-in `node:sqlite`, which is marked experimental in the current Node 22 runtime even though the exercised API is functional.

## Adding another source

1. Create an adapter in `server/src/sources` that extends `SourceAdapter` and implements `search(query, options)`; implement `fetchDetails(candidate)` when the source has a detail page.
2. Return the unified candidate keys used by existing adapters. Never invent unavailable metadata.
3. Register the adapter factory in `server/src/context.js` and add its name to `PAPERPULSE_ENABLED_SOURCES`.
4. Add sanitized HTML/JSON fixtures and offline parser, timeout, and invalid-response tests.
5. Document the public endpoint, fields, terms/robots behavior, rate expectations, and citation method in this file.
