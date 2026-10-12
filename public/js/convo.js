// Shared conversation bookkeeping for text chat and hands-free voice mode.
import { state, save, logError } from './store.js';
import { config, sessionSummary } from './ai.js';
import { logActivity, awardSkill, logCorrection, logErrorId, logNewExpression, creditCorrectUses } from './session.js';

// Apply one teacher turn result to the student database. Returns the logged error records.
export function applyTurn(res, said, { voice = false } = {}) {
  if (said) creditCorrectUses(said);
  const logged = [];
  if (res.confidence !== 'low') {
    for (const e of res.errors || []) {
      const rec = logError(e); logged.push(rec); logErrorId(rec.id);
      logCorrection({ wrong: e.wrong, right: e.right, why: e.why, category: e.category });
    }
  }
  const lvl = Number(res.levelEstimate);
  if (lvl >= 1 && lvl <= 6) awardSkill('speaking', lvl, voice ? 0.4 : 0.3);
  if (Array.isArray(res.pronunciation) && res.pronunciation.length) {
    state.pron.push({ id: 'p_' + Date.now().toString(36), kind: 'ai-audio', date: Date.now(), said, issues: res.pronunciation.map((p) => ({ word: p.word, sound: p.sound || 'other', say: p.say || '', tip: p.tip || '', heardAs: p.heardAs || '' })) });
    if (state.pron.length > 400) state.pron = state.pron.slice(-400);
  }
  if (res.note && typeof res.note === 'string' && res.note.length < 160) {
    const notes = state.profile.teacherNotes || (state.profile.teacherNotes = []);
    if (!notes.some((n) => n.toLowerCase() === res.note.toLowerCase())) { notes.push(res.note); state.profile.teacherNotes = notes.slice(-30); }
  }
  save();
  return logged;
}

// Most frequent pronunciation issues from AI audio feedback: [{sound, n, examples:[word]}]
export function soundStats() {
  const by = {};
  for (const p of state.pron || []) for (const i of p.issues || []) {
    const k = i.sound || 'other';
    by[k] = by[k] || { sound: k, n: 0, examples: [] };
    by[k].n++;
    if (i.word && !by[k].examples.includes(i.word) && by[k].examples.length < 5) by[k].examples.push(i.word);
  }
  return Object.values(by).sort((a, b) => b.n - a.n);
}

export const SOUND_NAMES = { 'p-b': 'P and B', 'v-f': 'V and F', th: 'TH sounds', 'i-ee': 'Short I / long EE', vowel: 'Vowel sounds', cluster: 'Consonant clusters', 'word-stress': 'Word stress', 'sentence-stress': 'Sentence stress', intonation: 'Intonation', r: 'R sound', other: 'Other sounds' };

export async function finishConversation({ topic, mode, turns, extra = {} }) {
  const mine = turns.filter((t) => t.role === 'me');
  if (!mine.length) return null;
  let summary = null;
  if (config.aiReady && mine.length >= 2) {
    try {
      summary = await sessionSummary(turns);
      const notes = (summary.notes || []).filter((n) => typeof n === 'string' && n.length < 160).slice(0, 3);
      const all = state.profile.teacherNotes || [];
      for (const n of notes) if (!all.some((x) => x.toLowerCase() === n.toLowerCase())) all.push(n);
      state.profile.teacherNotes = all.slice(-30);
    } catch {}
  }
  const words = mine.reduce((a, t) => a + (t.text.match(/[A-Za-z']+/g) || []).length, 0);
  state.convos.push({ id: 'cv_' + Date.now().toString(36), scenario: topic.title, topicId: topic.id, mode, date: Date.now(), turns: turns.slice(-60), summary: summary && summary.summary, ...extra });
  if (state.convos.length > 80) state.convos = state.convos.slice(-80);
  if (topic.id) state.topicsDone[topic.id] = (state.topicsDone[topic.id] || 0) + 1;
  save();
  logActivity(extra.voice ? 'Hands-free conversation' : 'Conversation', topic.title, extra.voice ? ['speaking', 'listening', 'pronunciation'] : ['speaking']);
  return { summary, turnsCount: mine.length, avgWords: Math.round(words / mine.length), longest: Math.max(...mine.map((t) => (t.text.match(/[A-Za-z']+/g) || []).length)) };
}

export { logNewExpression };
