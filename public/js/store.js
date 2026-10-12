// Persistent student database, one per learner profile.
// Stored in this browser (localStorage) and, when the local Node server is running, also in data/state*.json.
// On the free hosted version (static site) the browser copy is the only copy: use Settings > Download backup.
import { emptyLevels } from './levels.js';

const LS_BASE = 'englishTeacher.state.v1';
const LS_PROFILES = 'englishTeacher.profiles';
export let state = null;
const listeners = new Set();
let saveTimer = null;
let remoteEnabled = false;
export const DEFAULT_ABOUT = 'Egyptian Arabic speaker working as a planning engineer / project manager on construction projects in Saudi Arabia (schedules, BOQ, EVM, contracts, claims, consultants).';

export function setRemote(on) { remoteEnabled = !!on; }

// ---- profiles ----
export function getProfiles() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_PROFILES) || 'null');
    if (p && Array.isArray(p.list) && p.list.length) return p;
  } catch {}
  return { list: [{ id: 'default', name: 'Ahmed' }], current: 'default' };
}
function setProfiles(p) { try { localStorage.setItem(LS_PROFILES, JSON.stringify(p)); } catch {} }
export const currentProfileId = () => getProfiles().current;
const lsKey = (id) => (id === 'default' ? LS_BASE : LS_BASE + '.' + id);
const remoteUrl = (id) => 'api/state' + (id === 'default' ? '' : '?profile=' + encodeURIComponent(id));

export function addProfile(name, about = '') {
  const p = getProfiles();
  const id = 'p' + Date.now().toString(36);
  p.list.push({ id, name: name || 'Learner' });
  setProfiles(p);
  const st = defaultState(); st.profile.name = name || 'Learner'; st.profile.about = about || ''; st.profile.goals = [];
  try { localStorage.setItem(lsKey(id), JSON.stringify(st)); } catch {}
  return id;
}
export function switchProfile(id) {
  const p = getProfiles();
  if (!p.list.some((x) => x.id === id)) return;
  p.current = id; setProfiles(p);
}
export function renameProfileEntry(id, name) {
  const p = getProfiles(); const e = p.list.find((x) => x.id === id); if (e) { e.name = name; setProfiles(p); }
}
export function removeProfile(id) {
  const p = getProfiles();
  if (p.list.length <= 1) return false;
  p.list = p.list.filter((x) => x.id !== id);
  if (p.current === id) p.current = p.list[0].id;
  setProfiles(p);
  try { localStorage.removeItem(lsKey(id)); } catch {}
  return true;
}

export function defaultState() {
  return {
    version: 1,
    createdAt: Date.now(),
    updatedAt: 0,
    profile: {
      name: 'Ahmed',
      about: DEFAULT_ABOUT,
      levels: emptyLevels(),
      placementDone: false,
      placementDate: null,
      goals: ['Speak confidently in site and client meetings', 'Write clear professional emails and delay notices'],
      settings: { correctionMode: 'balanced', arabicSupport: 'auto', ttsRate: 1, voiceName: '', dailyMinutes: 30, newCardsPerDay: 8, accent: 'en-US',
        accentCoach: 'gentle', voiceCorrection: 'balanced', pauseLength: 'normal', replyLength: 'short' },
      teacherNotes: [], // short durable facts the teacher remembers (topics, interests, preferences)
    },
    cards: [],
    errors: [],      // {id, category, wrong, right, why, firstSeen, lastSeen, occurrences, correctUses, status}
    sessions: [],    // finished session reports
    exams: [],       // {id, kind, date, score, total, items:[...] }
    writings: [],    // {id, date, context, original, result}
    pron: [],        // pronunciation results
    convos: [],      // {id, scenario, date, turns:[{role,text}], summary}
    topicsDone: {},  // topicId -> times practised
    seeded: false,
    streak: { last: null, count: 0 },
  };
}

function migrate(s) {
  const d = defaultState();
  const out = { ...d, ...s, profile: { ...d.profile, ...(s.profile || {}) } };
  out.profile.settings = { ...d.profile.settings, ...((s.profile || {}).settings || {}) };
  out.profile.levels = { ...d.profile.levels, ...((s.profile || {}).levels || {}) };
  if (out.profile.about == null) out.profile.about = DEFAULT_ABOUT;
  out.topicsDone = out.topicsDone || {};
  return out;
}

export async function load() {
  const id = currentProfileId();
  let remote = null, local = null;
  if (remoteEnabled) {
    try {
      const r = await fetch(remoteUrl(id));
      if (r.ok) remote = (await r.json()).state;
    } catch {}
  }
  try { local = JSON.parse(localStorage.getItem(lsKey(id)) || 'null'); } catch {}
  // newest wins
  const pick = [remote, local].filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  state = pick ? migrate(pick) : defaultState();
  const entry = getProfiles().list.find((x) => x.id === id);
  if (entry && !pick) state.profile.name = entry.name;
  return state;
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function save() {
  state.updatedAt = Date.now();
  try { localStorage.setItem(lsKey(currentProfileId()), JSON.stringify(state)); } catch {}
  clearTimeout(saveTimer);
  if (remoteEnabled) saveTimer = setTimeout(pushRemote, 600);
  listeners.forEach((f) => f(state));
}

export async function pushRemote() {
  if (!remoteEnabled) return false;
  try {
    const r = await fetch(remoteUrl(currentProfileId()), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state }) });
    return r.ok;
  } catch { return false; }
}
export const isRemote = () => remoteEnabled;

export function exportJSON() { return JSON.stringify(state, null, 2); }
export function importJSON(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object' || !obj.profile) throw new Error('Not a valid backup file');
  state = migrate(obj);
  save();
}
export function resetAll() { state = defaultState(); save(); }

// ---- derived helpers ----
export const today = () => new Date().toISOString().slice(0, 10);
export function touchStreak() {
  const t = today();
  const s = state.streak;
  if (s.last === t) return;
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  s.count = s.last === y ? s.count + 1 : 1;
  s.last = t;
}

// ---- error database ----
export function logError({ category, wrong, right, why }) {
  const key = (category + '|' + right).toLowerCase();
  let e = state.errors.find((x) => x.key === key);
  const now = Date.now();
  if (e) { e.occurrences++; e.lastSeen = now; e.wrong = wrong; if (e.status === 'improving') e.status = 'active'; e.correctUses = 0; }
  else {
    e = { id: 'e_' + now.toString(36) + Math.random().toString(36).slice(2, 6), key, category, wrong, right, why, firstSeen: now, lastSeen: now, occurrences: 1, correctUses: 0, status: 'active' };
    state.errors.push(e);
  }
  return e;
}
// Called when the learner later produces the correct form.
export function markCorrectUse(errorId) {
  const e = state.errors.find((x) => x.id === errorId);
  if (!e) return;
  e.correctUses++;
  if (e.correctUses >= 3) e.status = 'improving';
}
export function errorStats() {
  const by = {};
  for (const e of state.errors) { by[e.category] = by[e.category] || { n: 0, occ: 0 }; by[e.category].n++; by[e.category].occ += e.occurrences; }
  return Object.entries(by).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.occ - a.occ);
}
