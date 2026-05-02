import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { TtsClipCacheService } from './tts-clip-cache';

const API = environment.apiUrl;

/** Matches backend `TtsLang` — which language model instructions to use for OpenAI TTS. */
export type TtsLang = 'fr' | 'en';

@Injectable({ providedIn: 'root' })
export class TtsService {
  private http = inject(HttpClient);
  private clipCache = inject(TtsClipCacheService);

  /**
   * MP3 for flashcards: IndexedDB cache keyed by trimmed text + lang, then POST /tts if missing.
   * LEARN: `from` lifts the async cache read into an Observable so we can chain with `switchMap`.
   */
  requestSpeech(text: string, lang: TtsLang): Observable<Blob> {
    const trimmed = text.trim();
    return from(this.clipCache.get(trimmed, lang)).pipe(
      switchMap((cached) => {
        if (cached) return of(cached);
        return this.http.post(`${API}/tts`, { text: trimmed, lang }, { responseType: 'blob' }).pipe(
          tap((blob) => void this.clipCache.put(trimmed, lang, blob)),
        );
      }),
    );
  }
}
