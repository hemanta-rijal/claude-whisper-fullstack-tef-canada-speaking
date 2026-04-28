/**
 * Delivery (fluency) metrics derived from Whisper `verbose_json`.
 * LEARN: Whisper segments include start/end times in seconds — gaps between segments
 * approximate mid-utterance pauses; segment count hints at fragmentation / self-repairs.
 */

export type DeliverySnapshot = {
  /** Total audio length reported by Whisper (seconds). */
  durationSec: number;
  /** Number of transcript segments (often rises with pauses / restarts). */
  segmentCount: number;
  /** Sum of per-segment voiced duration (seconds). */
  speechDurationSec: number;
  /** Longest silence between consecutive segments (seconds). */
  longestPauseSec: number;
  /** Word count from transcript whitespace split (approximate). */
  wordsEstimate: number;
  /** Rough WPM using Whisper duration; null if duration is negligible. */
  wordsPerMinute: number | null;
};

/** One segment from OpenAI transcription verbose_json (subset of fields we need). */
type WhisperSegment = { start: number; end: number };

/** Top-level verbose_json shape we parse (extra fields ignored). */
type WhisperVerbose = {
  text?: string;
  duration?: number;
  segments?: WhisperSegment[];
};

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/**
 * Builds a compact snapshot for grading from a Whisper verbose transcription payload.
 */
export function buildDeliverySnapshotFromVerbose(verbose: WhisperVerbose): DeliverySnapshot {
  const text = (verbose.text ?? '').trim();
  const segments = verbose.segments ?? [];
  const durationSec = typeof verbose.duration === 'number' && verbose.duration > 0
    ? verbose.duration
    : 0;

  let speechDurationSec = 0;
  for (const s of segments) {
    const dur = Math.max(0, s.end - s.start);
    speechDurationSec += dur;
  }

  // If Whisper omitted segments but gave duration + text, treat whole clip as one block.
  if (segments.length === 0 && durationSec > 0 && text.length > 0) {
    speechDurationSec = durationSec;
  }

  let longestPauseSec = 0;
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!;
    const cur = segments[i]!;
    const gap = Math.max(0, cur.start - prev.end);
    if (gap > longestPauseSec) longestPauseSec = gap;
  }

  const wordsEstimate = wordCount(text);
  const wordsPerMinute = durationSec >= 0.5
    ? Math.round((wordsEstimate / durationSec) * 60 * 10) / 10
    : null;

  return {
    durationSec: Math.round(durationSec * 100) / 100,
    segmentCount: segments.length || (text ? 1 : 0),
    speechDurationSec: Math.round(speechDurationSec * 100) / 100,
    longestPauseSec: Math.round(longestPauseSec * 100) / 100,
    wordsEstimate,
    wordsPerMinute,
  };
}

/**
 * Formats delivery rows for the evaluator prompt (human-readable, French labels).
 */
export function formatDeliveryLogForEvaluator(
  history: Array<{ role: string; content: string }>,
  deliveries: DeliverySnapshot[],
): string {
  const candidateTurnIndexes: number[] = [];
  history.forEach((t, i) => {
    if (t.role === 'candidate') candidateTurnIndexes.push(i);
  });

  if (deliveries.length === 0) {
    return 'DONNÉES DE FLUIDITÉ (débit / pauses) : non disponibles pour cette session.';
  }

  const lines: string[] = [
    'DONNÉES OBJECTIVES DE FLUIDITÉ (ASR Whisper, une ligne par tour du CANDIDAT, dans l’ordre) :',
    'Utilise ces chiffres pour calibrer le critère « coherence » (pauses, fragmentation), pas pour deviner la prononciation.',
    'Les faux départs ou « euh » peuvent apparaître comme plusieurs segments ou longues pauses.',
  ];

  let d = 0;
  for (const turnIdx of candidateTurnIndexes) {
    const snap = deliveries[d];
    d += 1;
    if (!snap) {
      lines.push(`- Tour ${turnIdx + 1} : métriques manquantes.`);
      continue;
    }
    lines.push(
      `- Tour ${turnIdx + 1} : durée audio ${snap.durationSec}s, segments ${snap.segmentCount}, `
      + `pause max entre segments ${snap.longestPauseSec}s, mots ~${snap.wordsEstimate}, `
      + `débit ~${snap.wordsPerMinute ?? 'n/a'} mots/min.`,
    );
  }

  if (deliveries.length > candidateTurnIndexes.length) {
    lines.push(
      `(Note : ${deliveries.length - candidateTurnIndexes.length} mesure(s) en surplus ignorées.)`,
    );
  }

  return lines.join('\n');
}
