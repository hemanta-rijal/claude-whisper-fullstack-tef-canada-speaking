# Task Types

The TEF has six task types. Each is a first-class object in our system with its own format spec, timer, input shape, output shape, and rubric reference.

This document is the **canonical spec** for what each task looks like, what we generate for it, and what the user is expected to produce. Scoring details live in [`04-scoring-pipelines.md`](./04-scoring-pipelines.md); rubric encoding in [`05-content-strategy.md`](./05-content-strategy.md).

## Variant applicability

| Task | TEF Canada | TEFAQ | TEF Naturalisation | Études / Général |
|---|---|---|---|---|
| **CÉ** | required | optional | n/a | required |
| **CO** | required | optional | n/a | required |
| **EO-A** | required (part of EO) | required | required | required |
| **EO-B** | required (part of EO) | required | required | required |
| **EÉ-A** | required (part of EÉ) | required | required | required |
| **EÉ-B** | required (part of EÉ) | required | required | required |

The `users.target_variant` column gates which task selectors run. TEFAQ users see CO/CÉ as optional bonus drills, not required.

---

## CÉ — Compréhension écrite (Reading)

### Real-test format (TEF Canada)

- 60 minutes total
- 50 questions
- ~4 sections, each tied to a passage or document type
- Document types: ads, articles, instructions, correspondence, schedules
- Each question is multiple choice (A/B/C/D)

### Our content shape

`content_items.content` for `task_type='CE'`:

```json
{
  "passage": {
    "type": "article" | "ad" | "instruction" | "correspondence" | "schedule",
    "title": "...",
    "body_md": "...",                  // markdown, with optional images via URL
    "word_count": 245,
    "register": "neutral" | "formal" | "informal",
    "topic_tags": ["health","workplace"]
  },
  "questions": [
    {
      "id": "q1",
      "stem": "Selon le texte, pourquoi...",
      "options": [
        {"id":"A", "text":"..."},
        {"id":"B", "text":"..."},
        {"id":"C", "text":"..."},
        {"id":"D", "text":"..."}
      ],
      "correct": "B",
      "evidence_span": {"start": 412, "end": 487},
      "skill_tested": "inference" | "literal" | "vocab" | "tone"
    }
  ]
}
```

### Drill format

- One passage at a time, all its questions, no overall timer (per-question soft hint at TEF pacing: ~70s/question)
- Mock exam mode: full timer, all 50 questions, no review until finished

### Output

User submission is `{question_id: option_id}` map. Stored in `attempts.response_text` as JSON.

### Why `evidence_span` matters

Post-attempt review highlights the passage span the question is testing. This is how learners get faster at TEF — by seeing **what to look for**, not just whether they got it right.

---

## CO — Compréhension orale (Listening)

### Real-test format (TEF Canada)

- 40 minutes
- 60 questions
- 4 sections: short messages, dialogues, news/announcements, longer talks
- Each question is multiple choice
- Audio plays **once** (this is critical to replicate)

### Our content shape

`content_items.content` for `task_type='CO'`:

```json
{
  "audio": {
    "url": "r2://co-audio/abc123.mp3",
    "duration_ms": 47000,
    "transcript": "...",                // for review only, hidden during attempt
    "speakers": [
      {"id":"S1","voice":"fr-FR-Denise","gender":"f","register":"neutral"},
      {"id":"S2","voice":"fr-FR-Henri","gender":"m","register":"casual"}
    ],
    "scenario": "café_announcement" | "phone_message" | "news" | "dialogue" | "interview",
    "background_noise": "none" | "café" | "transit" | "office"
  },
  "questions": [ /* same shape as CÉ */ ]
}
```

### Drill format

- Audio plays once, then questions appear (cannot replay)
- "Practice mode" toggle allows replay + transcript reveal — clearly marked as *not test conditions*
- Mock mode locks practice toggles

### Generation

- TTS via Gemini 3.1 Flash TTS (primary) or ElevenLabs (premium accents) — see [`06-voice-layer.md`](./06-voice-layer.md)
- Pre-generated and stored in R2; we never TTS at request time
- Background noise mixed in via FFmpeg pipeline at content-authoring time

### Output

Same as CÉ — `{question_id: option_id}` map.

---

## EÉ-A — News brief (Section A)

### Real-test format

- ~40 minutes for both EÉ sections combined; A is the shorter
- Given: a series of bullet-point facts about an event
- Produce: an **80-word** news article integrating all facts in coherent prose
- Penalty for going under or over by more than ~10%
- Penalty for omitting any required fact
- Penalty for inventing facts not in the source

### Our content shape

`content_items.content` for `task_type='EE_A'`:

```json
{
  "scenario": "Vous êtes journaliste pour ...",
  "facts": [
    {"id":"f1","text":"Un incendie s'est déclaré rue de la République lundi soir."},
    {"id":"f2","text":"Aucun blessé n'est à déplorer."},
    {"id":"f3","text":"Les pompiers sont intervenus en moins de 10 minutes."},
    {"id":"f4","text":"L'origine du sinistre est en cours d'investigation."},
    {"id":"f5","text":"Trois immeubles ont été évacués par précaution."}
  ],
  "target_word_count": 80,
  "tolerance": 0.15,                     // ±15%
  "required_addressee": null,            // EÉ-A has no addressee
  "register": "journalistic"
}
```

### Drill format

- Timer (recommended 20 min, configurable)
- Live word count visible
- Hard-block submission below the lower bound, soft-warn above the upper bound

### Output

Plain text in `attempts.response_text`.

### What gets graded

- Coverage of all `facts` (binary per fact, no `fmt.ee_a.fact_omission` tags if all present)
- No invention (`fmt.ee_a.fact_invention` tag if facts not in source)
- Word count adherence
- Coherence, register, grammar, lexicon — full rubric (see [`05-content-strategy.md`](./05-content-strategy.md))

---

## EÉ-B — Argumentative letter (Section B)

### Real-test format

- ~30–40 minutes
- Given: a situation requiring a written response (e.g., "your neighbor plays loud music; write to the building manager")
- Produce: ~**200-word** structured letter or formal email
- Must take a position and justify it
- Must address the specified addressee with appropriate register

### Our content shape

```json
{
  "scenario": "Votre voisin organise des fêtes bruyantes plusieurs soirs par semaine. Écrivez au syndic de votre immeuble pour ...",
  "addressee": "syndic_immeuble",
  "addressee_register": "formal",
  "expected_position": "any",            // user picks side; we score how well they argue
  "target_word_count": 200,
  "tolerance": 0.2,
  "required_elements": [
    "explicit_position",
    "at_least_two_arguments",
    "concrete_example",
    "polite_request_for_action"
  ]
}
```

### Output

Plain text. Same shape as EÉ-A, longer.

### What gets graded

Full rubric: thesis clarity, argument quality, register/addressee fit, coherence, grammar, lexicon, format compliance (greeting + closing for the addressee).

---

## EO-A — Get information from someone (Section A)

### Real-test format

- ~5 minutes
- User must **ask questions** of an interlocutor (the examiner) to obtain specified information
- Scenario card lists what info the user needs to extract (e.g., "find out about a Spanish course: schedule, price, level required, registration deadline")
- Tests **interactive question-asking**, politeness, comprehension

### Our content shape

```json
{
  "scenario": "Vous voulez vous inscrire à un cours d'espagnol. Vous appelez le centre de langues pour obtenir les informations nécessaires.",
  "info_to_obtain": [
    {"id":"i1","label":"horaires des cours"},
    {"id":"i2","label":"tarifs"},
    {"id":"i3","label":"niveau requis"},
    {"id":"i4","label":"date limite d'inscription"},
    {"id":"i5","label":"modalités de paiement"}
  ],
  "interlocutor_persona": {
    "role": "agent du centre de langues",
    "register": "professional_friendly",
    "voice": "fr-FR-Henri",
    "facts": {
      "horaires": "Mardi et jeudi soir, 18h à 20h",
      "tarifs": "320 euros le trimestre, 850 euros l'année",
      "niveau_requis": "Aucun pour le niveau débutant",
      "date_limite": "Le 15 septembre",
      "paiement": "Carte ou virement, possibilité de paiement en trois fois"
    },
    "behavior": "answer only what is asked; do not volunteer information"
  },
  "target_duration_ms": 300000,
  "min_questions": 5
}
```

### Drill format

This is the **only task that uses real-time voice**. Gemini Live with system prompt configured from `interlocutor_persona`. See [`06-voice-layer.md`](./06-voice-layer.md).

- VAD endpointing tuned for learner pauses (~900ms silence)
- Timer visible to user
- "End session" button OR auto-end at duration cap
- Full audio recorded for post-session scoring

### Output

`attempts.response_audio` is the user's full mic recording. Transcript generated by Whisper post-session. Interlocutor turns also transcribed and stored as part of the attempt's `metadata` for scoring context.

### What gets graded

- Coverage of `info_to_obtain` (which items did the user successfully extract?)
- Question quality (politeness, clarity, grammar)
- Interactive competence (turn-taking, follow-up questions, repair when misunderstood)
- Pronunciation (Azure phoneme scoring)
- Standard rubric criteria

---

## EO-B — Persuasive monologue (Section B)

### Real-test format

- ~3 minutes
- Scenario card describes a situation requiring the user to **convince someone**
- Pure monologue — no interlocutor; user records their argument
- E.g., "Convince a friend to come on a hiking trip with you"

### Our content shape

```json
{
  "scenario": "Vous voulez convaincre un ami sceptique de vous accompagner pour un weekend de randonnée en montagne. Vous lui exposez vos arguments.",
  "addressee": "ami",
  "addressee_register": "casual",
  "target_duration_ms": 180000,
  "min_duration_ms": 120000,
  "expected_structure": "position → arguments → counter-objection → call to action",
  "scoring_emphasis": ["argumentation","fluency","pronunciation","register"]
}
```

### Drill format

- Record-only UI (no live AI)
- Visible timer, big "stop" button
- Optional 30s of "preparation time" with the scenario visible (matches real test)
- Audio uploaded on stop, scoring kicked off async

### Output

`attempts.response_audio` only.

### What gets graded

- Argumentation structure (`disc.argumentation.*` tags)
- Fluency (pace, hesitations — Whisper word-timestamps + duration analysis)
- Pronunciation (Azure)
- Register fit to addressee
- Standard rubric

---

## Common timer & UX patterns

All tasks share this pattern:

1. **Pre-task screen** — scenario, instructions, "start when ready" button. Timer not running.
2. **Active task** — timer running, submission/recording UI live.
3. **Submitted screen** — "scoring..." with rough ETA, "next drill" CTA. User does NOT wait here.
4. **Score arrives** — notification badge in review tray; user can review when they choose.

Mock exam mode overrides this: tasks chain back-to-back with breaks per the real TEF schedule, and scoring is held until the full mock is complete.

## Why six and not more

Real TEF has more sub-formats within each section (e.g., CÉ has 4 distinct passage types). We treat those as **content variations** within one task type, not as distinct tasks. Adding a "task type" requires its own scoring pipeline and rubric; the cost of that complexity is only justified when the scoring genuinely differs. So far it doesn't — passage type is just a `content.passage.type` field.
