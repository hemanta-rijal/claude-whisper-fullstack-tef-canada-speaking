import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '../lib/env.js';
import type { Turn } from './examiner.service.js';

const anthropic = new Anthropic({ apiKey: getEnv().anthropicApiKey });

// The structured evaluation Claude returns — maps directly to TestResult in the DB.
export type EvaluationResult = {
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  overallScore: number;       // 0.0–5.0
  sectionAScore: number | null;
  sectionBScore: number | null;
  lexicalRichness: number;    // 0.0–5.0
  taskFulfillment: number;    // 0.0–5.0
  grammar: number;            // 0.0–5.0
  coherence: number;          // 0.0–5.0
  feedback: string;
  suggestions: string;
};

/**
 * Evaluates the full conversation after the exam ends.
 * Claude steps out of character and acts as a TEF Canada examiner scoring the candidate.
 *
 * We ask Claude to return structured JSON so we can parse it reliably into the DB schema.
 */
export async function evaluateConversation(
  history: Turn[],
  sections: ('A' | 'B')[],
  reason: 'timeout' | 'user_terminated',
): Promise<EvaluationResult> {

  // Format the conversation as a readable transcript for Claude to assess.
  const transcript = history
    .map(t => `${t.role === 'examiner' ? 'Examinatrice' : 'Candidat'}: ${t.content}`)
    .join('\n');

  const sectionsLabel = sections.join(' et ');

  const prompt = `
Tu es un examinateur certifié du TEF Canada (Test d'Évaluation de Français).
Évalue UNIQUEMENT la performance orale du CANDIDAT (pas de l'examinatrice) dans la transcription ci-dessous.
Section(s) évaluée(s) : Section ${sectionsLabel}.
${reason === 'user_terminated' ? 'Note : le candidat a mis fin à l\'examen avant la fin du temps imparti — tiens-en compte dans taskFulfillment.' : ''}

TRANSCRIPTION :
${transcript}

NIVEAU CEFR À ATTRIBUER :
Choisis UN seul niveau parmi : A1, A2, B1, B2, C1, C2.
Base ta décision sur la performance orale globale du candidat :
- A1 : quelques mots isolés, ne peut pas accomplir une tâche téléphonique de façon autonome
- A2 : peut gérer des échanges simples et prévisibles avec effort, vocabulaire très limité, erreurs fréquentes
- B1 : gère les situations courantes, communique l'essentiel malgré des erreurs, registre limité
- B2 : à l'aise dans des situations inconnues, bon vocabulaire, erreurs mineures qui ne gênent pas
- C1 : fluide, précis, gère les complications naturellement, vocabulaire riche
- C2 : quasi-natif, aucune erreur significative, expression spontanée et nuancée

CALIBRATION IMPORTANTE :
Sois un évaluateur rigoureux, pas indulgent. Un candidat TEF Canada moyen (niveau B1) obtient environ 2.5–3.0 par critère.
Réserve 4.0–5.0 uniquement pour une performance clairement supérieure à la moyenne.
Si tu hésites entre deux scores, choisis le plus bas.

CRITÈRES D'ÉVALUATION (chaque critère noté de 0.0 à 5.0) :

- lexicalRichness : variété, précision et richesse du vocabulaire utilisé.
  5.0 = vocabulaire varié et précis adapté au contexte
  3.0 = vocabulaire suffisant mais limité ou répétitif
  1.0 = vocabulaire très pauvre, beaucoup de répétitions ou d'approximations

- taskFulfillment : est-ce que le candidat a accompli la tâche principale de façon claire et complète ?
  5.0 = tâche entièrement accomplie avec tous les détails nécessaires
  3.0 = tâche partiellement accomplie, quelques informations manquantes
  1.0 = tâche non accomplie ou très incomplète

- grammar : correction grammaticale (conjugaisons, accords, structures de phrases).
  5.0 = très peu d'erreurs, structures variées et correctes
  3.0 = erreurs présentes mais la communication reste claire
  1.0 = nombreuses erreurs qui gênent la compréhension

- coherence : fluidité, organisation logique, enchaînement naturel des idées, et gestion de la conversation.
  Sois STRICT sur ce critère. La plupart des apprenants intermédiaires se situent entre 2.0 et 3.0.

  5.0 = discours parfaitement fluide et structuré ; transitions naturelles ; aucune hésitation significative ; les idées s'enchaînent logiquement du début à la fin
  4.0 = quelques hésitations mineures mais le fil conducteur est clair ; connecteurs logiques bien utilisés (donc, alors, parce que, en fait...)
  3.0 = hésitations fréquentes ou pauses longues ; quelques ruptures dans la logique ; les idées sont compréhensibles mais pas bien reliées entre elles
  2.0 = réponses courtes et isolées sans lien entre elles ; répétitions du même mot ou de la même phrase ; difficulté à maintenir le fil de la conversation
  1.0 = discours très décousu ; idées aléatoires sans progression ; l'interlocuteur doit faire beaucoup d'efforts pour suivre

  PÉNALISE SPÉCIFIQUEMENT :
  - Les réponses d'une seule phrase sans aucun connecteur logique (−0.5 à −1.0)
  - Les répétitions de la même expression plus d'une fois (−0.5)
  - Les changements de sujet brusques ou non justifiés (−0.5)
  - L'incapacité à enchaîner naturellement après une réponse de l'examinatrice (−0.5)
  - Les hésitations longues ("euh... euh...") avant chaque réponse (−0.5)

Réponds UNIQUEMENT avec ce JSON valide (aucun texte avant ou après, pas de markdown) :
{
  "cefrLevel": "<A1 | A2 | B1 | B2 | C1 | C2>",
  "overallScore": <moyenne arithmétique des 4 critères, arrondie à 1 décimale>,
  "sectionAScore": <score global section A ou null si non testée>,
  "sectionBScore": <score global section B ou null si non testée>,
  "lexicalRichness": <0.0–5.0>,
  "taskFulfillment": <0.0–5.0>,
  "grammar": <0.0–5.0>,
  "coherence": <0.0–5.0>,
  "feedback": "<2–3 phrases de feedback général en français, bienveillant mais honnête>",
  "suggestions": "<2–3 conseils d'amélioration concrets et actionnables en français>"
}
`.trim();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== 'text') {
    throw new Error('Unexpected non-text response from Claude evaluator');
  }

  // Claude sometimes wraps its response in a markdown code fence (```json ... ```)
  // even when told not to. Strip it before parsing.
  // LEARN: this defensive cleaning is standard practice when parsing LLM JSON output.
  const cleaned = block.text
    .trim()
    .replace(/^```json\s*/i, '')  // remove opening ```json
    .replace(/^```\s*/i, '')      // remove opening ``` (no language tag)
    .replace(/```\s*$/i, '')      // remove closing ```
    .trim();

  const parsed = JSON.parse(cleaned) as EvaluationResult;
  return parsed;
}
