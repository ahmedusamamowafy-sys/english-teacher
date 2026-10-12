// Word-level comparison used by dictation and "repeat the corrected sentence".
export const tokens = (s) => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

// LCS alignment. Returns ops: [{w, type:'same'|'missing'|'extra'}] where "missing" words are in target but not in answer.
export function diffWords(answer, target) {
  const a = tokens(answer), t = tokens(target);
  const m = a.length, n = t.length;
  const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i] === t[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === t[j]) { ops.push({ w: t[j], type: 'same' }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { ops.push({ w: a[i], type: 'extra' }); i++; }
    else { ops.push({ w: t[j], type: 'missing' }); j++; }
  }
  while (i < m) ops.push({ w: a[i++], type: 'extra' });
  while (j < n) ops.push({ w: t[j++], type: 'missing' });
  return ops;
}

export function matchScore(answer, target) {
  const t = tokens(target);
  if (!t.length) return 0;
  const same = diffWords(answer, target).filter((o) => o.type === 'same').length;
  return same / t.length;
}

// Typed-answer matching for grammar drills (case, spacing, trailing punctuation and curly quotes ignored).
const normAns = (s) => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/[.?!]+$/, '').trim();
export const answerMatches = (answer, accepted) => accepted.some((a) => normAns(a) === normAns(answer));
