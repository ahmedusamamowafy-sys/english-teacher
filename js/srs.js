// Spaced repetition (SM-2 variant). Pure functions so they are easy to test.
export const DAY = 86400000;

export function newCard(fields, now = Date.now()) {
  return {
    id: fields.id || 'c_' + now.toString(36) + Math.random().toString(36).slice(2, 7),
    type: 'vocab', // vocab | error
    front: '', back: '', examples: [], collocations: [], mySentence: '',
    arabic: '', ipa: '', tags: [],
    created: now, due: now, ease: 2.5, interval: 0, reps: 0, lapses: 0, history: [],
    ...fields,
  };
}

// grade: 0 = blackout, 1 = wrong, 2 = wrong but familiar, 3 = hard, 4 = good, 5 = easy
export function review(card, grade, now = Date.now()) {
  const c = { ...card, history: [...(card.history || []), { t: now, g: grade }].slice(-30) };
  if (grade < 3) {
    c.reps = 0;
    c.lapses = (c.lapses || 0) + 1;
    c.interval = 0;
    c.due = now + 10 * 60000; // see again this session
    c.ease = Math.max(1.3, c.ease - 0.2);
    return c;
  }
  c.reps = (c.reps || 0) + 1;
  if (c.reps === 1) c.interval = 1;
  else if (c.reps === 2) c.interval = grade === 3 ? 2 : 4;
  else c.interval = Math.max(1, Math.round(c.interval * c.ease * (grade === 3 ? 0.85 : grade === 5 ? 1.3 : 1)));
  c.ease = Math.max(1.3, c.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  c.due = now + c.interval * DAY;
  return c;
}

export const isDue = (card, now = Date.now()) => card.due <= now;
export const isNew = (card) => !(card.history && card.history.length);

// Pick today's queue: due reviews first (most overdue first), then up to `newLimit` new cards.
export function buildQueue(cards, { now = Date.now(), newLimit = 8, maxTotal = 40, newToday = 0 } = {}) {
  const due = cards.filter((c) => !isNew(c) && isDue(c, now)).sort((a, b) => a.due - b.due);
  const allowNew = Math.max(0, newLimit - newToday);
  const fresh = cards.filter(isNew).slice(0, allowNew);
  // error cards are prioritised among due items
  due.sort((a, b) => (b.type === 'error') - (a.type === 'error'));
  return [...due, ...fresh].slice(0, maxTotal);
}

// Retention = share of reviews graded >= 3 in the last `days` days.
export function retention(cards, days = 14, now = Date.now()) {
  let n = 0, ok = 0;
  for (const c of cards) for (const h of c.history || []) if (now - h.t <= days * DAY) { n++; if (h.g >= 3) ok++; }
  return n ? ok / n : null;
}

// Typed-answer auto grading: exact -> 5, one small typo -> 4, otherwise 1.
export function autoGrade(answer, target) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  const a = norm(answer), t = norm(target);
  if (!a) return 1;
  if (a === t) return 5;
  return editDistance(a, t) <= Math.max(1, Math.floor(t.length / 12)) ? 4 : 1;
}

export function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
