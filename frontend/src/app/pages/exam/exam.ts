import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AttemptService } from '../../services/attempt';
import { environment } from '../../../environments/environment';

type ExamState = 'idle' | 'listening' | 'processing' | 'ai-speaking' | 'evaluating' | 'done';
type Turn = { role: 'examiner' | 'candidate'; content: string };

const EXAM_DURATION_SECONDS = 5 * 60; // 5 minutes
const SILENCE_THRESHOLD = 15;         // audio level below this = silence (0-255 scale)
const SILENCE_DURATION_MS = 1200;     // 1.2s of silence triggers submission
// Minimum consecutive frames above threshold to count as real speech.
// Interval fires every 100ms, so 5 frames = 500ms of sustained sound.
// This prevents a cough, breath, or background noise from triggering a submission
// with nearly silent audio — which makes Whisper hallucinate English text.
const MIN_SPEECH_FRAMES = 5;

@Component({
  selector: 'app-exam',
  imports: [],
  templateUrl: './exam.html',
  styleUrl: './exam.scss',
})
export class Exam implements OnInit, OnDestroy {
  private router = inject(Router);
  private attemptService = inject(AttemptService);

  // Exam metadata
  section = signal<'A' | 'B'>('A');
  attemptId = signal('');
  scenarioId = signal('');
  scenarioImageUrl = signal('');

  // UI state
  state = signal<ExamState>('idle');
  timeLeft = signal(EXAM_DURATION_SECONDS);
  error = signal('');
  showTranscript = signal(false);

  // Conversation history — sent to backend with every turn
  history: Turn[] = [];

  // Internal audio/timer refs
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private analyser: AnalyserNode | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceCheckInterval: ReturnType<typeof setInterval> | null = null;
  private audioChunks: Blob[] = [];

  // Guards against race conditions: submitTurn() is async and may still be awaiting
  // the API response when the user (or timer) calls endExam(). Without this flag,
  // submitTurn() would resume after endExam() has already run and restart the loop.
  private examEnded = false;

  // ── Audio queue ────────────────────────────────────────────────────────────
  // With streaming we receive multiple audio chunks (one per sentence).
  // We push them into a queue and play them sequentially so they flow smoothly.
  // drainResolve is called when the queue empties — used by waitForAudioDone().
  private audioQueue: string[] = [];
  private isDraining = false;
  private drainResolve: (() => void) | null = null;

  ngOnInit() {
    // Read the section chosen on the previous page — passed via router state
    const nav = window.history.state as { section?: 'A' | 'B' };
    if (!nav?.section) {
      this.router.navigate(['/exam/select']);
      return;
    }
    this.section.set(nav.section);

    // Fetch the scenario preview immediately so the image is visible before
    // the user presses Start — no AI calls, responds in milliseconds.
    this.loadScenarioPreview(nav.section);
  }

  private async loadScenarioPreview(section: 'A' | 'B') {
    try {
      const preview = await this.attemptService.getScenarioPreview(section);
      this.scenarioId.set(preview.scenarioId);
      this.scenarioImageUrl.set(`${environment.apiUrl}${preview.scenarioImageUrl}`);
    } catch {
      // Non-fatal — the image just won't show until the exam starts
    }
  }

  ngOnDestroy() {
    this.cleanup();
  }

  // ─── Step 1: User presses Play ───────────────────────────────────────────

  async beginExam() {
    this.error.set('');
    this.state.set('processing');

    try {
      // Pass the scenarioId from the preview so the backend uses the same scenario
      const result = await this.attemptService.startAttempt(this.section(), this.scenarioId());
      this.attemptId.set(result.attemptId);
      this.scenarioId.set(result.scenarioId);
      this.scenarioImageUrl.set(`${environment.apiUrl}${result.scenarioImageUrl}`);

      // Store opening as first examiner turn
      this.history.push({ role: 'examiner', content: result.openingText });

      // Play opening audio, then start listening
      await this.playBase64Audio(result.openingAudio);
      this.startTimer();
      await this.startListening();
    } catch (err) {
      this.error.set('Failed to start exam. Please try again.');
      this.state.set('idle');
    }
  }

  // ─── Step 2: Listen for candidate speech ─────────────────────────────────

  private async startListening() {
    this.state.set('listening');
    this.audioChunks = [];

    // Request microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Set up Web Audio API to detect silence
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    // Start recording
    this.mediaRecorder = new MediaRecorder(this.mediaStream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };
    this.mediaRecorder.start(100); // collect data every 100ms

    // Monitor audio levels — detect silence
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    let speechFrameCount = 0;   // consecutive frames above threshold
    let speechConfirmed = false; // true once MIN_SPEECH_FRAMES sustained frames are seen

    this.silenceCheckInterval = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      if (avg > SILENCE_THRESHOLD) {
        // Sound detected — increment the consecutive frame counter.
        speechFrameCount++;

        // Clear any pending silence timer (user resumed speaking).
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }

        // Only confirm speech once we've seen enough consecutive frames.
        // A single noisy frame (breath, chair, background bump) won't pass this.
        if (speechFrameCount >= MIN_SPEECH_FRAMES) {
          speechConfirmed = true;
        }

      } else {
        // Silence frame — reset the consecutive counter so transient noise
        // doesn't accumulate across gaps.
        speechFrameCount = 0;

        // Only start the submission timer if real speech was confirmed.
        // If the user hasn't spoken (or only made brief noise), we just wait.
        if (speechConfirmed && !this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.submitTurn();
          }, SILENCE_DURATION_MS);
        }
      }
    }, 100);
  }

  // ─── Step 3: Submit candidate audio, get examiner response via SSE stream ──

  private async submitTurn() {
    this.stopListening();
    this.state.set('processing');

    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const form = new FormData();
    form.append('audio', audioBlob, 'turn.webm');
    form.append('history', JSON.stringify(this.history));
    form.append('section', this.section());
    form.append('scenarioId', this.scenarioId());

    // We use native fetch() here instead of Angular's HttpClient because HttpClient
    // doesn't expose the raw ReadableStream we need to read SSE chunks one by one.
    // `credentials: 'include'` sends the session cookie — same as HttpClient withCredentials.
    let response: Response;
    try {
      response = await fetch(
        `${environment.apiUrl}/attempts/${this.attemptId()}/turn-stream`,
        { method: 'POST', credentials: 'include', body: form },
      );
    } catch {
      if (this.examEnded) return;
      this.error.set('Connection error. Trying to continue...');
      await this.startListening();
      return;
    }

    if (!response.ok || !response.body) {
      if (this.examEnded) return;
      await this.startListening();
      return;
    }

    // ReadableStream reader — each .read() call gives us the next available bytes.
    // TextDecoder turns those bytes into a string we can parse for SSE events.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';       // accumulates raw SSE text across multiple reads
    let examinerText = '';    // collects all sentence texts for the history push at 'done'
    let skipped = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Bail out if the exam ended (timer or user button) during an in-flight stream.
        if (this.examEnded) {
          await reader.cancel();
          return;
        }

        // Append the new bytes to our running buffer and parse any complete events.
        sseBuffer += decoder.decode(value, { stream: true });
        const { events, remainder } = this.parseSSEBuffer(sseBuffer);
        sseBuffer = remainder;  // keep incomplete event data for the next read()

        for (const event of events) {
          if (this.examEnded) return;

          if (event.type === 'skipped') {
            skipped = true;

          } else if (event.type === 'transcript') {
            // Candidate's speech is confirmed — add it to history immediately
            this.history.push({ role: 'candidate', content: event.data['text'] as string });

          } else if (event.type === 'audio') {
            // One sentence of audio arrived — queue it for playback.
            // The user hears this sentence while Claude is still generating the next one.
            this.state.set('ai-speaking');
            examinerText += (examinerText ? ' ' : '') + (event.data['sentenceText'] as string);
            this.queueAudio(event.data['base64'] as string);

          } else if (event.type === 'done') {
            // All sentences received — commit the full examiner turn to history.
            // It must be ONE history entry (not one per sentence) for Claude's context.
            if (examinerText) {
              this.history.push({ role: 'examiner', content: examinerText });
            }
          }
        }
      }
    } catch {
      // Stream was cancelled or network dropped — safe to ignore if exam ended
    }

    if (this.examEnded) return;

    if (skipped) {
      // Whisper returned nothing — restart listening without touching history
      await this.startListening();
      return;
    }

    // Wait for all queued audio to finish playing before we start the mic again.
    // This prevents the mic picking up the examiner's own TTS audio.
    await this.waitForAudioDone();
    if (this.examEnded) return;

    await this.startListening();
  }

  // ── SSE parsing ─────────────────────────────────────────────────────────────
  // SSE format: "event: name\ndata: json\n\n"
  // A single read() may contain partial events or multiple complete events.
  // We extract all complete event blocks and return the leftover bytes as remainder.
  private parseSSEBuffer(buffer: string): {
    events: Array<{ type: string; data: Record<string, unknown> }>;
    remainder: string;
  } {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const lines = buffer.split('\n');
    let currentEvent = '';
    let currentData = '';
    let lastProcessedIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6).trim();
      } else if (line === '' && currentEvent) {
        // Empty line = end of one SSE event block
        try {
          events.push({ type: currentEvent, data: JSON.parse(currentData) as Record<string, unknown> });
        } catch {
          events.push({ type: currentEvent, data: {} });
        }
        currentEvent = '';
        currentData = '';
        lastProcessedIndex = i + 1;
      }
    }

    // Anything after the last fully-processed event is an incomplete block — keep it
    return { events, remainder: lines.slice(lastProcessedIndex).join('\n') };
  }

  // ── Audio queue ─────────────────────────────────────────────────────────────

  // Push a base64 audio chunk onto the queue. If nothing is currently playing, start draining.
  private queueAudio(base64: string): void {
    this.audioQueue.push(base64);
    if (!this.isDraining) {
      this.isDraining = true;
      void this.drainAudioQueue();
    }
  }

  // Plays queued audio segments one at a time in order.
  // New items pushed while draining are picked up automatically in the while loop.
  private async drainAudioQueue(): Promise<void> {
    while (this.audioQueue.length > 0) {
      if (this.examEnded) break;  // don't play audio after exam ends
      const base64 = this.audioQueue.shift()!;
      await this.playBase64Audio(base64);
    }
    this.audioQueue = [];
    this.isDraining = false;
    // Notify waitForAudioDone() that we're finished
    if (this.drainResolve) {
      this.drainResolve();
      this.drainResolve = null;
    }
  }

  // Returns a Promise that resolves when the audio queue is fully drained.
  // If nothing is queued or playing, resolves immediately.
  private waitForAudioDone(): Promise<void> {
    if (!this.isDraining && this.audioQueue.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this.drainResolve = resolve;
    });
  }

  // ─── Step 4: End exam (timer or user button) ─────────────────────────────

  async endExam(reason: 'timeout' | 'user_terminated') {
    // Set the flag immediately so any in-flight submitTurn() call knows to bail out.
    this.examEnded = true;
    this.stopListening();
    this.stopTimer();
    this.state.set('evaluating');

    try {
      const result = await this.attemptService.finishAttempt(
        this.attemptId(),
        this.history,
        [this.section()],
        this.scenarioId(),
        reason,
      );

      // Only play the closing line when the timer expires naturally.
      // When the user terminates manually they don't need to hear a sign-off.
      if (reason === 'timeout') {
        await this.playBase64Audio(result.closingAudio);
      }
      this.state.set('done');

      // Navigate to results — we don't have the DB id here so go to dashboard
      // The latest result will be at the top
      this.router.navigate(['/dashboard']);
    } catch {
      this.error.set('Failed to submit evaluation. Please try again.');
      this.state.set('idle');
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  // Converts a base64 MP3 string to an Audio element and plays it.
  // Returns a Promise that resolves when playback ends.
  private playBase64Audio(base64: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audio.onended = () => resolve();
      audio.onerror = () => resolve(); // don't block on audio errors
      audio.play().catch(() => resolve());
    });
  }

  private startTimer() {
    this.timerInterval = setInterval(() => {
      const next = this.timeLeft() - 1;
      this.timeLeft.set(next);
      if (next <= 0) {
        this.endExam('timeout');
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private stopListening() {
    if (this.silenceCheckInterval) clearInterval(this.silenceCheckInterval);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceCheckInterval = null;
    this.silenceTimer = null;
    this.mediaRecorder?.stop();
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.audioContext?.close();
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.analyser = null;
  }

  private cleanup() {
    this.stopListening();
    this.stopTimer();
  }

  // Formats seconds as MM:SS for the timer display
  get formattedTime(): string {
    const m = Math.floor(this.timeLeft() / 60).toString().padStart(2, '0');
    const s = (this.timeLeft() % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  get stateLabel(): string {
    switch (this.state()) {
      case 'idle': return 'Press play to begin';
      case 'listening': return 'Listening...';
      case 'processing': return 'Processing...';
      case 'ai-speaking': return 'Examiner speaking...';
      case 'evaluating': return 'Evaluating...';
      case 'done': return 'Done!';
    }
  }
}
