# Progress Engine

The progress engine is the layer between scored attempts and the user's next action. It answers two questions:

1. **What's my current level per skill?** (CLB estimate per CO/CÉ/EO/EÉ)
2. **What should I drill next?** (next-task selection prioritized by weakness + exam goal)

It runs on every score commit. Output is cached and read on every drill request.

## Three subsystems

```
SCORED ATTEMPT
     │
     ├─→ WEAK-SPOT TRACKER     (per-tag exponential moving average)
     │
     ├─→ CLB ESTIMATOR         (per-skill rolling estimate with confidence)
     │
     └─→ NEXT-TASK SELECTOR    (queries the above on every drill request)
```

---

## Weak-spot tracker

### Goal

For each user × error tag, maintain a single number representing how often and how severely the user is making that error, weighted toward recent attempts.

### State

Stored in `user_weak_spots` (see [`02-data-model.md`](./02-data-model.md)):

```
(user_id, tag) → {
  ema_severity:  real,       // 0..1 normalized
  last_seen_at:  timestamptz,
  seen_count:    int,
  drill_count:   int,         // times explicitly drilled since first seen
  recovered_at:  timestamptz  // nullable; set when ema_severity drops
                              // below 0.15 for ≥ 3 attempts not exhibiting it
}
```

### Update rule

On every score commit, for each tag in the new attempt's `error_tags`:

```
new_severity = error_tag.severity / 3   // 1..3 → 0.33, 0.66, 1.0

ema_severity = α * new_severity + (1 - α) * ema_severity
α = 0.3   // weight on the new attempt
```

For tags **not** present in this attempt but currently active in `user_weak_spots`:

```
if attempt's task_type could have surfaced this tag:
   ema_severity = (1 - β) * ema_severity   // gentle decay on absence
   β = 0.05
```

The "could have surfaced this tag" filter prevents grammar tags from decaying when the user only does CO drills. Each tag has a `surfacing_task_types` list (from the taxonomy).

### Recovery

When `ema_severity < 0.15` and the tag was absent from the last 3 surfacing-eligible attempts, mark `recovered_at`. Recovered tags drop out of priority for next-task selection but stay in the row for trend display.

### Why EMA, not "recent error count"

- EMA captures **trajectory**, not just frequency. A user who made 5 errors a month ago and 0 last week has a low score, correctly.
- EMA is single-number summary, fast to query and reason about.
- α = 0.3 is gentle enough that one bad day doesn't dominate, aggressive enough that improvement shows up quickly.

These constants (α, β, recovery threshold) are tunable and should be revisited after 1–2 months of real user data.

---

## CLB estimator

### Goal

For each user × skill (CO, CÉ, EO, EÉ), maintain a current best estimate of their CLB level with a confidence interval. This is the headline number users see and the basis for "you're CLB 7 in CO; you need 9".

### State

`user_skill_clb` (see [`02-data-model.md`](./02-data-model.md)):

```
(user_id, skill) → {
  clb_estimate: real,       // e.g., 7.4
  confidence:  real,        // 0..1
  last_updated: timestamptz
}
```

### Inputs

For each scored attempt mapped to the skill:
- The attempt's per-criterion CLB estimates (from rubric pass)
- The attempt's overall CLB estimate (weighted average of criteria)
- The attempt's `content_item.difficulty_clb` (what level the prompt was)
- The attempt's recency

### Computation

A confidence-weighted recency-decayed mean:

```
For each attempt in the last 60 days for this skill:
  weight = recency_factor(scored_at) * difficulty_match_factor(difficulty, current_estimate)

  recency_factor = exp(-days_since / 30)
  difficulty_match_factor = exp(-|attempt_clb - difficulty_clb| / 2)
       // attempts at appropriate difficulty are most informative
       // a CLB 10 user acing a CLB 4 drill tells us little
       // a CLB 4 user attempting a CLB 10 drill is also low-signal

clb_estimate = sum(weight * attempt_clb) / sum(weight)

confidence = min(1.0, sum(weight) / TARGET_WEIGHT_SUM)
       // TARGET_WEIGHT_SUM tuned so that ~20 recent attempts → confidence 1.0
```

### MCQ (CO/CÉ) special handling

MCQ doesn't yield a per-attempt CLB estimate naturally. Instead:
- For each MCQ question answered, log (user_id, skill, difficulty_clb, correct_bool)
- Fit a simple Item Response Theory (IRT) Rasch model per skill: probability of correct = sigmoid(ability − difficulty)
- ability is the user's CLB estimate for the skill; the IRT fit gives a maximum likelihood estimate

For v1, a simpler approximation suffices:

```
For each difficulty_clb level, compute accuracy on questions at that level
Find the highest level where accuracy >= 70% → that's the CLB estimate
Confidence based on number of questions answered at that level
```

This is rougher but interpretable and ships faster. Upgrade to IRT in v2 if data quality demands.

### Why per-skill, not overall

TEF reports per-skill scores, and CRS points are awarded per-skill (with caveats). Users care about the weakest skill that's blocking their CRS target. A single overall CLB hides what to work on.

---

## Next-task selector

### Goal

Given a user opening a drill, return one `content_item` to attempt. Must be:
- At appropriate difficulty (not too easy, not crushing)
- Targeting the user's weak spots when possible
- Not recently attempted (variety)
- Of the right task type if user filtered

### Algorithm

Pseudocode:

```
function selectNextTask(user_id, task_type | null, mode):
  user = users[user_id]
  weak_spots = top_k_weak_spots(user_id, k=10)   // by ema_severity desc
  skill = task_type ? task_type.skill : user_weakest_skill_relative_to_target(user_id)
  current_clb = user_skill_clb[user_id, skill].clb_estimate
  target_clb = clamp(current_clb + 0.5, user.target_clb)
       // drill slightly above current level if that's still below target

  candidates = content_items
    .where(task_type ? = task_type : skill = skill)
    .where(difficulty_clb between target_clb - 1 and target_clb + 1)
    .where(retired_at is null)
    .where(quality_score >= 0.4)
    .where(not in recent_attempts(user_id, last_n=20))

  for c in candidates:
    c.score = base_score
            + (overlap(c.tags, weak_spots) * weak_spot_bonus)
            + (random_jitter)
            + (curriculum_bonus_if_mock_practice_due)

  return candidates.top(1)
```

### Mock exam selection

Different selector entirely:
- Pulls one item per required section (per the user's variant)
- Difficulty centered on user's current CLB per skill
- All items must be from the user's last-attempted-mock-or-later (no repeats within a mock cycle)
- Returns an ordered list, not single item

### Caching

The selector query is hot — it runs on every "next drill" click. Cache strategy:

- Per-user **candidate set** cached in Redis with 1-hour TTL
- Invalidated on: new score commit, weak_spot update, content_items refresh
- The randomized pick happens uncached (so two adjacent clicks return different items)

A cache miss is fine (Postgres query is ~20ms with proper indexes). Goal of caching is to amortize during heavy drill sessions, not to enable scale we don't have.

---

## Spaced repetition over weak spots

This isn't classical SRS (Anki-style) on individual items. It's SRS on **error tags**.

### Drill scheduling

For each `user_weak_spots` row:

```
priority = ema_severity * recency_factor * not_recently_drilled_factor

next_drill_due_at = computed from:
  - drill_count (more drilled → longer interval)
  - last seen-not-erred (good signs → push out next review)
  - last drilled (just drilled → cool down)
```

The next-task selector uses `priority` as `weak_spot_bonus` weight. Tags due for drill rise to the top.

### Tag-targeted content

The system needs to be able to surface a drill **specifically targeting** a tag. For each tag in the taxonomy:

- `surfacing_task_types`: which task types can exhibit it
- `targeted_content_filter`: a content_items query that yields items likely to expose it (e.g., for `gram.tense.subjunctive_après_que`, filter to EÉ-B scenarios with `triggers_subjunctive=true` topic tags)

This means the taxonomy and the content library are coupled. Tagging content with `triggers_*` flags is a content-authoring concern.

### Minimum drill interval

A user shouldn't see the same tag 3 drills in a row. Each tag has a `min_drill_interval` of 2 attempts. The selector enforces this.

---

## Surfacing to the user

The progress engine produces three views surfaced in the UI:

### 1. Skill dashboard

Per skill: current CLB estimate, target CLB, distance to target, confidence band, sparkline over last 4 weeks.

```
CO   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○━━━━━━━━●  current 7.2 → target 9
CÉ   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○━━●  current 8.4 → target 9
EO   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━○━━━━━━━━━━━●  current 6.8 → target 9
EÉ   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○━━━━━━●  current 7.5 → target 9
```

### 2. Top weaknesses list

Five most active tags (by `ema_severity * surfacing_eligibility`) with:
- Plain-language description
- Example from a recent attempt
- "Drill this" button → next-task selector with this tag pinned

### 3. Estimated test readiness

If `users.target_test_at` is set: a banner like "At current pace, you'll reach CLB 9 in EO around mid-July. Test is in early August." Computed from the slope of recent CLB estimates.

This is **soft prediction**, not a guarantee. It's clearly labeled as such. Surfacing it is honest and motivating; presenting it as fact would be irresponsible.

---

## Edge cases

- **New user, no attempts.** All CLB estimates start `null` with confidence 0. Selector gives them an entry-level diagnostic across all skills (1 task per skill, mid-CLB difficulty). After diagnostic, real selection kicks in.
- **User has no weak spots yet.** Selector falls back to "any item at appropriate difficulty, prioritize variety across topics."
- **Stagnant user (no progress for 3 weeks).** Surface a "let's try a different approach" UI suggesting harder drills or a focused weakness sprint.
- **User regression (CLB estimate drops).** Track separately; if it drops > 1 CLB and confidence is high, surface a gentle prompt ("recent attempts have been harder for you — review week, or push through?").
- **Mock test conflict.** If the user is mid-mock, drill selector is disabled in favor of mock progression.
