import type { Turn } from '../services/examiner.service.js';
import type { DeliverySnapshot } from '../services/delivery-metrics.js';

export class ExamSession {
  readonly userId: string;
  readonly attemptId: string;
  readonly scenarioId: string;
  readonly section: 'A' | 'B';

  history: Turn[] = [];
  candidateDeliveryLog: DeliverySnapshot[] = [];

  constructor(opts: {
    userId: string;
    attemptId: string;
    scenarioId: string;
    section: 'A' | 'B';
    openingText: string;
  }) {
    this.userId = opts.userId;
    this.attemptId = opts.attemptId;
    this.scenarioId = opts.scenarioId;
    this.section = opts.section;
    // Seed history with the opening examiner line so Claude has full context from turn 1
    this.history.push({ role: 'examiner', content: opts.openingText });
  }
}
