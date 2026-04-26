# TEF Canada Speaking Evaluation Tool — Architecture

## What this app does

A conversational AI-powered speaking exam simulator for the TEF Canada test.
The AI plays the role of an examiner (examinatrice), the user speaks naturally,
and the system evaluates their French speaking performance across four criteria.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 17+ (standalone components, signals) |
| Backend | Node.js + Express + TypeScript |
| Database | MySQL via Prisma |
| Speech-to-Text | OpenAI Whisper API |
| Text-to-Speech | OpenAI TTS API (`tts-1-hd`, `shimmer` voice) |
| AI Examiner + Evaluator | Anthropic Claude Sonnet |
| Voice Activity Detection | `@ricky0123/vad-web` (browser-side) |

---

## Exam Structure

### Section A — Telephone Roleplay (Professional)
- AI plays a professional role (hotel receptionist, dental clinic, etc.)
- User must complete a task (book a room, reschedule appointment, etc.)
- Formal French required
- Duration: ~5 minutes
- Turn style: short back-and-forth exchanges

### Section B — Persuasion Roleplay (Informal)
- AI plays a skeptical friend who is not interested in the user's proposal
- User must convince the friend using arguments and counter-objections
- Informal/conversational French
- Duration: ~5 minutes
- Turn style: longer user arguments, AI raises objections

### User can choose: Section A only, Section B only, or both (A + B)

---

## Conversation Flow

```
User lands on exam page
    ↓
Sees scenario image + section info (image stays visible throughout)
    ↓
Presses [Start Conversation] button
    ↓
POST /attempts/start → returns { attemptId, scenarioImageUrl, openingAudio }
    ↓
AI opening line plays automatically (TTS audio)
    ↓
VAD (Voice Activity Detection) activates in browser
    ↓
User speaks → VAD detects silence → auto-submits audio
    ↓
POST /attempts/:id/turn → Whisper STT → Claude Examiner → TTS
    ↓
AI response audio auto-plays → VAD activates again
    ↓
Repeat until...

         Two ways to end:
    ┌─────────────┴──────────────┐
    │                            │
Timer hits zero          User presses [End Exam]
    │                            │
    └─────────────┬──────────────┘
                  ↓
    AI plays closing line (TTS)
    e.g. "Très bien, merci. Au revoir!"
    or   "Ah, j'ai un autre appel. On se reparle!"
                  ↓
    POST /attempts/finish → Claude Evaluator → save to DB
                  ↓
    Results page shown
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  FRONTEND (Angular)                  │
│                                                      │
│  - Displays scenario image                           │
│  - [Start Conversation] button to begin              │
│  - [End Exam] button (always visible during exam)    │
│  - WebAudio API + VAD — auto-detects speech/silence  │
│  - Auto-plays AI audio responses                     │
│  - 5-min countdown timer per section                 │
│  - Maintains Turn[] conversation history locally     │
│  - Sends full history with every request             │
└──────────────────────┬──────────────────────────────┘
                       │ REST (auto-triggered by VAD)
┌──────────────────────▼──────────────────────────────┐
│                  BACKEND (Express)                   │
│                                                      │
│  POST /attempts/start                                │
│    → picks random scenario for chosen section(s)     │
│    → generates opening TTS audio                     │
│    → returns { attemptId, scenarioImageUrl,          │
│                openingAudio, openingText }           │
│                                                      │
│  POST /attempts/:id/turn                             │
│    body: { audio, history[], section }               │
│    → Whisper STT → transcript                        │
│    → Claude Examiner (with full history) → response  │
│    → OpenAI TTS → audio buffer                       │
│    → return { transcript, responseText,              │
│               responseAudio }                        │
│                                                      │
│  POST /attempts/:id/finish                           │
│    body: { history[], sections[], reason }           │
│    reason: 'timeout' | 'user_terminated'             │
│    → Claude Evaluator → scores + feedback            │
│    → save TestResult to DB                           │
│    → return { closingAudio, closingText,             │
│               evaluation }                           │
│                                                      │
│  GET /results          → user's past results list    │
│  GET /results/:id      → one result in detail        │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                     DATABASE                         │
│  User        — auth (already built)                  │
│  Session     — auth (already built)                  │
│  TestResult  — scores + feedback only (new)          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│           CONFIG FILE (not database)                 │
│  src/config/tef-prompts.ts                           │
│  — Section A scenarios (image, context, opening,     │
│    task, closing lines)                              │
│  — Section B scenarios (image, context, opening,     │
│    resistance cues, closing lines)                   │
└─────────────────────────────────────────────────────┘

External APIs:
  OpenAI    → Whisper (STT) + TTS
  Anthropic → Claude Sonnet (examiner + evaluator)
```

---

## State Management

| Data | Where it lives | Why |
|---|---|---|
| Conversation history (Turn[]) | Frontend memory | Backend is stateless REST — no server-side session state needed |
| Scenario questions/images | Config file (`tef-prompts.ts`) | Static data, doesn't change dynamically |
| Test results (scores, feedback) | Database (`TestResult`) | Permanent — user needs to review history |
| Audio files | Never stored | Processed in-flight, discarded after transcription |

---

## Database Model

```prisma
model TestResult {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])

  sections      String   // "A", "B", or "A+B"

  // Section-level scores
  sectionAScore Int?
  sectionBScore Int?
  overallScore  Int

  // Breakdown scores (0-100 each, TEF Canada rubric)
  lexicalRichness  Int   // vocabulary range and accuracy
  taskFulfillment  Int   // did they complete the task / make their case
  grammar          Int   // grammatical correctness
  coherence        Int   // logical flow and organisation

  // Qualitative feedback from Claude evaluator
  feedback     String   @db.Text  // overall written feedback
  suggestions  String   @db.Text  // specific improvement tips

  reason       String   // 'timeout' | 'user_terminated'
  completedAt  DateTime @default(now())

  @@index([userId])
}
```

---

## Backend Service Layer

```
src/
  config/
    tef-prompts.ts          — scenario data (images, prompts, closing lines)
  routes/
    attempt.route.ts
    result.route.ts
  controllers/
    attempt.controller.ts
    result.controller.ts
  services/
    whisper.service.ts      — audio file → transcript (OpenAI Whisper)
    tts.service.ts          — text → audio buffer (OpenAI TTS, shimmer voice)
    examiner.service.ts     — Claude Sonnet as examinatrice (in-character)
    evaluator.service.ts    — Claude Sonnet as scorer (post-exam)
    attempt.service.ts      — orchestrates all of the above
  repositories/
    result.repository.ts    — DB read/write for TestResult
  schemas/
    attempt.schemas.ts      — Zod validation for attempt routes
  assets/
    scenarios/
      section-a/            — scenario images for Section A
      section-b/            — scenario images for Section B
```

---

## Claude Roles

### Examiner (during the test)

**Section A system prompt:**
```
You are playing the role of [receptionist at Hotel Lumière].
A client is calling. Answer professionally: "Hôtel Lumière, bonjour."
Respond naturally. Ask for details when needed. Stay in character.
Speak only French. Keep responses short (1–3 sentences).
```

**Section B system prompt:**
```
You are playing the role of a close friend of the user.
They are trying to convince you to [join a gym].
You are NOT interested. Raise natural objections. Be friendly but skeptical.
Let yourself be gradually convinced only if their arguments are strong.
Speak informal French. Keep responses short (1–3 sentences).
```

### Evaluator (after the test)

Receives the full conversation history and returns structured JSON:

```json
{
  "overallScore": 74,
  "sectionAScore": 74,
  "sectionBScore": null,
  "breakdown": {
    "lexicalRichness": 70,
    "taskFulfillment": 78,
    "grammar": 72,
    "coherence": 76
  },
  "feedback": "Your spoken French shows good communicative ability...",
  "suggestions": "Focus on expanding your use of connectors such as..."
}
```

---

## Scenario Config Structure

```typescript
// src/config/tef-prompts.ts

export const SECTION_A_SCENARIOS = [
  {
    id: 'hotel-booking',
    imageUrl: '/assets/scenarios/section-a/hotel.png',
    context: "You are a receptionist at Hotel Lumière.",
    opening: "Hôtel Lumière, bonjour. Comment puis-je vous aider?",
    task: "The caller wants to book a room for 3 nights.",
    closingTimeout: "Merci d'avoir appelé. Bonne journée. Au revoir!",
    closingUserEnded: "Très bien. N'hésitez pas à rappeler. Au revoir!",
  },
  // ...more scenarios
];

export const SECTION_B_SCENARIOS = [
  {
    id: 'gym-persuasion',
    imageUrl: '/assets/scenarios/section-b/gym.png',
    context: "You are a skeptical friend. The user wants to convince you to join a gym.",
    opening: "Un abonnement de gym? Bof, je suis pas vraiment convaincu...",
    resistance: "You find it too expensive and say you're too busy.",
    closingTimeout: "Ah excuse-moi, j'ai un autre appel. On en reparle plus tard!",
    closingUserEnded: "Ok ok, je vais y réfléchir. À plus!",
  },
  // ...more scenarios
];
```

---

## Frontend Button States

| State | Visible buttons |
|---|---|
| Before exam starts | `[Start Conversation]` |
| During exam | `[End Exam]` (red, always visible) |
| After closing line plays | None — auto-transitions to results |

---

## Build Order

1. Prisma schema — add `TestResult` model + migrate
2. Config file — Section A and B scenarios with placeholder images
3. Static file serving — `express.static` for scenario images
4. `whisper.service.ts` — audio → transcript
5. `tts.service.ts` — text → audio
6. `examiner.service.ts` — Claude as examinatrice
7. `evaluator.service.ts` — Claude as scorer
8. `attempt.service.ts` — orchestrates the full flow
9. Routes + controllers + Zod schemas
10. Result routes (GET history, GET detail)
11. Frontend (Angular) — VAD, timer, audio playback, results page
12. OAuth (last)

---

## API Keys Required

| Service | Key |
|---|---|
| OpenAI | `OPENAI_API_KEY` — for Whisper STT + TTS |
| Anthropic | `ANTHROPIC_API_KEY` — for Claude Sonnet |
