// TEF Canada speaking scenarios — static config, not stored in DB.
// Add more scenarios to each array to increase variety.

export type SectionAScenario = {
  id: string;
  imageUrl: string;          // served from /assets/scenarios/section-a/
  context: string;           // Claude system prompt: who the AI is playing
  opening: string;           // first line the AI speaks (TTS)
  task: string;              // what the candidate must accomplish
  whisperHint: string;       // primes Whisper with domain vocabulary — improves transcription accuracy
  closingTimeout: string;    // line played when 5-min timer hits zero
  closingUserEnded: string;  // line played when user presses [End Exam]
};

export type SectionBScenario = {
  id: string;
  imageUrl: string;          // served from /assets/scenarios/section-b/
  context: string;           // Claude system prompt: who the AI is playing
  opening: string;           // first line the AI speaks (TTS)
  resistance: string;        // what objections Claude should raise
  whisperHint: string;
  closingTimeout: string;
  closingUserEnded: string;
};

export const SECTION_A_SCENARIOS: SectionAScenario[] = [
  {
    id: 'faites-la-fete',
    imageUrl: '/assets/scenarios/section-a/2.png',

    // SCENARIO SOURCE: Real TEF Canada Section A card.
    // The candidate has read an ad for "Faites la fête" event agency and is calling
    // 07 98 76 54 32 to get more information about organising an event.
    //
    // Only identity + facts here. Shared behavioural instructions are in examiner.service.ts.
    context: `You are a consultant at "Faites la fête", a personalised event planning agency.
You have just answered the phone at 07 98 76 54 32.

FACTS YOU KNOW ABOUT THE AGENCY:
- The agency organises customised events: birthdays, family celebrations, corporate events, and more
- Services offered:
    - Personalised decorations (themes, colours, flowers, balloons — tailored to the client)
    - Varied buffets and drinks (adapted to taste and dietary requirements)
    - Music of the client's choice (DJ, live band, playlist)
    - Events can be afternoon or evening
    - Venue or at-home service available
    - Suitable for all ages — children and adults
- Pricing (indicative):
    - Decoration-only package: from 200€
    - Full package (décoration + buffet + musique): from 600€, depending on number of guests
    - Custom quotes are always free — you need the event type, date, number of guests, and venue preference
- Minimum booking: 2 weeks in advance
- Availability this month is limited — weekends fill up fast
- To prepare a free quote you need: type of event, approximate date, number of guests, venue or home`,

    opening: `Faites la fête, bonjour!`,

    task: `The caller has read the "Faites la fête" advertisement and wants information about organising an event. They should ask about the services available, pricing, and logistics (timing, venue vs home, how to book). The ideal outcome is that they provide enough details (event type, date, guests) for the agent to offer a free personalised quote.`,

    // LEARN: Whisper `prompt` biases vocabulary — add likely learner phrases + numbers so STT survives accent.
    whisperHint: `Appel à une agence événementielle en français. Je voudrais des renseignements, j'appelle pour, pourriez-vous m'expliquer, combien ça coûte, quel est le prix, le tarif, c'est combien, gratuit, devis gratuit, réservation, réserver, disponible, samedi dimanche, le week-end, combien de personnes, nombre d'invités, à la maison, chez moi, sur place, enfants adultes. Fête, soirée, anniversaire, mariage, célébration, événement, décoration, thème, buffet, musique, DJ, invités, salle, domicile, après-midi, le soir, personnalisé. Zéro sept, quatre-vingt-dix-huit, soixante-seize, cinquante-quatre, trente-deux.`,

    closingTimeout: `Très bien, j'ai toutes les informations nécessaires pour préparer votre devis. Je vous rappelle dans les 24 heures. Merci de votre appel et à très bientôt!`,
    closingUserEnded: `Pas de problème, n'hésitez pas à rappeler au 07 98 76 54 32. On sera ravis de vous aider à organiser votre événement. Bonne journée!`,
  },

  {
    id: 'club-de-marche',
    imageUrl: '/assets/scenarios/section-a/1.png',

    // SCENARIO SOURCE: Real TEF Canada Section A card.
    // The candidate has read an ad for "Club de Marche" and is calling 0801 12 12 451
    // to get more information before deciding whether to join.
    //
    // Only identity + facts. Shared behavioural instructions are injected by buildSystemPrompt().
    context: `You are a volunteer secretary at the Club de Marche, a walking club based in the region.
You have just answered the phone at the club's information line (0801 12 12 451).

FACTS YOU KNOW ABOUT THE CLUB:
- The club offers varied walking circuits depending on the season:
    - Spring/Summer: countryside and mountain trails
    - Autumn/Winter: gentle city walks and village heritage routes
- Walks are suitable for all fitness levels — they are described as "randonnées douces" (gentle hikes)
- Themed walks include local heritage discovery (historic sites, landmarks, local culture)
- Membership fee: 40€ per year, which covers all organised walks
- Walks take place every Saturday morning, departure at 9h00
- Meeting point: Place du Marché, in front of the tourist office
- New members can join their first walk for free before committing
- Registration is possible online at www.clubdemarche.org or directly by phone with you
- To register by phone you need: full name, age, and a contact email or phone number
- The next walk is this Saturday — there are still places available`,

    // First line spoken by the AI when the exam begins
    opening: `Club de Marche, bonjour!`,

    // The candidate's objective — used to guide Claude's behaviour and for the evaluator
    task: `The caller has read the Club de Marche advertisement and is calling for more information. They should ask about: the types of walks offered, the schedule, the membership cost, and how to join. The ideal outcome is that they get all the key information and express interest in participating (or even register for the next walk).`,

    // Key French words + typical learner phone phrases — helps Whisper when pronunciation is non-native.
    whisperHint: `Appel téléphonique au Club de Marche en français. Je voudrais des renseignements, j'ai vu votre annonce, je suis intéressé, je suis intéressée, est-ce que c'est gratuit la première fois, première randonnée, comment je m'inscris, inscription en ligne, par téléphone, quel est le tarif, la cotisation, combien par an, à quelle heure, le rendez-vous, samedi matin, neuf heures, place du marché, bureau de tourisme, patrimoine, randonnée douce, marche, marcher, circuit, adhésion, adhérer, membres, bonjour, au revoir, merci, s'il vous plaît. Zéro huit cent un, douze, douze, quatre cent cinquante-et-un, club de marche point org.`,

    closingTimeout: `Très bien! Je note votre inscription pour samedi. On sera ravis de vous accueillir pour votre première randonnée. À très bientôt et bonne journée!`,
    closingUserEnded: `Pas de problème, n'hésitez pas à rappeler ou à consulter notre site. Bonne journée!`,
  },
];

export const SECTION_B_SCENARIOS: SectionBScenario[] = [
  {
    id: 'gym-persuasion',
    imageUrl: '/assets/scenarios/section-b/gym.png',
    context: 'You are playing the role of a close friend of the user. They are trying to convince you to join a gym with them. You are NOT interested. Be friendly but skeptical. Raise natural objections (too expensive, no time, not your thing). Only let yourself be convinced if their arguments are strong and specific. Speak informal French. Keep each response to 1–3 sentences.',
    opening: 'Un abonnement de gym? Bof, je suis pas vraiment convaincu... C\'est cher ces trucs-là non?',
    resistance: 'You think it is too expensive and you are too busy with work. You also prefer outdoor activities.',
    whisperHint: `Conversation informelle entre amis en français. Tu devrais venir, ça te ferait du bien, on y va ensemble, essayer, s'inscrire, la salle, la gym, musculation, cardio, fitness, entraînement, abonnement, mensuel, c'est cher, trop cher, j'ai pas le temps, je suis occupé, je préfère dehors, la nature, la randonnée, marcher dehors, convaincre, persuader, allez, sérieux, une fois, essayer une semaine.`,
    closingTimeout: 'Ah excuse-moi, j\'ai un autre appel qui arrive. On en reparle plus tard, promis!',
    closingUserEnded: 'Ok ok, tu m\'as convaincu de réfléchir. À plus tard!',
  },

  // TODO: add a second Section B scenario
  // Example ideas: convince friend to adopt a dog, try a new restaurant, take a trip, change jobs
  // {
  //   id: '',
  //   imageUrl: '/assets/scenarios/section-b/.png',
  //   context: '',
  //   opening: '',
  //   resistance: '',
  //   closingTimeout: '',
  //   closingUserEnded: '',
  // },

  // TODO: add a third Section B scenario
];
