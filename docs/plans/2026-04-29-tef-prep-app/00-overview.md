# TEF Prep App — Overview

## What we're building

A web app (later PWA / mobile) that prepares users for the **TEF** family of French exams through structured drills, mock exams, and rubric-based AI scoring with detailed feedback.

The app is **exam-prep first, conversation second.** Free conversation is not a goal. Every interaction maps to a real TEF task type, is timed and formatted exactly as the test, and is scored against the published TEF rubrics with CLB/NCLC mapping.

## Supported variants

All variants share the same six task types; variants differ only in which sections are required and how scores map.

| Variant | Required sections | Used for |
|---|---|---|
| **TEF Canada** | CO, CÉ, EO, EÉ | Express Entry / PR (CRS points) |
| **TEFAQ** | EO, EÉ (CO/CÉ optional) | Québec immigration (CSQ) |
| **TEF Naturalisation** | EO, EÉ (B1 bar) | French citizenship |
| **TEF Études / TEF général** | All four | University / general use |

## Target user

Adult learners preparing for a TEF exam in 1–6 months, A2–C1 baseline, motivated by an external deadline (immigration, citizenship, study). They are willing to do timed practice and want **honest, calibrated feedback**, not encouragement.

## Success criteria

The app is successful when:

1. **Score predictions are calibrated.** App's CLB estimate per skill is within ±1 CLB of the user's eventual real TEF score. Measured by Cohen's kappa ≥ 0.7 between app scoring and hand-grading on a held-out set of TEF-style responses.
2. **Practice volume.** A motivated user can complete ≥ 30 graded attempts per week without content repetition.
3. **Feedback is actionable.** Every scored attempt produces at least 3 specific, tagged improvement items linked to the user's weak-spot profile.
4. **Latency is invisible.** Drill-to-drill flow has no waits > 2s. Scoring runs async; users move on while previous attempts grade.

## Explicit non-goals

These are deliberately out of scope. They will be tempting; resist.

- **Free conversational practice.** Out. Use Pimsleur / italki / a real tutor.
- **General French tutoring** (grammar lessons, vocabulary flashcards, etc.). Out. Plenty of apps do this.
- **DELF/DALF/TCF prep.** Out for v1. Different rubrics, different scoring, different task formats. Could be added later by reusing the task-engine architecture.
- **Real-time pronunciation coaching mid-utterance.** Out. Pronunciation feedback is delivered post-attempt, not as the user speaks.
- **Native mobile app at v1.** Web/PWA only. Native iOS/Android comes after product validation.
- **Multi-user features** (study groups, leaderboards, social). Out indefinitely.

## Glossary

| Term | Meaning |
|---|---|
| **TEF** | Test d'Évaluation de Français — administered by CCI Paris Île-de-France |
| **TEF Canada** | TEF variant accepted by IRCC for Express Entry and PR |
| **TEFAQ** | TEF pour l'accès au Québec — for Québec immigration |
| **CO** | Compréhension orale — listening comprehension (MCQ) |
| **CÉ** | Compréhension écrite — reading comprehension (MCQ) |
| **EO** | Expression orale — speaking (Section A: get info; Section B: convince) |
| **EÉ** | Expression écrite — writing (Section A: 80-word news brief; Section B: 200-word argumentative letter) |
| **CLB** | Canadian Language Benchmarks — 1–12 scale, English label |
| **NCLC** | Niveaux de compétence linguistique canadiens — 1–12 scale, French label, equivalent to CLB |
| **CRS** | Comprehensive Ranking System — Express Entry points |
| **IPA** | International Phonetic Alphabet — used for phoneme-level pronunciation scoring |
| **VAD** | Voice Activity Detection — detects start/end of speech |
| **EMA** | Exponential Moving Average — used for weak-spot tracking |
| **kappa** | Cohen's kappa — inter-rater agreement statistic; measures scorer calibration |

## Document map

This design is split across nine files. Read in order for full context, or jump to the file relevant to the component you're touching.

- [`00-overview.md`](./00-overview.md) — this file
- [`01-architecture.md`](./01-architecture.md) — system architecture, tech stack, latency budgets
- [`02-data-model.md`](./02-data-model.md) — Postgres schema, error-tag taxonomy
- [`03-task-types.md`](./03-task-types.md) — the six TEF task specs
- [`04-scoring-pipelines.md`](./04-scoring-pipelines.md) — how each task type is graded
- [`05-content-strategy.md`](./05-content-strategy.md) — rubrics, exemplars, generation, calibration
- [`06-voice-layer.md`](./06-voice-layer.md) — real-time voice for EO-A, TTS for CO
- [`07-progress-engine.md`](./07-progress-engine.md) — weak-spot tracking, CLB estimation, task selection
- [`08-roadmap.md`](./08-roadmap.md) — v1 scope, deferred work, open questions
