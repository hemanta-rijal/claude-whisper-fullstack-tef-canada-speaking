import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface HealthResponse {
  ok: boolean;
  claude: boolean;
  whisper: boolean;
}

@Injectable({ providedIn: 'root' })
export class AiApiService {
  private readonly http = inject(HttpClient);

  /** Relative `/api` is proxied to the Node backend during `ng serve`. */
  private readonly apiPrefix = '/api';

  health(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.apiPrefix}/health`);
  }

  chat(messages: ChatMessage[]): Observable<{ text: string; id?: string; model?: string }> {
    return this.http.post<{ text: string; id?: string; model?: string }>(`${this.apiPrefix}/chat`, {
      messages,
    });
  }

  transcribe(file: File): Observable<{ text: string }> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<{ text: string }>(`${this.apiPrefix}/transcribe`, body);
  }
}
