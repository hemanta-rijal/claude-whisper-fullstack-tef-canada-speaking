# Architecture

## High-level shape

Three-layer pipeline split by latency budget. Each layer has a different performance target and uses different infrastructure.

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Next.js PWA)                                           │
│  Modes: Drill | Mock Exam | Review                               │
│  Audio: WebRTC for EO-A only; HTML5 audio elsewhere              │
└────────────────────────────┬─────────────────────────────────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
  ┌──────────┐       ┌──────────────┐      ┌──────────────┐
  │ INTERACT │       │   CAPTURE    │      │   FETCH      │
  │  <500ms  │       │   <100ms     │      │   <100ms     │
  ├──────────┤       ├──────────────┤      ├──────────────┤
  │ Gemini   │       │ Direct upload│      │ Next task    │
  │ Live     │       │ to S3/R2     │      │ from content │
  │ for EO-A │       │ for EO/EÉ    │      │ + weak-spot  │
  │ only     │       │ submissions  │      │ selector     │
  └────┬─────┘       └──────┬───────┘      └──────┬───────┘
       │                    │                     │
       └────────────────────┼─────────────────────┘
                            ▼
                ┌────────────────────────┐
                │   SCORING WORKERS      │  async, 5–20s
                │   (queue: BullMQ)      │
                ├────────────────────────┤
                │ • Whisper STT (EO)     │
                │ • Azure Pronunciation  │
                │ • Claude rubric pass   │
                │ • Error-tag pass       │
                │ Run in parallel, then  │
                │ merge into score row   │
                └────────────┬───────────┘
                             │
                             ▼
                ┌────────────────────────┐
                │   PROGRESS ENGINE      │  fires on score commit
                ├────────────────────────┤
                │ • Update weak-spot EMA │
                │ • Recompute CLB/skill  │
                │ • Invalidate next-task │
                │   selector cache       │
                └────────────────────────┘

  Postgres (source of truth)  │  Redis (hot path: session state, selector cache)
  S3/R2 (audio blobs)         │  BullMQ (scoring queue)
```

## Latency budgets

These are non-negotiable; the architecture is shaped to hit them.

| Path | Budget | What it covers |
|---|---|---|
| Click "next drill" → drill rendered | < 500ms | Selector query, content fetch, render |
| Submit answer → see "scoring..." | < 200ms | Upload audio/text, enqueue job |
| Scoring job completes (writing) | 5–10s | LLM rubric + error tags in parallel |
| Scoring job completes (speaking) | 10–20s | + STT + Azure pronunciation |
| EO-A live turn (mic stop → AI speaks) | < 700ms | VAD + Gemini Live round-trip |
| Mock exam end → full report ready | < 60s | All sections graded in parallel |

The **submit-then-move-on** pattern is the single most important UX choice. Users do not wait for scoring; they queue up the next task. Scores arrive as notifications/badges in a "to review" tray.

## Tech stack

### Frontend

- **Next.js 15 (App Router)** — server components for fast initial load, RSC for the drill picker, client components for the live audio surfaces. Use [`next-best-practices`](https://docs.example) patterns.
- **TypeScript, strict mode**.
- **Tailwind + shadcn/ui** — fastest path to a clean exam-style UI without bikeshedding.
- **Zustand** for client state during a session (timer, draft response, audio buffer). Server state via TanStack Query.
- **WebRTC** native browser API for EO-A. Audio elements + `MediaRecorder` for EO-B/CO playback and recording.

### Backend

- **Next.js API routes / Server Actions** for thin CRUD and session state.
- **Node worker process** (separate deploy) for scoring jobs. Pulls from BullMQ. Concurrency tuned per provider rate limits.
- **Postgres 16** (Neon or Supabase) — source of truth. JSONB for rubric/criteria/evidence.
- **Redis** (Upstash) — session state, next-task selector cache, BullMQ broker.
- **S3 / Cloudflare R2** — audio blobs (user submissions, generated CO TTS audio).

### AI providers

| Use | Provider | Why |
|---|---|---|
| EO-A live dialogue | **Gemini Live (3.1 Flash)** | ~10x cheaper than OpenAI Realtime, 24h session resume, 300–500ms latency, natural-language prosody control. See [`06-voice-layer.md`](./06-voice-layer.md). |
| EO transcription (EO-B + EO-A logs) | **Whisper-large-v3** via Groq or OpenAI | Cheapest reliable French STT; word-level timestamps for alignment with phoneme scores. |
| Pronunciation scoring | **Azure Speech Pronunciation Assessment** (`fr-FR`) | Only mainstream provider with phoneme-level IPA scoring for French. Limitations: prosody/content scoring is en-US only — we work around with LLM. |
| Writing & speaking content scoring | **Claude (Sonnet/Opus class)** | Best at structured rubric application; prompt caching is critical for cost (rubrics cache, responses don't). |
| Error-tag extraction | **Claude Haiku** or equivalent small model | Structured output, cheap, fast. |
| CO listening passage TTS | **Gemini 3.1 Flash TTS** primary, **ElevenLabs** for premium accent variety | Flash TTS is cheap and supports natural-language voice control; ElevenLabs for the few "high-noise café announcement" scenarios. |
| Prompt/passage generation | **Claude Sonnet** | Used offline by content authors, not in user hot path. |

### Observability

- **Sentry** — frontend + backend errors.
- **PostHog** — product analytics (drill completion rates, score trajectories, drop-off points).
- **Custom calibration dashboard** — tracks Cohen's kappa between app scoring and hand-grading on a rolling held-out set. This is a first-class operational metric, not a nice-to-have. See [`05-content-strategy.md`](./05-content-strategy.md).

## Why this stack vs alternatives

| Decision | Chose | Rejected | Why |
|---|---|---|---|
| Voice-to-voice for EO-A | Gemini Live | OpenAI Realtime | Cost — Gemini is ~$0.018/min vs OpenAI's ~$0.20+/min. EO-A is the most expensive path; this matters. OpenAI is the fallback if Gemini's French quality regresses. |
| Pronunciation scoring | Azure | Speechace, ELSA, self-hosted Whisper-based | Azure is the only well-supported phoneme-level provider for fr-FR with documented IPA output. Speechace is decent but English-leaning. Self-hosted is a research project, not v1. |
| Writing scorer | Claude | GPT-4 class, Gemini Pro | Claude's prompt caching makes the rubric+exemplar block ~10x cheaper after first call. Rubric is fixed; this is a perfect cache fit. |
| Database | Postgres | Mongo, DynamoDB | Postgres JSONB gives us schemaless rubrics + exemplars without giving up relational queries for progress tracking. |
| Frontend | Next.js | Remix, plain Vite + React | Server components reduce drill-picker bundle. Edge runtime for the selector endpoint keeps latency low. Familiar to most devs we'd hire. |
| Live voice transport | WebRTC | WebSocket | Both work with Gemini Live, but WebRTC handles jitter/loss/echo cancellation for free. Critical when users are on phone speakers in a café. |
| Job queue | BullMQ on Redis | SQS, Inngest | BullMQ is the simplest thing that handles concurrency limits, retries, and per-provider rate limit groups. Inngest is more powerful but adds a vendor; SQS is overkill for the volume. |

## Failure modes & resilience

The architecture must handle these gracefully — they are not edge cases:

1. **Gemini Live disconnect mid-session.** WebRTC reconnect with session resumption (Gemini supports 24h resume tokens). If resume fails, fall back to "session paused, restart from last task" rather than losing the whole drill.
2. **Azure pronunciation timeout.** Score the attempt with whatever returned (LLM rubric + tags) and mark phoneme scores as "unavailable." Do not block the user.
3. **LLM rubric pass returns malformed JSON.** Retry once with a stricter prompt. If still bad, mark the attempt as "scoring failed — retry" and surface in the review tray. Never silently approximate.
4. **Worker queue backlog.** Surface queue depth to the user ("scoring usually takes 10s, currently ~45s due to load"). Honesty over fake progress bars.
5. **Provider price spike or outage.** All AI calls go through a thin provider abstraction (`scorers/writing.ts`, `voice/realtime.ts`) so swapping is a config change, not a refactor.

## Cost model (rough, per 1000 active users)

Assumes ~30 attempts/user/week, 80/20 split between async-graded tasks and EO-A live.

| Component | Per-user-week | 1k users/week |
|---|---|---|
| Writing scoring (24 attempts × $0.002) | $0.05 | $50 |
| Speaking async scoring (5 attempts × $0.01) | $0.05 | $50 |
| EO-A live (1 × 5 min × $0.018/min) | $0.09 | $90 |
| TTS for CO passages (amortized; pre-generated) | $0.01 | $10 |
| Postgres + Redis + R2 + workers | (fixed) | ~$200 |
| **Total** | **~$0.20/user/week** | **~$400/week** |

This means a $5/month subscription has ~95% gross margin at 1k users. Cost is not the bottleneck; **content quality and calibration are**.
