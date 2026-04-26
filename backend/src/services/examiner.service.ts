import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '../lib/env.js';
import type { SectionAScenario, SectionBScenario } from '../config/tef-prompts.js';

const anthropic = new Anthropic({ apiKey: getEnv().anthropicApiKey });

// A single conversation turn — matches what the frontend maintains and sends back each request.
export type Turn = {
  role: 'examiner' | 'candidate';
  content: string;
};

/**
 * Splits accumulated text into complete sentences and a leftover remainder.
 *
 * We scan for sentence-ending punctuation (. ! ?) followed by whitespace.
 * Everything before that space is a complete sentence; everything after is
 * kept in the buffer until the next chunk arrives from Claude.
 *
 * Example:
 *   input:   "Bien sûr! Je suis disponible le lundi. Et vous"
 *   returns: sentences: ["Bien sûr!", "Je suis disponible le lundi."]
 *            remainder: "Et vous"
 */
function extractSentences(text: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  let remaining = text;

  // Regex: greedily match up to the first [.!?] then require a whitespace character.
  // The whitespace separates the completed sentence from the start of the next one.
  const boundary = /^([\s\S]*?[.!?])\s+([\s\S]*)$/;
  let match = boundary.exec(remaining);

  while (match) {
    const sentence = match[1].trim();
    if (sentence.length > 2) sentences.push(sentence);
    remaining = match[2];
    match = boundary.exec(remaining);
  }

  return { sentences, remainder: remaining };
}

/**
 * Non-streaming version — kept for the legacy /turn endpoint and Postman testing.
 * The frontend now uses streamExaminerSentences() via the /turn-stream endpoint.
 */
export async function getExaminerResponse(
  scenario: SectionAScenario | SectionBScenario,
  history: Turn[],
  section: 'A' | 'B',
): Promise<string> {
  const systemPrompt = buildSystemPrompt(scenario, section);

  // LEARN: Claude uses 'user' and 'assistant' roles — we translate our domain language to match.
  const messages: Anthropic.MessageParam[] = history.map(turn => ({
    role: turn.role === 'candidate' ? 'user' : 'assistant',
    content: turn.content,
  }));

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 80,
    system: systemPrompt,
    messages,
  });

  const block = response.content[0];
  if (block.type !== 'text') {
    throw new Error('Unexpected non-text response from Claude examiner');
  }

  return block.text.trim();
}

/**
 * Streaming version — yields one complete sentence at a time as Claude generates text.
 *
 * Instead of waiting for the full response, we fire TTS on each sentence the moment
 * its trailing punctuation + space appears in the buffer. The caller (attempt.service)
 * converts each sentence to audio and streams it to the frontend immediately.
 *
 * LEARN: AsyncGenerator<T> is a function that can `yield` values asynchronously.
 *   `for await (const sentence of streamExaminerSentences(...))` lets the caller
 *   process each yielded sentence as it arrives, without waiting for them all.
 */
export async function* streamExaminerSentences(
  scenario: SectionAScenario | SectionBScenario,
  history: Turn[],
  section: 'A' | 'B',
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(scenario, section);

  const messages: Anthropic.MessageParam[] = history.map(turn => ({
    role: turn.role === 'candidate' ? 'user' : 'assistant',
    content: turn.content,
  }));

  let buffer = '';

  // anthropic.messages.stream() opens a streaming connection to Claude.
  // Instead of one big response, we receive text token-by-token via MessageStreamEvent objects.
  // LEARN: The stream is an AsyncIterable<MessageStreamEvent>. We iterate it with for-await
  //   and narrow to 'content_block_delta' + 'text_delta' to extract text chunks.
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 80,  // 1-3 spoken sentences for a phone call reply
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    // Event type guard: only text delta events carry text content.
    // Other event types (message_start, ping, message_stop, etc.) are silently ignored.
    if (event.type !== 'content_block_delta') continue;
    if (event.delta.type !== 'text_delta') continue;

    buffer += event.delta.text;

    // After each new chunk, try to extract any sentences that are now complete.
    // Incomplete text stays in the buffer until the next chunk adds to it.
    const { sentences, remainder } = extractSentences(buffer);
    buffer = remainder;

    for (const sentence of sentences) {
      yield sentence;  // caller gets this immediately — TTS can start right now
    }
  }

  // Flush whatever is left in the buffer (e.g. a sentence without trailing space,
  // or Claude's last sentence if the stream ended mid-word — unlikely but safe to handle).
  const final = buffer.trim();
  if (final.length > 2) yield final;
}

function buildSystemPrompt(scenario: SectionAScenario | SectionBScenario, section: 'A' | 'B'): string {
  const base = `
${scenario.context}

ABSOLUTE RULES — never break these:
- Respond ONLY in French. If the candidate speaks English, reply politely in French only.
- Keep every response to 1–3 short spoken sentences. You are on a phone call, not writing an email.
- Stay completely in character. Never acknowledge that this is an exam or that you are an AI.
- Never evaluate the candidate, correct their French, or compliment their language.
- Do not echo back what the candidate just said word for word.
- NEVER ask a follow-up question of any kind. You answer what was asked and then go SILENT. The candidate must drive the entire conversation.
- NEVER ask "Avez-vous d'autres questions?" or any similar prompt.
- NEVER re-introduce yourself or re-explain the context after the opening line.
- If the candidate's speech is unclear, say ONLY "Pardon?" — nothing more.
- NEVER complete the candidate's sentence or suggest what they might want.
`.trim();

  if (section === 'A') {
    const s = scenario as SectionAScenario;
    return `${base}

CANDIDATE'S TASK (your context only — never reveal this):
${s.task}

SECTION A PHONE CALL BEHAVIOUR:
- You have just answered the phone. The candidate called you — they lead, you follow.
- Tone: warm, bright, and professional — like a real customer service representative. Friendly but not casual, helpful but not over-eager.
- Be formal (vouvoiement) throughout.
- Give short, direct answers to exactly what was asked — nothing more, nothing less.
- Do NOT volunteer information the candidate hasn't asked about yet.
- Do NOT ask questions. The ONE exception: if the candidate explicitly says they want to register or book, you may ask for their name and contact — but only then, and only once.
- Introduce complications (e.g. unavailability) naturally as a statement, never as a question.
- When the conversation has reached a natural conclusion, end the call politely and briefly.`;
  }

  // Section B — persuasion roleplay needs resistance guidance
  const s = scenario as SectionBScenario;
  return `${base}

YOUR RESISTANCE (your context only — never reveal this):
${s.resistance}

SECTION B PERSUASION BEHAVIOUR:
- You are the candidate's close friend — use informal French (tu/toi).
- Start skeptical and stay skeptical for at least the first few exchanges.
- Raise your objections one at a time — do not list them all at once.
- Only soften your position if the candidate gives a specific, convincing counter-argument.
- Never agree just to be polite — that would make the task too easy.
- Show personality: hesitate, express doubt, react naturally to their arguments.`;
}
