import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AttemptService } from '../../services/attempt';

type ExamState = 'idle' | 'listening' | 'processing' | 'ai-speaking' | 'evaluating' | 'done';
type Turn = { role: 'examiner' | 'candidate'; content: string };

const EXAM_DURATION_SECONDS = 5 * 60; // 5 minutes
const SILENCE_THRESHOLD = 10;         // audio level below this = silence (0-255 scale)
const SILENCE_DURATION_MS = 1800;     // 1.8s of silence triggers submission

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
      this.scenarioImageUrl.set(`http://localhost:3000${preview.scenarioImageUrl}`);
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
      this.scenarioImageUrl.set(`http://localhost:3000${result.scenarioImageUrl}`);

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
    let speakingStarted = false;

    this.silenceCheckInterval = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      if (avg > SILENCE_THRESHOLD) {
        // User is speaking — clear any pending silence timer
        speakingStarted = true;
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else if (speakingStarted && !this.silenceTimer) {
        // Silence detected after speech — start countdown to submit
        this.silenceTimer = setTimeout(() => {
          this.submitTurn();
        }, SILENCE_DURATION_MS);
      }
    }, 100);
  }

  // ─── Step 3: Submit candidate audio, get examiner response ───────────────

  private async submitTurn() {
    this.stopListening();
    this.state.set('processing');

    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

    try {
      const result = await this.attemptService.submitTurn(
        this.attemptId(),
        audioBlob,
        this.history,
        this.section(),
        this.scenarioId(),
      );

      if (this.examEnded) return;

      // Whisper returned empty audio (silence or noise) — skip this turn entirely.
      // Don't add anything to history, don't call Claude, just listen again.
      if (result.skipped) {
        await this.startListening();
        return;
      }

      // Store both turns in history
      this.history.push({ role: 'candidate', content: result.transcript });
      this.history.push({ role: 'examiner', content: result.examinerText });

      // Play examiner response, then listen again
      this.state.set('ai-speaking');
      await this.playBase64Audio(result.examinerAudio);

      // Check again after audio playback — endExam() could have been called
      // while the audio was playing (e.g. timer hit zero mid-sentence).
      if (this.examEnded) return;

      await this.startListening();
    } catch {
      if (this.examEnded) return;
      this.error.set('Connection error. Trying to continue...');
      await this.startListening();
    }
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
