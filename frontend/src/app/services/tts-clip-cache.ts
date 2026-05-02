import { Injectable } from '@angular/core';

/** Same literals as backend / `TtsService` — kept local to avoid circular imports with `tts.ts`. */
type ClipLang = 'fr' | 'en';

/** Bump DB name when cache shape changes — browsers create a fresh DB. */
const DB_NAME = 'tef-tts-clips-v1';
const STORE = 'clips';
/** Rough cap so IndexedDB stays bounded (flashcards × 2 langs stays well under this). */
const MAX_CLIPS = 500;

/** Stored row — `id` is deterministic hash of lang + text (+ schema token). */
type ClipRow = {
  id: string;
  blob: Blob;
  storedAt: number;
};

/**
 * Persists MP3 blobs from POST /tts locally so the same phrase does not hit OpenAI again.
 * LEARN: IndexedDB holds structured data + Blobs; unlike localStorage it fits audio-sized payloads.
 */
@Injectable({ providedIn: 'root' })
export class TtsClipCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /** Return cached MP3 or null if missing, unsupported, or storage errors. */
  async get(text: string, lang: ClipLang): Promise<Blob | null> {
    try {
      const db = await this.openDb();
      const id = await this.clipId(lang, text);
      const row = await this.requestRow(db, id);
      const b = row?.blob;
      return b instanceof Blob && b.size > 0 ? b : null;
    } catch {
      return null;
    }
  }

  /** Save successful TTS response; silently no-ops if quota/private mode blocks writes. */
  async put(text: string, lang: ClipLang, blob: Blob): Promise<void> {
    if (!(blob instanceof Blob) || blob.size < 64) return;
    try {
      const db = await this.openDb();
      const id = await this.clipId(lang, text);
      const row: ClipRow = { id, blob, storedAt: Date.now() };
      await this.runWrite(db, (tx) => {
        tx.objectStore(STORE).put(row);
      });
      await this.evictOldestIfNeeded(db);
    } catch {
      /* QuotaExceededError / disabled storage — ignore */
    }
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('indexedDB unavailable'));
          return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onerror = (): void => reject(req.error ?? new Error('IDB open failed'));
        req.onsuccess = (): void => resolve(req.result);
        req.onupgradeneeded = (): void => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const os = db.createObjectStore(STORE, { keyPath: 'id' });
            // LEARN: secondary index lets us delete oldest rows first (LRU-ish eviction).
            os.createIndex('byStoredAt', 'storedAt', { unique: false });
          }
        };
      });
    }
    return this.dbPromise;
  }

  /** Stable id — if backend voice/model changes materially, bump `SCHEMA` to invalidate old blobs. */
  private async clipId(lang: ClipLang, text: string): Promise<string> {
    const SCHEMA = 'v1-gpt4o-mini-tts-coral';
    const payload = `${SCHEMA}|${lang}|${text}`;
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const enc = new TextEncoder().encode(payload);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (let i = 0; i < payload.length; i++) {
      h = (Math.imul(h, 33) ^ payload.charCodeAt(i)) >>> 0;
    }
    return `${lang}-${h.toString(16)}-${payload.length}`;
  }

  private requestRow(db: IDBDatabase, id: string): Promise<ClipRow | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id) as IDBRequest<ClipRow | undefined>;
      req.onsuccess = (): void => resolve(req.result);
      req.onerror = (): void => reject(req.error);
    });
  }

  private runWrite(db: IDBDatabase, fn: (tx: IDBTransaction) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => reject(tx.error);
      fn(tx);
    });
  }

  private async evictOldestIfNeeded(db: IDBDatabase): Promise<void> {
    const n = await this.countRows(db);
    if (n <= MAX_CLIPS) return;
    const toRemove = n - MAX_CLIPS + 24;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => reject(tx.error);
      const idx = tx.objectStore(STORE).index('byStoredAt');
      const req = idx.openCursor();
      let removed = 0;
      req.onsuccess = (): void => {
        const cur = req.result;
        if (!cur || removed >= toRemove) return;
        cur.delete();
        removed++;
        cur.continue();
      };
      req.onerror = (): void => reject(req.error);
    });
  }

  private countRows(db: IDBDatabase): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = (): void => resolve(req.result);
      req.onerror = (): void => reject(req.error);
    });
  }
}
