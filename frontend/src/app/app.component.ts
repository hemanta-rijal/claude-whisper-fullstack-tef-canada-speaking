import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { AiApiService, type ChatMessage } from './services/ai-api.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  private readonly api = inject(AiApiService);

  title = 'Claude + Whisper';

  health = signal<string>('Checking API…');
  chatInput = '';
  chatHistory = signal<ChatMessage[]>([]);
  chatError = signal<string>('');
  busy = signal(false);

  transcribeText = signal<string>('');
  transcribeError = signal<string>('');

  constructor() {
    this.api.health().subscribe({
      next: (h) =>
        this.health.set(
          `API: ${h.ok ? 'up' : 'down'} · Claude: ${h.claude ? 'configured' : 'missing key'} · Whisper: ${h.whisper ? 'configured' : 'missing key'}`,
        ),
      error: () => this.health.set('API unreachable — start the backend on port 3000'),
    });
  }

  sendChat(): void {
    const text = this.chatInput.trim();
    if (!text || this.busy()) return;

    this.busy.set(true);
    this.chatError.set('');

    const messages: ChatMessage[] = [...this.chatHistory(), { role: 'user', content: text }];

    this.api.chat(messages).subscribe({
      next: (res) => {
        this.busy.set(false);
        const reply = res.text ?? '';
        this.chatHistory.set([...messages, { role: 'assistant', content: reply }]);
        this.chatInput = '';
      },
      error: (e) => {
        this.busy.set(false);
        this.chatError.set(e.error?.error ?? e.message ?? 'Request failed');
      },
    });
  }

  clearChat(): void {
    this.chatHistory.set([]);
    this.chatError.set('');
  }

  onAudioSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.transcribeError.set('');
    this.transcribeText.set('Transcribing…');

    this.api.transcribe(file).subscribe({
      next: (res) => this.transcribeText.set(res.text ?? ''),
      error: (e) => {
        this.transcribeText.set('');
        this.transcribeError.set(e.error?.error ?? e.message ?? 'Request failed');
      },
    });
  }
}
