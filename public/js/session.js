// In-memory session tracking -> end-of-session learning report saved into the student database.
import { state, save, touchStreak, today, markCorrectUse } from './store.js';
import { updateLevel, toDetail, SKILLS } from './levels.js';
import { retention, isDue, isNew } from './srs.js';

let session = null;

function ensure() {
  if (!session) session = { id: 's_' + Date.now().toString(36), start: Date.now(), activities: [], corrections: [], newExpressions: [], skills: {}, errorsLogged: [] };
  return session;
}

export const hasActiveSession = () => !!session && session.activities.length > 0;

export function logActivity(type, detail = '', skills = []) {
  const s = ensure();
  s.activities.push({ t: Date.now(), type, detail });
  for (const k of skills) s.skills[k] = (s.skills[k] || 0) + 1;
  touchStreak();
  save();
}
export function logCorrection(c) { ensure().corrections.push(c); }
export function logNewExpression(e) { const s = ensure(); if (!s.newExpressions.includes(e)) s.newExpressions.push(e); }
export function logErrorId(id) { const s = ensure(); if (!s.errorsLogged.includes(id)) s.errorsLogged.push(id); }

// Update the level estimate for a skill and persist.
export function awardSkill(skill, obs, weight = 1) {
  state.profile.levels = updateLevel(state.profile.levels, skill, obs, weight);
  save();
}

export function recommendNext() {
  const now = Date.now();
  const dueCount = state.cards.filter((c) => !isNew(c) && isDue(c, now)).length;
  const L = state.profile.levels;
  const assessed = SKILLS.filter((k) => L[k].n > 0);
  const weakest = [...assessed].sort((a, b) => L[a].est - L[b].est)[0];
  const activeErrors = state.errors.filter((e) => e.status === 'active').sort((a, b) => b.occurrences - a.occurrences);
  const out = [];
  if (!state.profile.placementDone) out.push('Take the placement assessment so the teacher can personalise your plan.');
  if (dueCount) out.push(`Review your ${dueCount} due card${dueCount > 1 ? 's' : ''} first (5 minutes).`);
  if (activeErrors[0]) out.push(`Practise your most frequent mistake type: ${activeErrors[0].category} (e.g. "${activeErrors[0].wrong}" -> "${activeErrors[0].right}").`);
  if (weakest) out.push(`Give extra time to ${weakest} (currently about ${toDetail(L[weakest].est)}).`);
  if (!out.length) out.push('Do a 10-minute guided conversation and a quick exam.');
  return out;
}

export function finishSession() {
  if (!session || !session.activities.length) { session = null; return null; }
  const s = session; session = null;
  const report = {
    id: s.id, date: s.start, minutes: Math.max(1, Math.round((Date.now() - s.start) / 60000)),
    activities: s.activities.map((a) => `${a.type}${a.detail ? ': ' + a.detail : ''}`),
    skills: Object.keys(s.skills),
    corrections: s.corrections.slice(0, 12),
    newExpressions: s.newExpressions,
    mistakesToReview: s.errorsLogged.map((id) => state.errors.find((e) => e.id === id)).filter(Boolean).map((e) => ({ category: e.category, wrong: e.wrong, right: e.right })),
    retention14d: retention(state.cards),
    next: recommendNext(),
  };
  state.sessions.push(report);
  save();
  return report;
}

export function weeklyReview() {
  const weekAgo = Date.now() - 7 * 86400000;
  const sess = state.sessions.filter((s) => s.date >= weekAgo);
  const minutes = sess.reduce((a, s) => a + s.minutes, 0);
  const days = new Set(sess.map((s) => new Date(s.date).toISOString().slice(0, 10))).size;
  const errNew = state.errors.filter((e) => e.firstSeen >= weekAgo).length;
  const improving = state.errors.filter((e) => e.status === 'improving').length;
  const exams = state.exams.filter((e) => e.date >= weekAgo);
  return { sessions: sess.length, minutes, days, errNew, improving, exams: exams.length, retention: retention(state.cards, 7), today: today() };
}

// If the learner now uses a previously-corrected form (and not the old wrong form), credit it.
// Conservative: needs a reasonably specific fragment (>= 5 chars) to avoid false credits.
export function creditCorrectUses(text) {
  const low = ' ' + String(text).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  let changed = false;
  for (const e of state.errors) {
    const right = String(e.right || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const wrong = String(e.wrong || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (right.length < 5 || e.status === 'improving') continue;
    if (low.includes(' ' + right + ' ') && !(wrong && low.includes(' ' + wrong + ' '))) { markCorrectUse(e.id); changed = true; }
  }
  if (changed) save();
}
