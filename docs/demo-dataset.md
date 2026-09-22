# Real-paper demonstration dataset

Run from the repository root with Node.js 22.5 or newer:

```powershell
npm run db:init
npm run cli -- demo-import 20
npm run cli -- extract-keywords
```

The default target is 120 real papers: 20 each from CVPR 2023/2024,
ICCV 2021/2023, and ECCV 2022/2024. These are real conference editions;
ICCV and ECCV alternate years. CVPR/ICCV metadata and abstracts come from
CVF Open Access; ECCV metadata and abstracts come from ECVA.

The importer sorts unique official detail URLs by SHA-256 and takes the first N
per edition. This is a reproducible convenience sample, not complete proceedings
or evidence of population-wide research trends. The command accepts 1–100 papers
per edition, prints counts/errors and IDs, and exits nonzero if any cohort is
incomplete. Repeating the same import skips existing eligible records and uses
the normal duplicate protections. Existing unrelated records are preserved.
Respectful source access, timeouts, retries, response caching and robots checks
use the existing HTTP client. No PDFs or fabricated abstracts are imported.

The active SQLite file defaults to `server/data/paperpulse.db`; an existing
`PAPERPULSE_DB_PATH` override also applies to the CLI. Database binaries and HTTP
caches are intentionally excluded from Git. Re-run the command on another host.

## Keyword extraction

TextRank (`textrank-v1`) runs automatically during cleaning when normalized supplied
keywords are empty. It requires an abstract with at least 20 alphabetic words;
title-only records remain excluded by existing eligibility rules.

Words form an undirected weighted graph within a four-position window inside
sentences. PageRank uses damping 0.85, a maximum of 100 iterations and convergence
threshold 1e-8, including dangling-node mass. Contiguous one-to-three-token phrases
are ranked by summed word score divided by square root of phrase length; phrases
whose tokens occur in the title receive a 1.5 multiplier. At most eight non-nested
phrases are selected deterministically, then passed through existing stopword,
word-form, synonym and duplicate normalization. Hyphenated tokens may expand to
multiple words. Extractor stopwords supplement configured lists.

Supplied keywords take precedence. Persisted provenance identifies derived
keywords, input fields, version and scored candidate phrases; paper details label
these as automatically extracted, not author-supplied. Editing the title or
abstract recomputes previously derived keywords unless the user replaces them
manually. `extract-keywords` backfills missing keywords and refreshes derived ones,
preserving supplied/manual keywords and stable paper IDs. This implementation uses
TextRank, not corpus-dependent TF-IDF. It produces explainable but imperfect
phrases; human inspection remains necessary, especially for a small sample.

## Demonstration checks

After importing, open Overview, Hot Topics, Keyword Map and Trend Analysis.
Use 2021–2024 and all three conferences for comparisons. Missing conference-years
remain gaps, rather than zeros. Open a paper to verify its abstract, official
source and extraction label. Existing statistical denominators count eligible
stored papers, so interpret all counts and shares as statistics of this sample.

## Verified local import — 2026-09-22

| Conference | Edition | Imported | Eligible |
| --- | --- | ---: | ---: |
| CVPR | 2023 | 20 | 20 |
| CVPR | 2024 | 20 | 20 |
| ICCV | 2021 | 20 | 20 |
| ICCV | 2023 | 20 | 20 |
| ECCV | 2022 | 20 | 20 |
| ECCV | 2024 | 20 | 20 |

All 120 records have real abstracts, author names, source URLs, retrieval dates,
and labeled TextRank keywords. SQLite integrity check returned `ok`, with no
foreign-key violations. Overview, hot topics, keyword network, trends, and paper
listing returned HTTP 200 against the populated database. A second keyword
backfill inspected 120 records and updated zero. The offline suite passed 87 tests;
the frontend production build passed. This is a local verification record, not
evidence of deployment or complete conference coverage.
