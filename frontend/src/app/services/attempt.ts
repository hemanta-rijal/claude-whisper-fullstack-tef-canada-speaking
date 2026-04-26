import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const API = 'http://localhost:3000';

export type TestResult = {
  id: string;
  sections: string;
  cefrLevel: string | null;   // 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' — null for old results
  overallScore: number;
  sectionAScore: number | null;
  sectionBScore: number | null;
  lexicalRichness: number;
  taskFulfillment: number;
  grammar: number;
  coherence: number;
  feedback: string;
  suggestions: string;
  reason: string;
  completedAt: string;
};

// Returned by GET /attempts/preview — instant, no AI calls
export type ScenarioPreviewResponse = {
  scenarioId: string;
  scenarioImageUrl: string;
};

export type StartAttemptResponse = {
  attemptId: string;
  section: 'A' | 'B';
  scenarioId: string;
  scenarioImageUrl: string;
  openingText: string;
  openingAudio: string; // base64 MP3
};

export type TurnResponse = {
  skipped: boolean;       // true = Whisper got silence, no history update needed
  transcript: string;
  examinerText: string;
  examinerAudio: string;
};

export type FinishResponse = {
  closingText: string;
  closingAudio: string; // base64 MP3
  evaluation: Omit<TestResult, 'id' | 'completedAt' | 'reason'>;
};

@Injectable({ providedIn: 'root' })
export class AttemptService {
  private http = inject(HttpClient);

  async getResults(): Promise<TestResult[]> {
    return firstValueFrom(this.http.get<TestResult[]>(`${API}/attempts/results`));
  }

  async getResultById(id: string): Promise<TestResult> {
    return firstValueFrom(this.http.get<TestResult>(`${API}/attempts/results/${id}`));
  }

  // Fetches the scenario image/id instantly — call this before beginExam() so
  // the candidate can read the card before pressing Start.
  async getScenarioPreview(section: 'A' | 'B'): Promise<ScenarioPreviewResponse> {
    return firstValueFrom(
      this.http.get<ScenarioPreviewResponse>(`${API}/attempts/preview`, { params: { section } }),
    );
  }

  // Passes scenarioId so the backend uses the same scenario shown in the preview.
  async startAttempt(section: 'A' | 'B', scenarioId: string): Promise<StartAttemptResponse> {
    return firstValueFrom(
      this.http.post<StartAttemptResponse>(`${API}/attempts/start`, { section, scenarioId }),
    );
  }

  async submitTurn(
    attemptId: string,
    audioBlob: Blob,
    history: { role: string; content: string }[],
    section: 'A' | 'B',
    scenarioId: string,
  ): Promise<TurnResponse> {
    const form = new FormData();
    form.append('audio', audioBlob, 'turn.webm');
    form.append('history', JSON.stringify(history));
    form.append('section', section);
    form.append('scenarioId', scenarioId);

    return firstValueFrom(
      this.http.post<TurnResponse>(`${API}/attempts/${attemptId}/turn`, form),
    );
  }

  async finishAttempt(
    attemptId: string,
    history: { role: string; content: string }[],
    sections: ('A' | 'B')[],
    scenarioId: string,
    reason: 'timeout' | 'user_terminated',
  ): Promise<FinishResponse> {
    return firstValueFrom(
      this.http.post<FinishResponse>(`${API}/attempts/${attemptId}/finish`, {
        history,
        sections,
        scenarioId,
        reason,
      }),
    );
  }
}
