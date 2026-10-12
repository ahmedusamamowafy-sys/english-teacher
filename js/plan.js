// Pure functions that turn level estimates + error log into a personal learning profile.
import { SKILLS, toDetail, confidence, CEFR } from './levels.js';

const FOCUS_ACTIVITY = {
  speaking: 'Guided conversation (Talk)', pronunciation: 'Minimal pairs and shadowing (Speak)', writing: 'Writing workspace with corrections',
  grammar: 'Grammar drills from your own mistakes', vocabulary: 'Vocabulary cards and collocations', listening: 'Dictation and dialogues (Listen)', reading: 'Graded reading with summaries',
};

export function buildProfile(levels, errors = []) {
  const assessed = SKILLS.filter((k) => levels[k] && levels[k].n > 0);
  const sorted = [...assessed].sort((a, b) => levels[a].est - levels[b].est);
  const weakest = sorted.slice(0, 2);
  const strongest = sorted.slice(-2).reverse().filter((k) => !weakest.includes(k));
  const topErrors = [...errors].filter((e) => e.status !== 'improving').sort((a, b) => b.occurrences - a.occurrences).slice(0, 5);
  const overall = assessed.length ? assessed.reduce((a, k) => a + levels[k].est, 0) / assessed.length : null;
  const unassessed = SKILLS.filter((k) => !assessed.includes(k));

  const days = [
    ['Monday', 'Guided conversation + vocabulary review'],
    ['Tuesday', 'Grammar drills + listening'],
    ['Wednesday', 'Writing workspace + vocabulary review'],
    ['Thursday', 'Speaking / pronunciation + reading'],
    ['Friday', 'Quick exam + weekly review'],
  ];
  // Put extra time on the weakest skills.
  const extra = weakest.map((k) => FOCUS_ACTIVITY[k]).filter(Boolean);

  const objectives = { short: [], long: [] };
  for (const k of weakest) {
    const cur = toDetail(levels[k].est);
    objectives.short.push(`Over the next 4 weeks, raise ${k} practice to a steady rhythm (3+ sessions a week) and re-test it. Current estimate: ${cur}.`);
  }
  if (topErrors[0]) objectives.short.push(`Cut the recurrence of "${topErrors[0].category}" mistakes (e.g. "${topErrors[0].wrong}" -> "${topErrors[0].right}").`);
  if (overall) {
    const next = CEFR[Math.min(5, Math.round(overall))] || 'C2';
    objectives.long.push(`Reach a consistent ${next} across speaking, listening, reading and writing for work (meetings, emails, claims).`);
  }
  objectives.long.push('Think and respond in English without translating each sentence from Arabic.');

  return { overall, weakest, strongest, topErrors, unassessed, days, extra, objectives, confidences: Object.fromEntries(assessed.map((k) => [k, confidence(levels[k].n)])) };
}

// Rough, deliberately conservative heuristics when no AI is available. Low confidence.
export function roughWritingLevel({ words, avgSentence, errorCount }) {
  if (words < 15) return 1.5;
  let lvl = avgSentence <= 7 ? 2 : avgSentence <= 11 ? 3 : avgSentence <= 16 ? 3.5 : 4;
  if (errorCount >= 3) lvl -= 0.5;
  return Math.max(1, lvl);
}
export function roughSpeakingLevel({ wordsPerMinute, avgSentence }) {
  let lvl = wordsPerMinute < 40 ? 1.5 : wordsPerMinute < 70 ? 2.5 : wordsPerMinute < 100 ? 3 : wordsPerMinute < 130 ? 3.5 : 4;
  if (avgSentence && avgSentence < 6) lvl -= 0.5;
  return Math.max(1, lvl);
}
