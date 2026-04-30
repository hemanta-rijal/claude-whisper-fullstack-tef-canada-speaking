# Content Strategy

The infrastructure described in [`01-architecture.md`](./01-architecture.md) is commodity. The competitive moat — and the difference between a useful TEF prep app and a confidently-wrong one — is here: rubrics, exemplars, and the calibration loop that connects them.

## The three content asset classes

```
┌────────────────────────────────────────────────────────────┐
│ 1. RUBRICS         (~6 documents, ~30K tokens total)       │
│    Encoded TEF scoring criteria. Built once, locked.       │
│    Versioned. Re-calibrated only on rubric or model change.│
├────────────────────────────────────────────────────────────┤
│ 2. EXEMPLAR BANK   (~150 items)                            │
│    Hand-curated reference responses at known CLB levels.   │
│    Used as few-shot calibration in scoring prompts.        │
├────────────────────────────────────────────────────────────┤
│ 3. PROMPTS / PASSAGES  (large, growing)                    │
│    Generated + curated test items. The library users       │
│    interact with daily.                                    │
└────────────────────────────────────────────────────────────┘
```

These have **very different lifecycles, costs, and risk profiles.** Conflating them is the most common mistake in AI-grading apps.

---

## Rubrics

### What they are

A `rubrics` row encodes how a particular task type is scored, broken into criteria, with anchored level descriptors. The structure mirrors what real TEF examiners use, adapted for LLM consumption.

### Per-criterion structure

```json
{
  "criterion": "grammatical_accuracy",
  "weight": 0.25,
  "scale": {
    "CLB_4": "Frequent errors in basic agreement (gender, number) and verb conjugation. Errors often obscure meaning. Limited to present tense and a few common past tense forms. Subjunctive absent or always wrong.",
    "CLB_6": "Generally correct in simple structures. Errors emerge when attempting complex tenses or subordination. Subjunctive attempted in obvious triggers (il faut que) but often misformed. Past participle agreement inconsistent.",
    "CLB_7": "Confident in compound tenses and most subordination. Subjunctive used correctly after standard triggers. Errors are noticeable but rarely impede meaning. Pronoun placement mostly correct.",
    "CLB_9": "Errors are rare and minor. Uses subjunctive correctly in less-obvious triggers (bien que, à condition que). Complex relative clauses (dont, ce que). Agreement is reliable.",
    "CLB_11": "Near-native control. Errors only at the edges (rare lexicalized exceptions, archaic forms). Stylistic variety in syntactic choices."
  },
  "evidence_required": [
    "count_errors_by_type",
    "complexity_attempted_vs_avoided",
    "subjunctive_use_audit",
    "agreement_audit"
  ],
  "common_failure_modes": [
    "Strong lexicon masks grammatical gaps — score lexicon and grammar independently",
    "Avoidance is not accuracy — penalize complete avoidance of complex structures at higher CLB targets",
    "One severe systemic error (e.g., never conjugates auxiliaries) outweighs many minor ones"
  ],
  "score_to_clb_mapping": {
    "0.0-0.2": 4, "0.2-0.4": 6, "0.4-0.6": 7, "0.6-0.8": 9, "0.8-1.0": 11
  }
}
```

### The `evidence_required` field is the most important part

Without it, LLMs grade vibes ("this sounds B2-ish"). With it, they're forced into structured analysis before scoring. We require the LLM to **emit the evidence** in its JSON output, then derive the score from the evidence in a second deterministic step where possible.

For example, `grammatical_accuracy` evidence:

```json
{
  "errors_by_type": {
    "agreement_gender": 2,
    "agreement_number": 0,
    "tense_subjunctive": 1,
    "tense_other": 0,
    "preposition": 1
  },
  "complexity_attempted": ["compound_past","conditional","relative_clause_dont"],
  "complexity_avoided": ["subjunctive","passive"],
  "subjunctive_use": {"correct": 0, "incorrect": 1, "missed_required": 2},
  "score_rationale": "..."
}
```

Then the score is computed from a calibrated formula on this evidence — not asked from the LLM directly. This **decouples the scoring scale from LLM idiosyncrasies** and lets us tune the formula post-hoc without re-running the LLM passes.

### Locking and versioning

Rubrics are immutable once locked. To change a rubric:

1. Branch the rubric: `version: "1.2.0"` → working draft `1.3.0-draft`
2. Run the calibration loop (below) on the draft
3. If kappa ≥ target on held-out set, lock and migrate
4. Existing scores remain tied to the rubric version they used; do not retro-rescore

This protects historical data integrity. A user looking at their CLB trajectory should see consistent grading, not a rubric upgrade discontinuity.

---

## Exemplar bank

### Purpose

Few-shot calibration. The rubric defines the scale; the exemplars show the LLM what each level **actually looks like** in real student responses.

### Composition (target for v1)

| Task type | Exemplars per CLB level | Levels covered v1 | Total |
|---|---|---|---|
| EÉ-A | 6 | 6, 9 | 12 |
| EÉ-B | 6 | 6, 9 | 12 |
| EO-A | 6 | 6, 9 | 12 |
| EO-B | 6 | 6, 9 | 12 |
| **v1 total** | | | **48** |

v2 expands to CLB 4, 7, 11 across all task types → ~150 exemplars total.

### Exemplar shape

```json
{
  "id": "ex-eeb-clb9-003",
  "task_type": "EE_B",
  "clb_level": 9,
  "scenario_id": "scenario-noisy-neighbor",
  "response_text": "...",
  "scores_per_criterion": {
    "coherence": 0.75,
    "grammatical_accuracy": 0.72,
    "lexical_range": 0.78,
    "register": 0.85,
    "argumentation": 0.70,
    "format": 1.0
  },
  "reasoning_per_criterion": {
    "coherence": "Clear thesis, two well-developed arguments, but the conclusion repeats the introduction without advancing...",
    "grammatical_accuracy": "Subjunctive used correctly twice (bien qu'il, afin que). One past participle agreement error...",
    "...": "..."
  },
  "annotations": [
    {"span":[45,67], "note":"Strong opening — explicit position stated"},
    {"span":[120,134], "note":"Subjunctive correctly triggered"},
    {"span":[201,225], "note":"Slight register slip toward casual"}
  ]
}
```

### How exemplars get into prompts

The rubric pass prompt structure:

```
[CACHED] system: rubric for EÉ-B
[CACHED] EXEMPLAR 1 (CLB 6): {exemplar.response_text} → {exemplar.scores}
[CACHED] EXEMPLAR 2 (CLB 9): {exemplar.response_text} → {exemplar.scores}
[CACHED] EXEMPLAR 3 (CLB 11 — when available): ...
[CACHED] OUTPUT FORMAT: strict JSON
[FRESH] USER RESPONSE: {response_text}
```

Three exemplars per call — enough to anchor the scale, few enough to keep the cached block under ~8K tokens.

Exemplars are rotated per scenario when possible (use exemplars from a *different* scenario than the one being scored, to prevent the LLM from copying scoring without analyzing).

### Where exemplars come from

This is the hard, expensive, irreplaceable part.

1. **Seed from books.** Buy ~$200 of TEF prep books (`Réussir le TEF`, `ABC TEF Canada`, `Préparation au TEF`, `Le TEF Canada — 250 exercices`). They contain scored sample responses with examiner commentary. Digitize them as the starting exemplar bank.

2. **Hand-grade real student writing.** Recruit 20–30 French learners across CLB 4–11 to write responses. Hand-grade each (ideally with a French teacher's input — a few hours of paid review is high-leverage). These become the most authentic exemplars.

3. **Generate-then-filter (low priority).** Claude can write responses *targeting* a CLB level, but generated exemplars systematically miss the texture of real learner errors (overly clean grammar, plausible-but-non-existent collocations). Use only as a last resort and never without human review.

---

## Prompts / passages (the user-facing library)

This is the asset class users see directly. Variety and difficulty calibration matter more than any individual item being perfect.

### Generation pipeline

```
SEED (themes, scenarios, fact-sheet templates) ─→
  CLAUDE GENERATION (per task type) ─→
    AUTO-VALIDATION (format, word count, MCQ ambiguity) ─→
      QUALITY FILTER (LLM-as-judge or human spot-check) ─→
        CONTENT_ITEMS table (with quality_score)
```

### Per-task generation specifics

**CÉ passages**
- Generator prompt: produce a {register} {document_type} on {topic} of ~{word_count} words at {difficulty_clb}, then 5 MCQ questions covering literal/inference/vocab/tone with one obvious distractor and one near-miss distractor per question
- Auto-validation: word count in range, all 4 options different, exactly one correct
- Quality filter: another LLM call simulates a CLB 11 reader; if any question has multiple defensible answers, reject

**CO passages**
- Generator produces script + speaker tags + scenario
- Pre-process to TTS via Gemini Flash TTS (or ElevenLabs for accent variety / café-noise scenarios)
- Mix in background noise via FFmpeg pipeline at content-authoring time
- Same MCQ generation + validation as CÉ

**EÉ-A facts**
- Generator produces 5–7 fact bullets on a current-events-flavored topic
- Constraint: facts must be self-contained, factually internally consistent, and span enough to require integration (not just listing)
- No quality-filter pass — these are simple

**EÉ-B scenarios**
- Generator produces a situation paragraph + addressee + register
- Constraint: scenario must be argumentative (have a defensible position), not informational
- Manually curated for v1 — scenarios are few enough (~50) that hand-writing yields better quality than generation

**EO-A scenarios**
- Hand-write the `info_to_obtain` list (5 items)
- Generator fills in the `interlocutor_persona.facts` to be consistent and internally answerable
- Persona "behavior" instructions are templated (a small set of personas that vary by formality and helpfulness)

**EO-B scenarios**
- Generator produces a situation requiring persuasion
- Constraint: clear addressee, clear position to take, room for argumentation
- Hand-curated for v1

### Difficulty calibration

A generated content item is tagged with target `difficulty_clb` via the generator prompt, but the *actual* difficulty is only known after users attempt it. We use **post-hoc difficulty calibration**:

- After ~20 attempts, compute the mean CLB estimate of users who got the question right vs wrong (for MCQ) or the correlation of attempt scores with the user's prior CLB estimate (for written/spoken)
- Update `content_items.difficulty_clb` accordingly
- Items with high variance or unusual difficulty curves are flagged for review

### Content quality decay

Generated content has a half-life. Even good filters miss issues. We track:

- Items where the AI scorer's CLB estimate is consistently far from the user's running CLB → likely a poorly-calibrated item
- Items with high disagreement between repeat attempts by the same user → ambiguous

These get retired or hand-fixed.

---

## The calibration loop (non-negotiable)

This is the difference between an app that helps users and one that misleads them.

### What we calibrate

Two distinct things, often confused:

1. **Scorer-vs-human agreement** — does our LLM rubric pass score the same response the same way a human TEF examiner would?
2. **CLB-estimate-vs-test-outcome** — does a user's app-estimated CLB match their eventual real TEF score?

Both matter. (1) is a precondition for (2).

### The (1) loop — scorer calibration

Per task type, run this loop until kappa ≥ 0.7 vs hand-grading on a held-out set.

```
1. Hand-grade ~30 responses per task type using the actual TEF rubric.
   Two graders independently; resolve disagreements.
   (Time investment: ~10 hours per task type for v1)

2. Run the LLM scorer over the same set with current rubric+exemplars.

3. Per criterion, compute Cohen's kappa between LLM and human.

4. For each low-kappa criterion:
   - Inspect disagreements
   - Adjust rubric scale text or evidence_required
   - Add/swap exemplars to better anchor
   - Re-run

5. When all criteria ≥ 0.7 kappa: lock the rubric version.

6. Hold out 10 of the 30 as a regression set. Re-run on every:
   - Rubric change
   - Model upgrade (Claude version bump)
   - Exemplar swap
```

**Acceptance bar: kappa ≥ 0.7 across all criteria for all task types.** Below that, the app is not ready to ship for that task type.

### The (2) loop — outcome calibration

Only possible after launch with users who take real TEFs.

- Users who take a real TEF can input their official scores into the app
- We compare app's pre-test CLB estimate to actual TEF score
- Track Mean Absolute Error per skill, surfaced as a public-ish metric ("our CLB estimates are within ±X of real test outcomes for Y% of users")
- This is the **honesty metric**. Surfacing it is the difference between marketing and a product worth recommending.

### Re-calibration triggers

Re-run the (1) loop when any of:
- LLM provider model version changes (Claude X.Y → X.Z)
- Rubric edit
- Exemplar bank changes (>10% rotation)
- Three or more user complaints about scoring on the same criterion
- Quarterly check-in regardless

Re-calibration cost: ~2–4 hours of human grader time + ~$5 in LLM calls. Cheap enough to do often.

---

## Authoring tooling

Rubrics, exemplars, and content items live in code/files for v1, not the database (database is the deployment target, not the source of truth).

```
content/
├── rubrics/
│   ├── EE_A_v1.0.0.yaml
│   ├── EE_B_v1.0.0.yaml
│   └── ...
├── exemplars/
│   ├── EE_B/
│   │   ├── ex-eeb-clb6-001.md
│   │   └── ex-eeb-clb9-001.md
│   └── ...
├── error_tags.yaml          # the canonical taxonomy
└── content_items/
    ├── CE/                  # generated, machine-managed
    └── EE_B_scenarios/      # hand-curated
```

A `pnpm content:sync` task ingests these into Postgres, runs validation (rubric schema, taxonomy membership, exemplar JSON shape), and reports diffs.

A `pnpm content:calibrate <task_type>` task runs the calibration loop end-to-end against the held-out set and reports kappa.

These are first-class developer experiences, not afterthoughts. The content team (= you, for now) lives in these tools.
