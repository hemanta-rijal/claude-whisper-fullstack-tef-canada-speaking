# Roadmap

This document is the bridge from design to implementation. It defines what ships in v1, what's deferred, and what unanswered questions need decisions before we cut code.

It is **not** a project plan with dates. Dates depend on hours/week available, which depends on you. It is a dependency graph and a scope contract.

---

## v1 — minimum useful product

The bar for v1: **a TEF candidate could replace 30% of their paid prep with this app and not regret it.** Anything below that bar is not v1.

### v1 scope

#### Core flows (all required)

- [ ] User signup, set target variant + target CLB + (optional) test date
- [ ] Initial diagnostic (1 task per skill, score within 5 minutes of completion)
- [ ] Drill mode: next-task selector → attempt → submit → "scored" notification
- [ ] Review mode: see scored attempt with rubric breakdown + tagged errors
- [ ] Skill dashboard with current CLB per skill + target gap
- [ ] Top weaknesses list (5 active tags) with "drill this" button
- [ ] Mock exam mode for one variant (TEF Canada, since it has all four sections)

#### Task types (all six in v1)

- [ ] CÉ — reading + MCQ
- [ ] CO — listening + MCQ
- [ ] EÉ-A — news brief
- [ ] EÉ-B — argumentative letter
- [ ] EO-A — interactive dialogue (the only live-voice task)
- [ ] EO-B — persuasive monologue

Skipping any task type breaks the value prop. Better to ship with thin content per type than to ship 4 task types fully fleshed out.

#### Content baseline

| Asset | v1 minimum |
|---|---|
| Rubrics (all 6 task types, locked v1.0) | 6 |
| Exemplars per task type per CLB level | 6 at CLB 6, 6 at CLB 9 |
| CÉ passages | 30 (≥ 5 questions each = 150 questions) |
| CO passages | 30 (≥ 5 questions each = 150 questions) |
| EÉ-A scenarios | 50 |
| EÉ-B scenarios | 50 |
| EO-A scenarios | 30 |
| EO-B scenarios | 50 |
| Error-tag taxonomy | full ~150 tags, locked |

#### Calibration

- [ ] All 6 task type scorers achieve **kappa ≥ 0.7** on hand-graded held-out set (10 items per task type)
- [ ] Calibration dashboard with rolling kappa visible to operator (you)

#### Operational

- [ ] Cost+latency observability dashboard
- [ ] Audit log of all scoring jobs with provider call breakdown
- [ ] Audio retention/deletion policy implemented (90-day default purge)
- [ ] Rate limit handling per provider
- [ ] Failed-attempt retry UX

### v1 explicitly NOT included

- Native mobile apps (web/PWA only)
- Multiple variants surfaced simultaneously (only TEF Canada mock; users can pick variant for drill but mock is one variant)
- Spaced repetition full algorithm (basic priority sort is enough; full SRS in v2)
- IRT model for MCQ ability estimation (use rough "highest level at 70% accuracy" approximation)
- Premium subscription tiers (one tier or free for v1)
- Sharing / social features
- Custom rubric weights per user
- Push-to-talk on mobile (desktop only for v1)
- Real test outcome calibration loop (requires post-launch data)

---

## v2 — what ships after validation

Triggered when v1 has ~50+ active users and at least 5 have taken real TEFs.

- [ ] Native mobile apps (React Native or wrap PWA)
- [ ] Full SRS over weak spots
- [ ] IRT-based CLB estimation for MCQ
- [ ] Test outcome calibration loop with public-ish accuracy metric
- [ ] Exemplar bank expansion to CLB 4, 7, 11
- [ ] More variants in mock mode (TEFAQ, Naturalisation)
- [ ] Push-to-talk mobile support
- [ ] Multiple voices / accent variety in CO content
- [ ] User-configurable VAD timing
- [ ] PDF mock exam reports (currently in-app only)
- [ ] Email notifications for scored attempts and progress milestones

---

## Deferred indefinitely

Tempting features that we explicitly defer until proven necessary:

- DELF / DALF / TCF support (different rubrics, separate product)
- Free conversational practice (out of scope, see overview)
- Tutor marketplace integration
- Group / classroom features
- AI-generated personalized study plans (the next-task selector is the v1 substitute)
- Custom error tag creation by users
- Browser extension or other surfaces

---

## Component build order

A dependency-aware sequence. Bold = build before anything else needs it.

```
Foundation
  ├─ [1] Postgres schema + migration tooling
  ├─ [2] Auth + user model
  └─ [3] Error-tag taxonomy (YAML + validation)

Content authoring
  ├─ [4] Rubric YAML format + ingestion (`pnpm content:sync`)
  ├─ [5] Exemplar bank seeded from books — minimum 6 per task type per level
  └─ [6] Initial content generation pipeline + curation tools

Scoring (in parallel by task type)
  ├─ [7]  CÉ/CO MCQ pipeline (deterministic)
  ├─ [8]  EÉ-A scoring pipeline (writing rubric + tags + fact coverage)
  ├─ [9]  EÉ-B scoring pipeline (writing rubric + tags + required elements)
  ├─ [10] EO-B scoring pipeline (Whisper + Azure + LLM rubric/tags)
  └─ [11] EO-A scoring pipeline (above + interlocutor analysis)

Calibration loop
  ├─ [12] Hand-grading tooling (CLI to score and compare to LLM output)
  ├─ [13] Kappa computation + dashboard
  └─ [14] Iterate rubrics + exemplars to kappa ≥ 0.7

Progress engine
  ├─ [15] Weak-spot tracker (EMA updates on score commit)
  ├─ [16] CLB estimator per skill
  └─ [17] Next-task selector

Voice (parallel with scoring)
  ├─ [18] CO TTS authoring pipeline
  ├─ [19] EO-B recording UI + upload
  └─ [20] EO-A live session (Gemini Live integration)

Frontend
  ├─ [21] Drill flow (next → attempt → submit → review)
  ├─ [22] Skill dashboard + weaknesses
  ├─ [23] Mock exam mode
  └─ [24] Settings, account, audio purge controls

Operational
  ├─ [25] Observability (Sentry, PostHog, cost dashboard)
  ├─ [26] Rate limit + retry handling
  └─ [27] Audio retention purge job
```

The big question is order between scoring and content. They have a chicken-and-egg: scoring needs exemplars to calibrate; calibration is content work. Build them in lockstep — start with EÉ-B (highest content value) and complete its scoring + calibration end-to-end before moving to the next task type. This proves the loop works on one task type before scaling.

---

## Open questions (must answer before cutting code)

1. **Hosting target.** Vercel + Neon + Upstash + R2? Or one VPS + self-hosted Postgres? Affects cost model and ops burden. **Lean: Vercel + Neon + Upstash + R2 for v1.**

2. **Auth provider.** Auth.js / Clerk / Supabase Auth / hand-rolled? **Lean: Auth.js with email magic links — minimal vendor lock-in, free, well-documented.**

3. **Payment.** Free for v1 or Stripe from day one? **Lean: free for v1; gate behind a beta invite to control volume; add Stripe in v2 once retention is real.**

4. **Domain.** Buy something now? Affects user trust on signup. Cheap; do early.

5. **French teacher or examiner partnership.** ~10 hours of paid review on hand-graded exemplars dramatically improves calibration. Find a TEF examiner via fiverr / online tutor platforms. **Action: post outreach in week 1.**

6. **Books to digitize first.** `Réussir le TEF` (CLE International) and `ABC TEF Canada` (CLE) are the standard texts. Order both. Their sample tasks become the seed exemplar bank.

7. **`fr-FR` vs `fr-CA` default.** TEF Canada users probably want fr-CA voices and pronunciation; TEFAQ users definitely want fr-CA. But Azure fr-CA is reportedly weaker. **Lean: default to fr-FR for pronunciation scoring even for Canadian users; default to fr-CA voices for TTS where the scenario is a Canadian context. Make both configurable in settings.**

8. **Mock exam timing — strict or flexible?** Real TEF is rigid (5 min EO-A, audio-once-only CO, etc.). Should our mock be rigid? **Lean: yes, rigid by default with a "practice mock" option that allows pauses. Strict is the only useful preparation for the real timing experience.**

9. **Free-tier abuse.** What stops someone from signing up infinite emails to get unlimited free scoring? **Lean: rate limit by IP + require email verification + cap free attempts/month. Solve properly when there's a real signup volume.**

10. **What's the public marketing claim?** Once kappa is measured and outcome calibration starts producing data, what do we tell prospective users about scoring accuracy? **Action: hold off on any explicit accuracy claims until 100+ real-test outcomes are logged. Until then, market on "structured practice in real TEF format with detailed feedback" — no precision claims.**

---

## Acceptance gates per phase

### Gate 1 — "scoring works for one task type" (EÉ-B end-to-end)

- Rubric v1.0 locked
- 12 exemplars (6 each at CLB 6 and 9)
- 50 EÉ-B scenarios in content_items
- Scoring pipeline fully implemented
- Hand-graded held-out set of 10 items
- Kappa ≥ 0.7 across all criteria
- Cost-per-attempt ≤ $0.005 with caching
- Latency ≤ 10s p95

If we can't hit this gate on EÉ-B, the whole approach is questionable and we should reassess before continuing.

### Gate 2 — "all task types scoring"

Repeat gate 1 for all six task types. Total ~6× the time of gate 1, parallelizable somewhat.

### Gate 3 — "drill flow shippable"

- Frontend drill loop complete
- Skill dashboard rendering real data
- Weak-spot list working
- Mock exam mode for TEF Canada

### Gate 4 — "v1 launch"

- All gates 1–3 met
- Observability live
- Audio retention policy implemented
- Calibration dashboard tracking rolling kappa
- 5+ alpha testers have completed at least 3 mock exams without showstopper bugs

---

## What success looks like 3 months post-launch

- 100+ users with at least 10 attempts each
- Median kappa ≥ 0.75 across task types (better than v1 bar)
- At least 10 users have taken real TEFs and reported scores
- Mean Absolute Error of app CLB estimate vs real TEF score ≤ 1.0 CLB per skill
- Cost per active user per month < $1
- One actionable testimonial per task type ("the EÉ-B feedback caught a register issue I'd been making for weeks")

If those numbers hold, the product works. If MAE is > 1.5 CLB, we have a calibration problem that re-runs the loop. If kappa is fine but MAE is bad, we have a content difficulty problem.

---

## What kills this project (failure modes)

Be honest about these now:

1. **Calibration never reaches kappa 0.7.** If after iterating rubrics + exemplars + model choice, we can't reach the bar, the LLM-grading approach for TEF is wrong and we need a fundamentally different scoring strategy (e.g., human-in-the-loop).
2. **Real TEF scores diverge from app estimates.** Even with high kappa vs hand-grading, if real-test outcomes don't track, our hand-grading is the problem — we're calibrating to the wrong target.
3. **Content quality plateaus.** Generated CÉ passages are mediocre and users notice. Hand-curating won't scale to the volume we need. **This is the most likely actual failure mode.** Mitigation: invest heavily in the post-hoc difficulty + quality calibration loop, retire bad content aggressively.
4. **EO-A live experience is broken** — VAD timing wrong for learners, or Gemini Live's French quality unreliable. Mitigation: have OpenAI Realtime fallback ready behind a feature flag.
5. **Cost runs away.** We model $0.20/user/week; reality is $2/week. Mitigation: prompt caching is the lever; track hit rate aggressively; if it sustains < 90%, prompts have drifted and need re-shaping.
