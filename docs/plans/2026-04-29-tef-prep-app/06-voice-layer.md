# Voice Layer

Real-time voice is used in **exactly one task type**: EO-A. Everything else uses pre-generated audio (CO listening passages) or simple recording (EO-B). Keeping the voice layer narrow is a deliberate choice — it's the most expensive and operationally complex part of the system.

## Provider selection

### Real-time dialogue (EO-A only)

**Primary: Gemini Live (3.1 Flash).**

Reasoning:
- **Cost.** ~$0.018/min audio output vs OpenAI Realtime's ~$0.20+/min. A 5-minute EO-A drill costs ~$0.09 vs ~$1.00. At any meaningful user volume, this is the difference between a viable product and a money pit.
- **Latency.** 300–500ms steady-state, equivalent to OpenAI Realtime in sustained conversation.
- **Session resumption.** 24-hour resume tokens — a learner can pause a drill, close the laptop, come back later, and pick up. Important for the actual usage pattern.
- **Natural-language prosody control.** Can prompt "now slow down and exaggerate the nasals" without learning SSML. Useful for the interlocutor persona.
- **40+ languages** including French, with voice options that sound more natural than older Wavenet voices.

**Fallback: OpenAI Realtime (`gpt-realtime`).** Behind a feature flag. Used if:
- Gemini Live has a sustained French quality regression
- Gemini Live is down (rare but happens)
- A specific user reports quality issues we can't reproduce

Provider abstraction lives at `src/voice/realtime/{gemini,openai}.ts` with a shared interface so swapping is a config change, not a code change.

### TTS for CO listening passages

**Primary: Gemini 3.1 Flash TTS.** Cheap, controllable via natural-language prompts ("speak quickly, slightly impatient tone, Parisian register"), supports both `fr-FR` and `fr-CA` voices.

**Premium: ElevenLabs.** Used for ~20% of CO content where:
- Regional accent variety matters (e.g., Belgian or Swiss French scenarios)
- Voice expressiveness is core to the comprehension question (e.g., distinguishing tone of voice)
- Café/transit/announcement scenarios benefit from ElevenLabs' superior naturalness with background noise

CO audio is **always pre-generated** at content-authoring time and stored in R2. We never TTS at request time. Latency for CO playback is just CDN fetch (~50ms).

### STT for post-session scoring

**Whisper-large-v3** via Groq (or OpenAI as fallback). Used for both EO-A (re-transcribing the user-only audio for higher quality than Gemini's live transcript) and EO-B.

Why a separate STT pass even when Gemini already transcribes:
- Gemini's live transcript is optimized for low latency, not accuracy
- Whisper word-level timestamps are required for fluency analysis (EO-B) and pronunciation alignment with Azure scores
- Whisper handles French better than most STT for non-native accents — important when our users have wildly varying L1s

### Pronunciation scoring

**Azure Speech Pronunciation Assessment** with `fr-FR` (default) or `fr-CA` (per `users.locale_pref`).

This is non-negotiable: Azure is currently the only mainstream provider with documented IPA phoneme-level scoring for French.

Known limitations and how we handle them:

| Limitation | Workaround |
|---|---|
| Prosody assessment is en-US only | Skip prosody from Azure; derive intonation cues via LLM reading the transcript + audio summary |
| Content/topic scoring is en-US only | Use our LLM rubric pass for content scoring; Azure only for phoneme scores |
| `fr-CA` quality reportedly weaker than `fr-FR` | Default to `fr-FR` even for Canadian users unless they opt into `fr-CA`; tune phoneme thresholds higher for `fr-CA` to reduce false-positive errors |
| Custom models not supported for French | None. Accept this limitation. |
| 30-second cap for non-continuous mode | Always use **continuous mode** for our audio (EO recordings are 30s+) |

## EO-A live session — full flow

```
USER PRESSES "START"
  │
  ├─ Browser requests mic permission (cached)
  ├─ Backend issues ephemeral Gemini Live token (scoped, 1-hour TTL)
  ├─ Frontend opens WebRTC peer connection to Gemini Live
  │   - audio/PCM bidirectional
  │   - data channel for transcripts and events
  │
  ├─ Frontend pushes initial config:
  │   - system prompt (built from interlocutor_persona)
  │   - voice (chosen per persona)
  │   - VAD config (see tuning below)
  │   - language: fr-FR
  │   - response_modalities: [audio, text]
  │   - max_session_duration: target_duration_ms + 60s
  │
  ├─ Frontend starts capturing mic → encoded to PCM 16kHz → streamed up
  ├─ Frontend simultaneously records full session locally via MediaRecorder
  │   (we cannot rely on Gemini retaining audio)
  │
  ├─ Gemini Live VAD detects speech start → emits speech_started event
  │   → UI flips to "🎙️ listening"
  ├─ Gemini Live detects speech end → commits turn → starts streaming response
  │   → UI flips to "🤔 thinking" briefly, then "🔊 speaking"
  │
  ├─ User can interrupt mid-AI-response (barge-in):
  │   - VAD detects new user speech → AI cuts current response
  │   - This works out of the box in Gemini Live with default config
  │
  ├─ Live transcript stream → captured and displayed (optional UX, can hide)
  │
  └─ TIMER REACHES TARGET DURATION OR USER PRESSES "END"
      ├─ Frontend sends "session.end" event to Gemini
      ├─ Frontend stops MediaRecorder, gets full audio Blob
      ├─ Frontend uploads audio Blob + Gemini transcript log to backend
      ├─ Backend stores audio in R2, transcript in attempts.metadata
      └─ Backend enqueues scoring job (see 04-scoring-pipelines.md)
```

## VAD tuning for language learners

Default VAD is tuned for native speakers. Learners pause more — to think of words, conjugate, recover from errors. Without retuning, the AI interrupts them mid-sentence and the experience is broken.

| Parameter | Default | Our setting | Why |
|---|---|---|---|
| `silence_duration_ms` | 500 | **900** | Learners pause longer mid-utterance |
| `prefix_padding_ms` | 300 | 500 | Captures soft openings ("euh, je voudrais...") |
| `vad_threshold` | 0.5 | 0.45 | More sensitive to quiet speech (learners often soften when uncertain) |
| `interrupt_response` | true | true | Keep barge-in on; users *want* to be able to retry |
| Semantic VAD | off | **on (where available)** | Detects "...je voudrais un café et—" as unfinished even with a pause |

These are starting values. Per-user tuning (a "give me more time to think" toggle that bumps `silence_duration_ms` to 1500) is a v2 feature.

## Push-to-talk fallback

Some users (noisy environment, accessibility needs) prefer push-to-talk. We support it via:

- A toggle in session settings ("push to talk" on/off)
- When on: VAD is disabled; user holds spacebar (or a UI button) to record; release commits the turn
- Communicated to Gemini Live via `commit_audio_buffer` events instead of relying on server VAD

This is a v1 feature, not deferred. Some users genuinely cannot use auto-VAD reliably.

## Audio I/O on the client

### Capture

```
getUserMedia({audio: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 16000,
  channelCount: 1
}})
  → MediaStreamTrack
  → AudioContext + AudioWorklet (or MediaRecorder for simple recording)
  → PCM 16-bit 16kHz mono encoder
  → WebRTC peer connection to Gemini Live
```

### Playback

WebRTC handles playback automatically via the remote audio track. We mount it on a hidden `<audio>` element with `autoplay` and surface volume control in the UI.

### Recording for post-session scoring

Independent of WebRTC, we run `MediaRecorder` on the local mic stream → Opus in WebM container → upload to R2 on session end.

We do this client-side because:
- Gemini Live's audio retention is not contractually guaranteed
- Re-transcribing with Whisper requires the original audio
- Azure pronunciation requires the original audio

The client uploads to a presigned R2 URL; the backend never proxies audio bytes.

## Latency budget for EO-A live

```
USER STOPS SPEAKING
  │
  ├─ VAD detection (silence_duration_ms)             900ms
  ├─ Network RTT to Gemini                            50ms
  ├─ Gemini LLM time-to-first-audio-byte            300ms
  ├─ Network RTT back                                 50ms
  ├─ Browser audio decode + playback start            30ms
  │
  └─ TOTAL "stop talking → AI talking"             ~1330ms
                                                   (of which 900ms is VAD timeout)
```

The user-perceived latency is dominated by VAD timeout, not provider speed. **Do not lower VAD timeout to chase latency** — it breaks learner experience. The 1.3s feels right for a tutor; pushing toward 800ms makes the AI feel pushy.

## CO TTS authoring pipeline

Run offline at content-authoring time:

```
1. Generator (Claude) produces script + speaker tags + scenario
2. Author reviews + edits in YAML
3. `pnpm content:tts CE_passages/<id>.yaml`
   ├─ Per speaker, render audio via Gemini TTS (or ElevenLabs if marked premium)
   ├─ Apply prosody hints from script
   ├─ Concatenate turns with natural gaps (200–500ms)
   ├─ FFmpeg mix in background noise (selected by scenario)
   ├─ Normalize to -14 LUFS
   └─ Upload to R2; write content_items.content.audio.url
4. QA: author listens once and approves; quality_score set 0.5 baseline
5. Post-launch: difficulty calibration adjusts quality_score based on user attempt data
```

## Reliability

- Gemini Live disconnect mid-session → reconnect with resume token (24h validity); if resume fails, save partial recording and let the user choose to resume or restart
- Mic permission denied → clear UX explaining why; offer to retry; offer EO-B-only practice as alternative
- WebRTC failure (firewall, etc.) → fall back to WebSocket transport (Gemini supports both); alert user that audio quality may be reduced
- Azure pronunciation timeout → score the attempt without phoneme tags; flag attempt for "pronunciation analysis unavailable"

## Privacy

Voice data is sensitive. Default policy:

- Audio is stored only as long as needed to score and let the user review (90 days default)
- After 90 days, audio is purged; transcript + scores remain
- Per-user "delete all my audio" button available immediately
- Audio never used for training without explicit opt-in
- Provider terms (Gemini, Whisper, Azure) reviewed and confirmed to not train on customer audio under our plans
