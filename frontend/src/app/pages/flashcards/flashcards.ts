import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Store } from '@ngrx/store';
import {
  TEF_VOCAB_DECK,
  TEF_MODULE_LABELS,
} from '../../data/tef-vocab-deck';
import type { FlashStudyTrack, VocabCard } from '../../data/tef-vocab-deck';
import type { FlashGrade } from './flashcard-model';
import { TtsService, type TtsLang } from '../../services/tts';
import { environment } from '../../../environments/environment';
import { AppShellHeaderComponent } from '../../shared/components/app-shell-header/app-shell-header.component';
import { shellActions } from '../../shared/state/shell/shell.actions';
import { FlashcardsHeroComponent } from './components/flashcards-hero.component';
import { FlashcardsStudyPanelComponent } from './components/flashcards-study-panel.component';
import { FlashcardsEmptyComponent } from './components/flashcards-empty.component';

/** Mastered card ids — excluded until “Reset progress”. */
const STORAGE_KNOWN_IDS = 'tef-flashcards-known-v1';

/**
 * Per-card spaced repetition state (Anki/SM-2 inspired).
 * LEARN: full Anki adds learning steps + decks; here we persist ease + interval + dueAt in localStorage only.
 */
const STORAGE_SRS = 'tef-flashcards-srs-v1';

/** Last chosen deck on flashcards page — Writing vs Speaking. */
const STORAGE_TRACK = 'tef-flashcards-track-v1';

function loadStoredTrack(): FlashStudyTrack {
  if (typeof localStorage === 'undefined') return 'writing';
  try {
    const raw = localStorage.getItem(STORAGE_TRACK);
    if (raw === 'writing' || raw === 'speaking') return raw;
  } catch {
    /* noop */
  }
  return 'writing';
}

/** Persisted scheduling fields for one vocabulary card id. */
export type SrsState = {
  /** Ease factor (SM-2 “EF”), typically ≥ 1.3 */
  ef: number;
  /** Successful reviews in a row (resets on lapse) */
  reps: number;
  /** Last computed interval length (ms) — informative */
  intervalMs: number;
  /** Epoch ms — card should not be prioritized until this time (overdue when ≤ now) */
  dueAt: number;
};

const EF_MIN = 1.3;
const EF_DEFAULT = 2.5;

function defaultSrs(): SrsState {
  return { ef: EF_DEFAULT, reps: 0, intervalMs: 0, dueAt: 0 };
}

function isSrsState(x: unknown): x is SrsState {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o['ef'] === 'number' &&
    typeof o['reps'] === 'number' &&
    typeof o['intervalMs'] === 'number' &&
    typeof o['dueAt'] === 'number'
  );
}

/** Map UI grades (except mastered) to SM-2 quality 1–5 (1 = complete failure). */
function gradeToQuality(g: Exclude<FlashGrade, 'too_easy'>): number {
  switch (g) {
    case 'too_hard':
      return 1;
    case 'hard':
      return 3;
    case 'ok':
      return 4;
    case 'easy':
      return 5;
  }
}

/**
 * SM-2–style update using millisecond intervals so “due soon” works in one sitting (like Anki learning steps).
 * q &lt; 3 = lapse → short 1 min delay + ease penalty; q ≥ 3 grows interval using EF.
 */
function applySm2(prev: SrsState, q: number, now: number): SrsState {
  let { ef, reps, intervalMs } = prev;
  if (q < 3) {
    ef = Math.max(EF_MIN, ef - 0.2);
    reps = 0;
    intervalMs = 60_000;
    return { ef, reps, intervalMs, dueAt: now + intervalMs };
  }
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ef = Math.max(EF_MIN, ef);
  reps += 1;
  if (reps === 1) {
    intervalMs = 10 * 60 * 1000;
  } else if (reps === 2) {
    intervalMs = 24 * 60 * 60 * 1000;
  } else {
    intervalMs = Math.round(intervalMs * ef);
    intervalMs = Math.min(intervalMs, 365 * 24 * 60 * 60 * 1000);
  }
  if (q === 3) intervalMs = Math.round(intervalMs * 0.55);
  if (q === 5) intervalMs = Math.round(intervalMs * 1.25);
  return { ef, reps, intervalMs, dueAt: now + intervalMs };
}

function shuffleIds(ids: string[]): string[] {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j]!;
    copy[j] = tmp!;
  }
  return copy;
}

@Component({
  selector: 'app-flashcards',
  imports: [
    AppShellHeaderComponent,
    FlashcardsHeroComponent,
    FlashcardsStudyPanelComponent,
    FlashcardsEmptyComponent,
  ],
  templateUrl: './flashcards.html',
  styleUrl: './flashcards.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class Flashcards implements OnInit, OnDestroy {
  private store = inject(Store);
  private tts = inject(TtsService);

  /** Which language clip is loading — POST /tts MP3 or browser utterance */
  ttsLoading = signal<TtsLang | null>(null);
  ttsError = signal<string | null>(null);

  private audioEl: HTMLAudioElement | null = null;
  private audioObjectUrl: string | null = null;

  /** Labels for chips — template uses `moduleLabels['writing']`, etc. */
  readonly moduleLabels = TEF_MODULE_LABELS;

  /** Which TEF skill deck is active (only cards with matching `VocabCard.module`). */
  studyTrack = signal<FlashStudyTrack>(loadStoredTrack());

  /** Queue — default sorted by SRS due time (most overdue first). */
  order = signal<string[]>([]);
  index = signal(0);
  flipped = signal(false);

  knownIds = signal<Set<string>>(new Set());
  /** Mutable snapshot persisted to localStorage after each review. */
  srsById = signal<Map<string, SrsState>>(new Map());

  readonly currentId = computed(() => {
    const q = this.order();
    const i = this.index();
    return q[i] ?? null;
  });

  readonly currentCard = computed((): VocabCard | null => {
    const id = this.currentId();
    if (!id) return null;
    return TEF_VOCAB_DECK.find((c) => c.id === id) ?? null;
  });

  readonly progressText = computed(() => {
    const n = this.order().length;
    const i = this.index();
    if (!n) return 'Deck complete';
    return `${Math.min(i + 1, n)} / ${n}`;
  });

  readonly knownCount = computed(() => this.knownIds().size);

  /** No rows in `TEF_VOCAB_DECK` for the current track — prompt user to add cards or switch. */
  readonly trackIsEmpty = computed(() =>
    TEF_VOCAB_DECK.every((c) => c.module !== this.studyTrack()),
  );

  ngOnInit(): void {
    this.store.dispatch(shellActions.brandTaglineSet({ tagline: 'Vocabulary flashcards' }));
    this.knownIds.set(this.loadKnownFromStorage());
    this.srsById.set(this.loadSrsFromStorage());
    this.rebuildStudyOrder(false);
    // Warm up voice list when owner configured browser TTS — helps Chrome populate French voices before first tap.
    if (
      environment.flashcardTtsMode === 'browser' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      void this.ensureSpeechVoicesLoaded(window.speechSynthesis);
    }
  }

  ngOnDestroy(): void {
    this.cleanupPlayback();
  }

  /**
   * Play FR/EN for the current card: either POST /tts (OpenAI) or `speechSynthesis` (no API cost).
   * LEARN: `speechSynthesis.getVoices()` is often empty until `voiceschanged` fires once (Chrome).
   */
  async playLang(lang: TtsLang): Promise<void> {
    const card = this.currentCard();
    if (!card) return;
    const text = (lang === 'fr' ? card.fr : card.en).trim();
    if (!text) return;

    const mode = environment.flashcardTtsMode;
    this.cleanupPlayback();
    this.ttsError.set(null);
    this.ttsLoading.set(lang);
    try {
      if (mode === 'browser') {
        await this.playWithSpeechSynthesis(text, lang);
      } else {
        const blob = await firstValueFrom(this.tts.requestSpeech(text, lang));
        const url = URL.createObjectURL(blob);
        this.audioObjectUrl = url;
        const audio = new Audio(url);
        this.audioEl = audio;
        // LEARN: after natural end we clear `src` / revoke the blob — some browsers still fire `error` on teardown; strip handlers first in cleanup.
        audio.onended = () => this.cleanupPlayback();
        audio.onerror = () => {
          this.ttsError.set('Audio playback failed.');
          this.cleanupPlayback();
        };
        await audio.play();
      }
    } catch {
      this.ttsError.set(
        mode === 'browser'
          ? 'Browser speech failed — install a French voice in system settings, or set flashcardTtsMode to api in environment.'
          : 'Could not load pronunciation — stay signed in and ensure OPENAI_API_KEY is set on the backend.',
      );
      this.cleanupPlayback();
    } finally {
      this.ttsLoading.set(null);
    }
  }

  /** Uses the OS/browser speech engine; resolves when the utterance finishes or rejects if unsupported. */
  private async playWithSpeechSynthesis(text: string, lang: TtsLang): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      throw new Error('speechSynthesis unavailable');
    }
    const synth = window.speechSynthesis;
    await this.ensureSpeechVoicesLoaded(synth);
    const utter = new SpeechSynthesisUtterance(text);
    const voice = this.pickSpeechVoice(synth.getVoices(), lang);
    // LEARN: set both `voice` and `lang` — some engines ignore `lang` if `voice` is set; voice.lang anchors French correctly.
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
    }
    return new Promise((resolve, reject) => {
      utter.onend = () => resolve();
      utter.onerror = () => reject(new Error('utterance error'));
      synth.speak(utter);
    });
  }

  /** Wait once for voices — Chrome populates them asynchronously after page load. */
  private ensureSpeechVoicesLoaded(synth: SpeechSynthesis): Promise<void> {
    if (synth.getVoices().length > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (): void => {
        synth.removeEventListener('voiceschanged', done);
        resolve();
      };
      synth.addEventListener('voiceschanged', done);
      window.setTimeout(done, 800);
    });
  }

  /** Safari/WebKit sometimes uses underscores in `SpeechSynthesisVoice.lang`. */
  private normalizeVoiceLang(tag: string): string {
    return tag.trim().toLowerCase().replace(/_/g, '-');
  }

  /**
   * Prefer a real French/English voice — Chrome often lists many `fr-*`/`en-*` entries;
   * ranking avoids picking the wrong locale and helps when tags are non-standard.
   */
  private pickSpeechVoice(voices: SpeechSynthesisVoice[], lang: TtsLang): SpeechSynthesisVoice | null {
    if (!voices.length) return null;
    if (lang === 'fr') {
      const frVoices = voices.filter((v) => {
        const l = this.normalizeVoiceLang(v.lang);
        return l === 'fr' || l.startsWith('fr-');
      });
      if (!frVoices.length) return null;
      const rankFr = (v: SpeechSynthesisVoice): number => {
        const l = this.normalizeVoiceLang(v.lang);
        const name = (v.name || '').toLowerCase();
        if (l === 'fr-fr') return 0;
        if (l.startsWith('fr-fr')) return 1;
        if (name.includes('french') || name.includes('français') || name.includes('francais')) return 2;
        if (l === 'fr-ca' || l.startsWith('fr-ca')) return 4;
        if (l.startsWith('fr-be')) return 5;
        if (l.startsWith('fr-ch')) return 6;
        if (l.startsWith('fr')) return 8;
        return 20;
      };
      return [...frVoices].sort((a, b) => rankFr(a) - rankFr(b))[0] ?? null;
    }
    const enVoices = voices.filter((v) => {
      const l = this.normalizeVoiceLang(v.lang);
      return l === 'en' || l.startsWith('en-');
    });
    if (!enVoices.length) return null;
    const rankEn = (v: SpeechSynthesisVoice): number => {
      const l = this.normalizeVoiceLang(v.lang);
      if (l === 'en-us' || l.startsWith('en-us')) return 0;
      if (l === 'en-gb' || l.startsWith('en-gb')) return 2;
      return 6;
    };
    return [...enVoices].sort((a, b) => rankEn(a) - rankEn(b))[0] ?? null;
  }

  /**
   * Drop blob URL + `<audio>` without firing mistaken `error` (clearing `src` after `ended` looks like a decode failure on some engines).
   */
  private detachAudioElement(): void {
    if (!this.audioEl) {
      if (this.audioObjectUrl) {
        URL.revokeObjectURL(this.audioObjectUrl);
        this.audioObjectUrl = null;
      }
      return;
    }
    const a = this.audioEl;
    a.onerror = null;
    a.onended = null;
    a.pause();
    a.removeAttribute('src');
    try {
      a.load();
    } catch {
      /* ignore — resets decoder state where supported */
    }
    this.audioEl = null;
    if (this.audioObjectUrl) {
      URL.revokeObjectURL(this.audioObjectUrl);
      this.audioObjectUrl = null;
    }
  }

  private cleanupPlayback(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.detachAudioElement();
  }

  private loadKnownFromStorage(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KNOWN_IDS);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.filter((x): x is string => typeof x === 'string'));
    } catch {
      return new Set();
    }
  }

  private persistKnown(ids: Set<string>): void {
    localStorage.setItem(STORAGE_KNOWN_IDS, JSON.stringify([...ids]));
  }

  private loadSrsFromStorage(): Map<string, SrsState> {
    const map = new Map<string, SrsState>();
    try {
      const raw = localStorage.getItem(STORAGE_SRS);
      if (!raw) return map;
      const obj = JSON.parse(raw) as Record<string, unknown>;
      for (const [id, val] of Object.entries(obj)) {
        if (isSrsState(val)) map.set(id, val);
      }
    } catch {
      /* ignore corrupt SRS blob */
    }
    return map;
  }

  private persistSrs(map: Map<string, SrsState>): void {
    const obj: Record<string, SrsState> = {};
    map.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem(STORAGE_SRS, JSON.stringify(obj));
  }

  private snapshotSrs(id: string): SrsState {
    return this.srsById().get(id) ?? defaultSrs();
  }

  /** Due timestamp for sorting — missing entries treated as immediately due. */
  private dueAt(id: string): number {
    return this.snapshotSrs(id).dueAt;
  }

  /** Card ids that belong to the active Writing/Speaking track. */
  private deckIdsForTrack(): string[] {
    const t = this.studyTrack();
    return TEF_VOCAB_DECK.filter((c) => c.module === t).map((c) => c.id);
  }

  /** Non-mastered ids within this track; if all mastered in-track, cycle the full track again. */
  private eligibleIds(): string[] {
    const pool = this.deckIdsForTrack();
    if (!pool.length) return [];
    const known = this.knownIds();
    let ids = pool.filter((id) => !known.has(id));
    if (!ids.length) ids = [...pool];
    return ids;
  }

  /** Switch Writing ↔ Speaking — persisted so your choice returns on next visit. */
  selectTrack(track: FlashStudyTrack): void {
    this.studyTrack.set(track);
    try {
      localStorage.setItem(STORAGE_TRACK, track);
    } catch {
      /* private mode / quota */
    }
    this.rebuildStudyOrder(false);
  }

  /**
   * Rebuild queue from persistence: SRS sort (overdue first, then soonest due), or random shuffle.
   * After each graded review we resort so hard cards bubble back when their short due elapses.
   */
  rebuildStudyOrder(shuffled: boolean): void {
    const ids = this.eligibleIds();
    const now = Date.now();
    let next: string[];
    if (shuffled) {
      next = shuffleIds(ids);
    } else {
      next = [...ids].sort((a, b) => {
        const da = this.dueAt(a);
        const db = this.dueAt(b);
        const aOver = da <= now;
        const bOver = db <= now;
        if (aOver !== bOver) return aOver ? -1 : 1;
        if (da !== db) return da - db;
        return a.localeCompare(b);
      });
    }
    this.order.set(next);
    this.index.set(0);
    this.flipped.set(false);
  }

  /** Random order — does not erase SRS; next “scheduled” sort restores priority. */
  shuffleDeck(): void {
    this.rebuildStudyOrder(true);
  }

  /** Back-compat name used in template empty-state / hero — defaults to SRS order. */
  bootstrapQueue(): void {
    this.rebuildStudyOrder(false);
  }

  toggleFlip(): void {
    if (!this.currentCard()) return;
    this.flipped.update((v) => !v);
  }

  prev(): void {
    const n = this.order().length;
    if (!n) return;
    this.index.update((i) => (i - 1 + n) % n);
    this.flipped.set(false);
  }

  next(): void {
    const n = this.order().length;
    if (!n) return;
    this.index.update((i) => (i + 1) % n);
    this.flipped.set(false);
  }

  /** Persist SM-2 update and resort — same pattern as Anki: hardest cards get short dueAt and surface again soon. */
  rate(grade: FlashGrade): void {
    if (grade === 'too_easy') {
      this.markKnown();
      return;
    }
    const id = this.currentId();
    if (!id) return;

    const now = Date.now();
    const q = gradeToQuality(grade);
    const prev = this.snapshotSrs(id);
    const nextState = applySm2(prev, q, now);

    const map = new Map(this.srsById());
    map.set(id, nextState);
    this.srsById.set(map);
    this.persistSrs(map);

    this.rebuildStudyOrder(false);
  }

  markKnown(): void {
    const id = this.currentId();
    if (!id) return;

    const nextKnown = new Set(this.knownIds());
    nextKnown.add(id);
    this.knownIds.set(nextKnown);
    this.persistKnown(nextKnown);

    const map = new Map(this.srsById());
    map.delete(id);
    this.srsById.set(map);
    this.persistSrs(map);

    this.rebuildStudyOrder(false);
  }

  resetProgress(): void {
    const empty = new Set<string>();
    this.knownIds.set(empty);
    this.persistKnown(empty);
    const emptySrs = new Map<string, SrsState>();
    this.srsById.set(emptySrs);
    localStorage.removeItem(STORAGE_SRS);
    this.rebuildStudyOrder(false);
  }

  onDocumentKeydown(ev: KeyboardEvent): void {
    const el = ev.target;
    if (!(el instanceof HTMLElement)) return;
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      return;
    }
    if (el instanceof HTMLButtonElement && !el.classList.contains('flash-card')) {
      // LEARN: rating/nav buttons swallow shortcuts — except French audio control (still allow arrows elsewhere via card focus).
      if (!el.classList.contains('flash-audio-btn')) return;
    }
    switch (ev.key) {
      case 'f':
      case 'F':
        if (ev.ctrlKey || ev.metaKey || ev.altKey) break;
        if (ev.repeat) break;
        ev.preventDefault();
        void this.playLang('fr');
        break;
      case ' ':
      case 'Enter':
        ev.preventDefault();
        this.toggleFlip();
        break;
      case 'ArrowLeft':
        ev.preventDefault();
        this.prev();
        break;
      case 'ArrowRight':
        ev.preventDefault();
        this.next();
        break;
      default:
        break;
    }
  }
}
