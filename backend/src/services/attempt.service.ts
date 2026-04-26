import { SECTION_A_SCENARIOS, SECTION_B_SCENARIOS } from '../config/tef-prompts.js';
import { transcribeAudio } from './whisper.service.js';
import { textToSpeech } from './tts.service.js';
import { getExaminerResponse, streamExaminerSentences, type Turn } from './examiner.service.js';
import { evaluateConversation } from './evaluator.service.js';
import { resultRepository } from '../repositories/result.repository.js';

// Re-export Turn so the controller can use it without importing from examiner directly.
export type { Turn };

export type Section = 'A' | 'B';

// What the controller gets back from startAttempt()
export type StartAttemptResult = {
  attemptId: string;
  section: Section;
  scenarioId: string;      // frontend needs this to tag subsequent /turn and /finish requests
  scenarioImageUrl: string;
  openingText: string;
  openingAudio: Buffer;
};

// What the controller gets back from processTurn()
export type TurnResult = {
  transcript: string;
  examinerText: string;
  examinerAudio: Buffer;
  skipped: boolean;   // true when Whisper returned empty audio — frontend restarts listening
};

// What the controller gets back from finishAttempt()
export type FinishResult = {
  closingText: string;
  closingAudio: Buffer;
  evaluation: Awaited<ReturnType<typeof evaluateConversation>>;
};

/**
 * Returns just the scenario image URL and ID for a given section — no AI calls.
 * Used by the frontend to show the scenario card BEFORE the user presses Start.
 */
export function getScenarioPreview(section: Section): { scenarioId: string; scenarioImageUrl: string } {
  const scenarios = section === 'A' ? SECTION_A_SCENARIOS : SECTION_B_SCENARIOS;
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  return { scenarioId: scenario.id, scenarioImageUrl: scenario.imageUrl };
}

/**
 * Picks a scenario and generates the opening TTS audio.
 * Accepts an optional scenarioId so the frontend can pin to the same scenario
 * that was already shown in the preview — ensuring consistency.
 * No DB write here — conversation lives on the frontend.
 */
export async function startAttempt(section: Section, scenarioId?: string): Promise<StartAttemptResult> {
  const scenarios = section === 'A' ? SECTION_A_SCENARIOS : SECTION_B_SCENARIOS;

  // If a scenarioId was supplied (from the preview call), use that exact scenario.
  // Fall back to random if the id isn't found (shouldn't happen in practice).
  const scenario = scenarioId
    ? (scenarios.find(s => s.id === scenarioId) ?? scenarios[Math.floor(Math.random() * scenarios.length)])
    : scenarios[Math.floor(Math.random() * scenarios.length)];

  // Generate a simple unique ID — crypto.randomUUID() is built into Node 16+
  const attemptId = crypto.randomUUID();

  // Convert the opening line to speech — this is the first thing the user hears
  const openingAudio = await textToSpeech(scenario.opening);

  return {
    attemptId,
    section,
    scenarioId: scenario.id,
    scenarioImageUrl: scenario.imageUrl,
    openingText: scenario.opening,
    openingAudio,
  };
}

/**
 * Processes one candidate turn:
 * 1. Transcribes the audio with Whisper
 * 2. Asks Claude examiner for the next response (using full conversation history)
 * 3. Converts Claude's response to TTS audio
 *
 * The frontend maintains the full history[] and sends it with every request.
 * This keeps the backend completely stateless.
 */
export async function processTurn(
  audioFilePath: string,
  history: Turn[],
  section: Section,
  scenarioId: string,
): Promise<TurnResult> {
  // Step 1: get the matching scenario so Claude knows its character
  const scenarios = section === 'A' ? SECTION_A_SCENARIOS : SECTION_B_SCENARIOS;
  const scenario = scenarios.find(s => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenarioId: ${scenarioId}`);

  // Step 2: transcribe what the candidate said.
  // Pass the scenario's whisperHint to prime Whisper with domain vocabulary.
  // Returns null if the audio was silent or too short to be meaningful.
  const transcript = await transcribeAudio(audioFilePath, scenario.whisperHint);

  // If Whisper got nothing useful, skip the Claude call entirely.
  // The controller will tell the frontend to restart listening without adding to history.
  if (!transcript) {
    return { transcript: '', examinerText: '', examinerAudio: Buffer.alloc(0), skipped: true };
  }

  // Step 3: append the candidate's turn to history, then ask Claude for the next examiner line
  const updatedHistory: Turn[] = [
    ...history,
    { role: 'candidate', content: transcript },
  ];
  const examinerText = await getExaminerResponse(scenario, updatedHistory, section);

  // Step 4: convert the examiner's response to audio
  const examinerAudio = await textToSpeech(examinerText);

  return { transcript, examinerText, examinerAudio, skipped: false };
}

/**
 * Discriminated union describing every event the streaming turn endpoint can emit.
 * The controller converts each of these into an SSE (Server-Sent Event) message.
 *
 * LEARN: A discriminated union uses a common 'type' field so TypeScript can narrow
 * the type in a switch/case — each branch knows exactly which fields are available.
 */
export type StreamTurnEvent =
  | { type: 'skipped' }                                      // Whisper returned nothing meaningful
  | { type: 'transcript'; text: string }                     // candidate's transcribed speech
  | { type: 'audio'; sentenceText: string; base64: string }  // one TTS sentence chunk
  | { type: 'done' };                                        // stream finished

/**
 * Streaming version of processTurn — yields events as they happen instead of
 * waiting for the full Whisper → Claude → TTS pipeline to complete.
 *
 * Timeline improvement vs processTurn():
 *   Old: Whisper done → wait for ALL of Claude → wait for ALL TTS → return everything
 *   New: Whisper done → sentence 1 from Claude → TTS 1 emitted immediately
 *                     → sentence 2 from Claude → TTS 2 emitted (while client plays TTS 1)
 *
 * The caller uses `for await (const event of streamTurn(...))` to consume events
 * as they arrive and write them to the HTTP response as SSE messages.
 */
export async function* streamTurn(
  audioFilePath: string,
  history: Turn[],
  section: Section,
  scenarioId: string,
): AsyncGenerator<StreamTurnEvent> {
  const scenarios = section === 'A' ? SECTION_A_SCENARIOS : SECTION_B_SCENARIOS;
  const scenario = scenarios.find(s => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenarioId: ${scenarioId}`);

  // Step 1: transcribe — we must have the full transcript before Claude can respond
  const transcript = await transcribeAudio(audioFilePath, scenario.whisperHint);
  if (!transcript) {
    yield { type: 'skipped' };
    return;
  }
  // Emit immediately so the frontend can update the transcript UI right away
  yield { type: 'transcript', text: transcript };

  // Step 2 + 3 interleaved: stream Claude sentence by sentence, TTS each one immediately.
  // updatedHistory includes the candidate's latest turn so Claude has full context.
  const updatedHistory: Turn[] = [
    ...history,
    { role: 'candidate', content: transcript },
  ];

  for await (const sentence of streamExaminerSentences(scenario, updatedHistory, section)) {
    // Each sentence is TTS'd as soon as it arrives — we don't wait for the next one.
    // LEARN: `await` inside a for-await loop is sequential here, but the key gain is
    // that TTS starts on sentence 1 while Claude is still generating sentence 2.
    const audioBuffer = await textToSpeech(sentence);
    yield {
      type: 'audio',
      sentenceText: sentence,
      base64: audioBuffer.toString('base64'),
    };
  }

  yield { type: 'done' };
}

/**
 * Ends the exam:
 * 1. Generates the closing line TTS audio
 * 2. Sends the full conversation to Claude evaluator for scoring
 * 3. Saves the result to the DB
 * 4. Returns evaluation + closing audio to the controller
 */
export async function finishAttempt(
  userId: string,
  history: Turn[],
  sections: Section[],
  scenarioId: string,
  reason: 'timeout' | 'user_terminated',
): Promise<FinishResult> {
  // Pick closing line based on how the exam ended
  const allScenarios = [...SECTION_A_SCENARIOS, ...SECTION_B_SCENARIOS];
  const scenario = allScenarios.find(s => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenarioId: ${scenarioId}`);

  const closingText = reason === 'timeout'
    ? scenario.closingTimeout
    : scenario.closingUserEnded;

  // Run TTS and evaluation in parallel — they don't depend on each other
  // LEARN: Promise.all fires both async calls simultaneously, reducing total wait time
  const [closingAudio, evaluation] = await Promise.all([
    textToSpeech(closingText),
    evaluateConversation(history, sections, reason),
  ]);

  // Save only the final scores to the DB — raw conversation is discarded
  await resultRepository.create({
    userId,
    sections: sections.join('+'),
    cefrLevel: evaluation.cefrLevel,
    overallScore: evaluation.overallScore,
    sectionAScore: evaluation.sectionAScore,
    sectionBScore: evaluation.sectionBScore,
    lexicalRichness: evaluation.lexicalRichness,
    taskFulfillment: evaluation.taskFulfillment,
    grammar: evaluation.grammar,
    coherence: evaluation.coherence,
    feedback: evaluation.feedback,
    suggestions: evaluation.suggestions,
    reason,
  });

  return { closingText, closingAudio, evaluation };
}
