# Scoring Pipelines

How each task type gets graded after submission. All scoring runs in **async workers** consuming a BullMQ queue. The user never waits in-line for scoring.

## Worker shape

```
attempts.score_status: pending → scoring → scored | failed
                                 │
                                 └── BullMQ job picks up attempt_id
                                     └── routes by task_type to a scorer
                                         └── writes scores + error_tags + commits
                                             └── triggers progress-engine update
```

One worker process, multiple concurrent jobs. Per-provider rate limit groups (Azure, Gemini, Anthropic) prevent any one provider from blocking others. Job concurrency tuned per provider's quota.

## Scoring contracts

Every scorer implements the same interface:

```ts
interface Scorer {
  taskTypes: TaskType[]
  score(attempt: Attempt, content: ContentItem, rubric: Rubric): Promise<ScoringResult>
}

interface ScoringResult {
  scores: Score[]              // one per criterion
  errorTags: ErrorTag[]
  metadata: {
    providerCalls: ProviderCall[]   // for cost/latency observability
    rubricVersion: string
  }
}
```

Scorers are **pure** with respect to the database — they receive everything they need as arguments and return a result. The worker is responsible for committing.

## Per-task-type pipelines

### CÉ / CO — Deterministic MCQ

```
parse response_text (JSON map) → compare to content.questions[].correct
  → emit one Score per question (raw_score 0 or 1)
  → no error_tags (MCQ wrong-answer analysis is at the progress-engine level)
  → totals computed at session level by progress engine
```

Latency: <100ms. Cost: $0. No LLM involvement.

The interesting work for CO/CÉ is upstream — generating good questions with non-trivial distractors. See [`05-content-strategy.md`](./05-content-strategy.md).

### EÉ-A — News brief

Three checks run in parallel, then merged:

```
                  ┌─→ FACT COVERAGE PASS (small LLM, structured output)
                  │   for each fact in content.facts:
                  │     - is it covered in the response? (boolean)
                  │     - emit fmt.ee_a.fact_omission tag if missing
                  │   detect any factual claim not in source:
                  │     - emit fmt.ee_a.fact_invention tag
                  │
response_text ────┼─→ RUBRIC PASS (Claude Sonnet, prompt-cached)
                  │   [CACHED: rubric + 3 calibrated exemplars]
                  │   [FRESH: response_text + facts]
                  │   → returns scores per criterion + clb_estimate
                  │   → returns evidence (counts, spans)
                  │
                  └─→ ERROR-TAG PASS (Claude Haiku, structured output)
                      → returns error_tags array
                      → grammar, lexicon, register tags
                      → format tags (word count, fact handling come from
                        coverage pass; tag passes don't duplicate)

                  → MERGE → write all scores + error_tags + commit
```

**Word count check is deterministic** (a regex/tokenizer count, no LLM needed). Off-target word count is a hard rule, not an LLM judgment.

Latency: 5–10s. Cost: ~$0.002/attempt with caching. Without caching: ~$0.02 (10× more — caching is non-negotiable).

### EÉ-B — Argumentative letter

Same shape as EÉ-A but **without the fact-coverage pass** (no source facts to cover). Adds:

- **Required elements pass** — the small LLM verifies each `required_elements[]` item is present (explicit position, two arguments, etc.) and emits `disc.argumentation.*` tags for missing ones.
- **Addressee/register check** — folded into rubric pass via the rubric's `register` criterion + an explicit "does the greeting/closing match the addressee?" sub-prompt.

```
                  ┌─→ REQUIRED ELEMENTS PASS (Haiku)
                  │   verifies each required_elements[] item
                  │
response_text ────┼─→ RUBRIC PASS (Sonnet, prompt-cached)
                  │
                  └─→ ERROR-TAG PASS (Haiku)
```

Latency and cost same order as EÉ-A.

### EO-A — Interactive dialogue

The most complex pipeline because it has live audio + post-session scoring + multiple concurrent providers.

**During the live session** (Gemini Live):
- Audio is streamed both ways via WebRTC
- Gemini Live's transcript stream is captured (turns from both sides)
- Full audio is recorded client-side and uploaded on session end (we cannot rely on Gemini's audio retention)

**After session end**, the scoring job runs:

```
audio_blob (R2) ────┬─→ WHISPER (re-transcribe user-only audio)
                    │   → high-quality transcript with word timestamps
                    │   → reconcile with Gemini's live transcript
                    │
                    ├─→ AZURE PRONUNCIATION (fr-FR or fr-CA)
                    │   → mode: continuous (audio > 30s)
                    │   → IPA phoneme scores per word/syllable
                    │   → emit phon.* error_tags for low-scoring phonemes
                    │     (threshold tuned during calibration)
                    │
                    └─→ INTERLOCUTOR LOG (from Gemini Live transcript)
                                            │
                                            ▼
            transcript + interlocutor_log + content (info_to_obtain) →
                    │
                    ├─→ INFO COVERAGE PASS (Haiku)
                    │   for each info_to_obtain[] item:
                    │     - did the user successfully obtain this info?
                    │     - emit fmt.eo_a.info_missed if no
                    │   for question count:
                    │     - emit fmt.eo_a.questions_too_few if < min_questions
                    │
                    ├─→ INTERACTIVE COMPETENCE PASS (Haiku)
                    │   - turn-taking quality
                    │   - follow-up usage
                    │   - repair when misunderstood
                    │   - politeness markers
                    │   → emits prag.* tags
                    │
                    ├─→ RUBRIC PASS (Sonnet, prompt-cached)
                    │   [CACHED: rubric + exemplars]
                    │   [FRESH: transcript + interlocutor + info_results]
                    │   → returns per-criterion scores + CLB estimate
                    │
                    └─→ ERROR-TAG PASS (Haiku)
                        → grammar/lexicon tags from transcript

                    → MERGE → write scores + error_tags + commit
```

Latency: 10–20s. Cost: ~$0.01 per 5-min attempt (Azure ~$0.005, Whisper ~$0.002, Claude ~$0.003). Live Gemini cost is separate (~$0.09 per 5-min session).

### EO-B — Persuasive monologue

Same as EO-A pipeline minus the interlocutor log and the info-coverage pass. Adds a **fluency analysis** step using Whisper word timestamps:

- Words per minute
- Hesitation density (filled pauses, long inter-word gaps)
- Mean utterance length

These produce evidence for the rubric's `fluency` criterion rather than dedicated tags.

```
audio_blob ────┬─→ WHISPER
               │     → transcript + word timestamps
               │     → fluency metrics
               │
               ├─→ AZURE PRONUNCIATION → phon.* tags
               │
               └─→ ARGUMENT STRUCTURE PASS (Haiku)
                     - identifies thesis, arguments, counter, CTA
                     - emits disc.argumentation.* tags for missing parts

       transcript + fluency_metrics + structure_analysis →
               │
               ├─→ RUBRIC PASS (Sonnet)
               └─→ ERROR-TAG PASS (Haiku)

               → MERGE → write
```

Latency: 10–20s. Cost: ~$0.008/attempt.

## Prompt caching strategy

Claude prompt caching is the single largest cost lever in the system. We architect prompts to maximize hit rate.

### Cached block (per task_type, per rubric_version)

```
─── BEGIN CACHED ───
You are a TEF examiner scoring a {task_type} response under the
official TEF rubric, version {rubric_version}.

[FULL RUBRIC TEXT — ~3000 tokens]

EXEMPLAR 1 (CLB 6):
[exemplar response]
[hand-graded scores per criterion with reasoning]

EXEMPLAR 2 (CLB 9):
[…]

EXEMPLAR 3 (CLB 11):
[…]

OUTPUT FORMAT:
[strict JSON schema with one field per criterion + evidence]
─── END CACHED ───
```

### Fresh block (per attempt)

```
USER RESPONSE (CONTENT_ITEM_ID={id}):
{response_text or transcript}

CONTEXT (only if applicable):
{facts | info_to_obtain | interlocutor_log}

Now produce the JSON score.
```

Cache TTL: 1 hour rolling, refreshed on use. With ~30 attempts/user/week and shared rubric across all users, hit rate stays >95% in steady state. Cost reduction is ~10× on the cached portion (which is ~80% of the prompt by tokens).

## Error-tag pass design

The error-tag extractor is a separate, cheap call from the rubric pass — by design.

**Why separate:**
- Rubric pass needs the *gestalt* of the response and a few-shot calibration; error tags need *exhaustive* span-by-span analysis.
- Different output shapes (rubric = scores + reasoning; tags = arrays of spans).
- Different latency requirements (rubric should be slow-and-careful; tags should be fast).
- Putting both in one prompt empirically degrades both.

**Tag pass prompt shape:**

```
TAXONOMY: [list of all 150 tags with one-line definitions, prompt-cached]

Find every error in the following response. For each:
- choose the closest tag from the taxonomy
- provide the span (character offsets)
- provide the correction
- provide a one-sentence explanation in English

Do NOT invent tags. If an error doesn't match the taxonomy, skip it.
Do NOT score the response. Only tag.

RESPONSE:
{response}
```

The "do not invent tags" instruction is enforced by post-validation (drop any tag not in the taxonomy) and silently logged for taxonomy curation later.

## Mock exam scoring

In mock mode, individual attempts are scored with the same pipelines, but the **session-level summary** is the headline output. After all attempts in the mock are scored:

1. Aggregate per-skill CLB estimates with confidence intervals
2. Map to TEF point bands per the variant's official scoring chart
3. Generate a "test report" PDF with: overall scores, per-section breakdown, top 5 weaknesses, prioritized study plan for next 2 weeks
4. Email the report and surface in the app

Mock report generation is a separate worker job that runs after the last attempt is scored. ~30s wall clock. Uses the largest available Claude model with no caching (one-shot, high-stakes write).

## Failure handling

Each scorer has a defined failure policy. None silently approximate.

| Failure | Behavior |
|---|---|
| Provider timeout (any) | Retry once with exponential backoff |
| Provider returns malformed JSON | Retry once with stricter prompt; if still bad, mark attempt `score_status='failed'` |
| Azure pronunciation unavailable for `fr-CA` | Fall back to `fr-FR`, log a warning, suppress phon.* tags for this attempt |
| Whisper unavailable | Use Gemini Live's live transcript (lower quality but present); flag attempt with `partial_transcription=true` |
| Rubric pass succeeds, tag pass fails | Commit scores; leave error_tags empty; flag attempt for retry |
| All passes fail | `score_status='failed'`, surfaced in review tray with "retry scoring" button |

The cost of a failed score is one user-visible error message. The cost of a silently-wrong score is a user mis-targeting their TEF prep. Always prefer the former.

## Observability

Every scorer call writes a `scoring_jobs.provider_calls` entry:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "endpoint": "messages",
  "input_tokens": 4123,
  "output_tokens": 612,
  "cached_tokens": 3200,
  "latency_ms": 4317,
  "cost_usd": 0.0019,
  "success": true
}
```

Aggregated daily into a cost+latency dashboard. Alert thresholds:
- Median scoring latency per task type > 2× baseline
- Cost-per-attempt > 1.5× baseline
- Cache hit rate < 90% (likely a prompt-shape regression)
- `score_status='failed'` rate > 1%
