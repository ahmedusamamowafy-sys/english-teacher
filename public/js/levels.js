// CEFR helpers. Levels are stored as numbers: A1=1 ... C2=6 (fractions allowed).
export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const SKILLS = ['speaking', 'listening', 'reading', 'writing', 'grammar', 'vocabulary', 'pronunciation'];

export const toLabel = (x) => CEFR[Math.min(5, Math.max(0, Math.round(x) - 1))];
export const toDetail = (x) => {
  const base = Math.min(6, Math.max(1, x));
  const lvl = CEFR[Math.min(5, Math.floor(base) - 1)];
  const frac = base - Math.floor(base);
  return lvl + (frac < 0.34 ? '-' : frac > 0.66 ? '+' : '');
};

export function emptyLevels() {
  const o = {};
  for (const s of SKILLS) o[s] = { est: 2, n: 0 }; // weak prior at A2 with zero evidence
  return o;
}

// Evidence-weighted running average. `obs` is a CEFR number, `w` the evidence weight.
// Early on the new observation dominates; later estimates move slowly (cap on prior weight).
export function updateLevel(levels, skill, obs, w = 1) {
  const cur = levels[skill] || { est: 2, n: 0 };
  const prior = Math.min(cur.n, 12);
  const est = cur.n === 0 ? obs : (cur.est * prior + obs * w) / (prior + w);
  return { ...levels, [skill]: { est: Math.min(6, Math.max(1, est)), n: cur.n + w } };
}

export const confidence = (n) => (n >= 12 ? 'high' : n >= 5 ? 'medium' : n > 0 ? 'low' : 'none');

// Map a proportion correct on items of a given CEFR difficulty to a level estimate.
// Items grouped by level: [{level:1..6, correct:bool}]
export function estimateFromItems(items) {
  if (!items.length) return null;
  let best = null;
  // choose the level L maximising likelihood under a simple logistic model
  for (let L = 1; L <= 6; L += 0.25) {
    let ll = 0;
    for (const it of items) {
      const p = 1 / (1 + Math.exp(-1.6 * (L - it.level)));
      const pc = Math.min(0.98, Math.max(0.02, p * 0.9 + 0.025)); // guessing/slip floor
      ll += Math.log(it.correct ? pc : 1 - pc);
    }
    if (!best || ll > best.ll) best = { L, ll };
  }
  return best.L;
}
