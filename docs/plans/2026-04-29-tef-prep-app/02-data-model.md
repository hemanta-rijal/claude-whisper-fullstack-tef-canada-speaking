# Data Model

Postgres 16 with JSONB for rubric/criteria/evidence shapes that benefit from schemaless flexibility but still need relational queries.

All schema below is illustrative — column types, constraints, and index choices are the binding part; exact Postgres syntax will be finalized in migrations.

## Entity overview

```
users ──< sessions ──< attempts ──< scores
  │                         │           │
  │                         │           └─ error_tags ──> user_weak_spots (rolled up)
  │                         │
  │                         └─ uses content_items (passages, prompts)
  │                                              │
  │                                              └─ scored against rubrics
  │
  └─ user_weak_spots (per user × tag)
  └─ user_skill_clb (per user × skill, derived but cached)
```

## Tables

### `users`

```sql
id              uuid primary key
email           text unique not null
created_at      timestamptz default now()
target_variant  enum('canada','quebec','naturalisation','etudes','general')
target_clb      smallint                       -- e.g. 9 for CLB 9
target_test_at  date                           -- exam date if known
locale_pref     enum('fr-FR','fr-CA') default 'fr-FR'
```

Notes:
- `locale_pref` controls TTS accent and pronunciation scoring locale (Azure supports both).
- `target_clb` and `target_test_at` drive prioritization in [`07-progress-engine.md`](./07-progress-engine.md).

### `content_items`

The library of prompts, passages, and scenarios. The single most valuable asset in the system.

```sql
id              uuid primary key
task_type       enum('CE','CO','EE_A','EE_B','EO_A','EO_B')
difficulty_clb  smallint not null              -- 4..11
content         jsonb not null
                -- shape varies by task_type; see 03-task-types.md
source          enum('curated','generated','past_paper')
rubric_id       uuid references rubrics(id)
locale          enum('fr-FR','fr-CA') default 'fr-FR'
tags            text[]                         -- topic tags: 'health','politics','workplace'
quality_score   real                           -- post-validation, 0..1
created_at      timestamptz default now()
retired_at      timestamptz                    -- soft-delete; keeps historical attempts valid

index on (task_type, difficulty_clb) where retired_at is null
gin index on tags
gin index on content
```

### `rubrics`

```sql
id              uuid primary key
task_type       enum(...)
version         text not null                  -- semver-ish, e.g. '1.2.0'
criteria        jsonb not null                 -- see 05-content-strategy.md
exemplars       jsonb not null                 -- few-shot exemplar bank
created_at      timestamptz
locked_at       timestamptz                    -- once calibrated, lock; new versions are new rows

unique (task_type, version)
```

Rubrics are **immutable once locked**. Re-calibration produces a new version. Historical scores reference the rubric version they were graded under, so rubric upgrades don't invalidate past data.

### `sessions`

```sql
id              uuid primary key
user_id         uuid references users(id)
mode            enum('drill','mock','review')
variant         enum(...)                      -- which TEF variant for this session
started_at      timestamptz
ended_at        timestamptz
metadata        jsonb                          -- mock exam config, drill filters, etc.

index on (user_id, started_at desc)
```

### `attempts`

```sql
id              uuid primary key
session_id      uuid references sessions(id)
content_item_id uuid references content_items(id)
task_type       enum(...)                      -- denormalized for query speed
response_text   text                           -- for EÉ and MCQ answers
response_audio  text                           -- S3/R2 key for EO
duration_ms     integer                        -- how long the user took
submitted_at    timestamptz
scored_at       timestamptz                    -- null until scoring completes
score_status    enum('pending','scoring','scored','failed')
rubric_version  text                           -- which rubric version graded this

index on (session_id)
index on (score_status) where score_status in ('pending','scoring')
```

### `scores`

One row **per criterion per attempt** (not one per attempt). Lets us query "show me all my coherence scores over time" cleanly.

```sql
id              uuid primary key
attempt_id      uuid references attempts(id)
criterion       text not null                  -- e.g. 'grammatical_accuracy'
raw_score       real not null                  -- 0..1 normalized
clb_estimate    real                           -- e.g. 8.5 (decimal allowed)
feedback_md     text                           -- markdown feedback for this criterion
evidence        jsonb                          -- spans, counts, examples
                                               -- e.g. {"errors_subjunctive": 2,
                                               --       "spans": [{start,end,note}]}

index on (attempt_id)
index on (attempt_id, criterion)
```

For MCQ tasks (CO/CÉ), there's a single criterion `correctness` with `raw_score` ∈ {0, 1}.

### `error_tags`

The atomic units of weakness. One row per tagged error per attempt.

```sql
id              uuid primary key
attempt_id      uuid references attempts(id)
user_id         uuid                           -- denormalized for fast user-level queries
tag             text not null                  -- from the canonical taxonomy below
severity        smallint                       -- 1..3 (minor / moderate / blocking)
span            jsonb                          -- {start_char, end_char} or {start_ms, end_ms}
correction      text                           -- what it should have been
explanation     text                           -- short, learner-facing

index on (user_id, tag)
index on (attempt_id)
```

### `user_weak_spots`

Rolled-up view of `error_tags` per user. Updated on every score commit. Drives next-task selection.

```sql
user_id         uuid
tag             text
ema_severity    real not null                  -- exponential moving average, alpha=0.3
last_seen_at    timestamptz
seen_count      integer
drill_count     integer                        -- times explicitly drilled since first seen
recovered_at    timestamptz                    -- nullable; set when ema drops below threshold

primary key (user_id, tag)
index on (user_id, ema_severity desc)
```

EMA update on each new error: `ema = 0.3 * new_severity + 0.7 * ema`. Decay-only when no new errors: gentle linear decay over weeks. See [`07-progress-engine.md`](./07-progress-engine.md).

### `user_skill_clb`

Cached CLB estimate per user × skill. Derived from recent `scores` but cached for fast read.

```sql
user_id         uuid
skill           enum('CO','CE','EO','EE')
clb_estimate    real
confidence      real                           -- 0..1, based on attempt count
last_updated    timestamptz

primary key (user_id, skill)
```

Computed as a confidence-weighted average of recent attempt CLB estimates, with more weight on recent attempts and on attempts at difficulty levels near the current estimate (see [`07-progress-engine.md`](./07-progress-engine.md)).

### `scoring_jobs`

BullMQ-backed; this table mirrors job state for observability and retry visibility. Not the queue itself.

```sql
id              uuid primary key
attempt_id      uuid references attempts(id)
job_id          text                           -- BullMQ id
status          enum('queued','running','done','failed','retrying')
provider_calls  jsonb                          -- per-call latency + cost log
error           text
created_at, updated_at timestamptz
```

## The error-tag taxonomy

This is fixed and curated. ~150 tags total. Adding a tag is a deliberate event — it requires:
- a learner-friendly explanation
- a "how to drill it" hint linking to a content filter or generator config
- examples of correct + incorrect

Tags are namespaced: `category.subcategory.specific`.

### Sample categories (full list maintained in `content/error_tags.yaml`)

**Grammar (`gram.*`)**
- `gram.agreement.gender` — wrong gender on adjective/article
- `gram.agreement.number` — singular/plural mismatch
- `gram.agreement.past_participle_avoir` — accord du PP avec COD antéposé
- `gram.tense.subjunctive_après_que` — overuse of subjunctive after `après que`
- `gram.tense.subjunctive_trigger_missing` — missing subjunctive after `il faut que`, `bien que`, etc.
- `gram.pronoun.cod_coi_placement` — wrong pronoun position
- `gram.pronoun.y_en_misuse`
- `gram.preposition.de_à_choice` — `parler à` vs `parler de` etc.
- `gram.relative.dont_qui_que_choice`

**Lexicon (`lex.*`)**
- `lex.register.too_familiar` — using `t'as` / verlan / `truc` in formal letter
- `lex.register.too_formal` — overly literary in casual scenario
- `lex.faux_ami` — false-friend errors (`actuellement`, `éventuellement`, ...)
- `lex.collocation` — non-idiomatic word combination
- `lex.range.repetitive` — limited vocabulary, repeats same words

**Discourse (`disc.*`)**
- `disc.connector_missing` — choppy ideas, no `cependant`, `en effet`, `par ailleurs`
- `disc.connector_misused` — wrong logical connector
- `disc.argumentation.no_thesis` — EÉ-B missing clear thesis
- `disc.argumentation.no_examples` — assertions without support
- `disc.coherence.topic_drift`

**Format / task-specific (`fmt.*`)**
- `fmt.ee_a.over_word_count`
- `fmt.ee_a.fact_omission` — missed required fact in news brief
- `fmt.ee_a.fact_invention` — added fact not in source
- `fmt.ee_b.no_addressee` — missing greeting/closing for the addressee
- `fmt.eo_b.no_explicit_position` — didn't take a side
- `fmt.eo_a.questions_too_few` — fewer than required info-gathering questions

**Phonology (`phon.*`)** — only set when Azure pronunciation scores are available
- `phon.vowel.nasal_ɑ̃` — `/ɑ̃/` (an/en) realization
- `phon.vowel.nasal_ɛ̃` — `/ɛ̃/` (in/ain)
- `phon.vowel.nasal_ɔ̃` — `/ɔ̃/` (on)
- `phon.vowel.front_y` — `/y/` (u) confused with `/u/` (ou)
- `phon.consonant.r` — uvular `/ʁ/` realization
- `phon.liaison.obligatoire_missing` — missing obligatory liaison
- `phon.liaison.interdite_made` — made a forbidden liaison
- `phon.elision.missed` — said "le ami" instead of "l'ami"
- `phon.prosody.flat_intonation`
- `phon.prosody.misplaced_stress`

**Pragmatic (`prag.*`)** — context-appropriateness
- `prag.politeness.tu_vous_mismatch`
- `prag.directness.too_blunt` — register mismatch in EO-A "convince" tasks
- `prag.opening.absent` — no greeting in EO-A dialogue start

## Indexes & query patterns

The hot read paths are:

1. **Next-task selector** — `SELECT next content_item WHERE difficulty ≈ user_clb AND tags overlap top_weak_spots(user)` — covered by `(task_type, difficulty_clb)` plus a Redis cache invalidated on weak-spot update.
2. **Review tray** — `SELECT attempts WHERE user_id = ? AND scored_at > last_seen ORDER BY scored_at DESC` — covered by `(session_id)` joined with `sessions(user_id)` index.
3. **Progress chart** — `SELECT scores JOIN attempts WHERE user_id = ? GROUP BY skill, week` — covered by `(attempt_id, criterion)` plus periodic materialized view if perf demands.
4. **Weak-spot list** — single-table query on `user_weak_spots`, already indexed.

## Migrations & schema evolution

- Use a real migration tool (Drizzle / Prisma / Kysely + custom). Manual ALTERs forbidden.
- All schema changes go through PR review even on a personal project.
- `rubrics` and `error_tags` taxonomy live in code (TypeScript constants + YAML), not just DB. The DB stores tag *strings*; the code is the source of truth for which tags are valid. A startup check rejects tags not in the taxonomy.
