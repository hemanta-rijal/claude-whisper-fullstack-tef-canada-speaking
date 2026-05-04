import Anthropic from '@anthropic-ai/sdk';
import { requireApiKey } from '../lib/env.js';
import {
  vocabularyBuildResultSchema,
  type VocabularyBuildResult,
} from '../schemas/vocabulary.schemas.js';

export type { VocabularyBuildResult };

/**
 * Strips markdown fences and isolates the first `{` … `}` block — models sometimes add chatter.
 * Same idea as evaluator.service.ts (kept local to avoid coupling vocabulary ↔ grading).
 */
function extractJsonObject(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('Vocabulary builder model output contained no JSON object');
  }
  return trimmed.slice(start, end + 1);
}

function parseVocabularyJson(modelText: string): VocabularyBuildResult {
  const jsonStr = extractJsonObject(modelText);
  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[vocabulary-builder] JSON.parse:', msg, 'snippet:', jsonStr.slice(0, 400));
    throw new Error(`Vocabulary builder JSON was not valid: ${msg}`);
  }
  const parsed = vocabularyBuildResultSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('[vocabulary-builder] Zod:', parsed.error.flatten());
    throw new Error('Vocabulary builder JSON did not match the expected shape');
  }
  return parsed.data;
}

/** French system/user prompt — fixed instructions for TEF Canada expression écrite B2–C1. */
function buildPrompt(expression: string): string {
  // Single line avoids accidental multi-line injection in the model prompt.
  const safe = expression.replace(/\s+/g, ' ').trim();
  return `
Mot ou expression à traiter : « ${safe} »

Tu es un expert en préparation au TEF Canada, spécialisé dans l'expression écrite de niveau B2-C1.

Pour chaque mot ou expression fourni par l'utilisateur, génère EXACTEMENT le contenu suivant en JSON, sans aucun texte avant ou après :

{
  "word": "<le mot>",
  "wordEn": "<équivalent ou glose courte en anglais>",
  "pos": "<catégorie grammaticale en français>",
  "posEn": "<same grammatical category label in English>",
  "fd": "<phrase exemple pour un FAIT DIVERS>",
  "fdEn": "<faithful English translation of fd>",
  "diss": "<phrase exemple pour une DISSERTATION>",
  "dissEn": "<faithful English translation of diss>",
  "famille": [
    { "w": "<mot lié>", "p": "<catégorie>", "wEn": "<English gloss of w>", "pEn": "<English category>" },
    ...
  ]
}

TRADUCTIONS ANGLAISES (obligatoires) :
- wordEn / posEn : gloss naturelle ; posEn doit correspondre à pos (ex. « verbe » → \"verb\").
- fdEn / dissEn : traduction fidèle du sens ; conserve le registre (journalistique vs soutenu) autant que possible en anglais.
- famille[].wEn / pEn : gloss courte pour chaque entrée ; pEn aligné sur p.

RÈGLES STRICTES :

Fait divers (fd) :
- Registre journalistique, ton neutre et factuel
- Utilise des formules comme : "Les autorités ont indiqué que...", "Selon les témoins...", "Un drame s'est produit..."
- Passé composé ou présent journalistique
- 1 seule phrase, entre 20 et 35 mots

Dissertation (diss) :
- Registre soutenu et argumentatif
- Utilise des connecteurs logiques : "En effet,", "Il convient de souligner que...", "Force est de constater que..."
- Le mot peut être utilisé au sens propre OU figuré
- 1 seule phrase, entre 20 et 35 mots

Famille de mots (famille) :
- Entre 3 et 6 mots liés (verbe, nom, adjectif, adverbe, locution)
- Inclure uniquement des mots utiles pour le niveau B2-C1
- Toujours inclure au minimum : 1 verbe, 1 nom, 1 adjectif

Réponds UNIQUEMENT avec le JSON. Aucun commentaire, aucune explication.
`.trim();
}

/**
 * Calls Claude with the vocabulary-builder prompt and returns validated structured output.
 * Route → Controller → Service: Anthropic lives here so keys and parsing stay server-side.
 */
export async function buildVocabulary(expression: string): Promise<VocabularyBuildResult> {
  const apiKey = requireApiKey('anthropicApiKey');
  const anthropic = new Anthropic({ apiKey });

  const prompt = buildPrompt(expression);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1600,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== 'text') {
    throw new Error('Unexpected non-text response from vocabulary builder');
  }

  return parseVocabularyJson(block.text);
}
