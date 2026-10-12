import { h, clear, card, btn, note, badge, mcqRunner, shuffle, toast, fmtDate, sourceTag } from '../ui.js';
import { state, save } from '../store.js';
import { BANK, CATEGORIES } from '../content/exams.js';
import { estimateFromItems, toDetail } from '../levels.js';
import { newCard } from '../srs.js';
import { logActivity, awardSkill } from '../session.js';

const SKILL_OF = { tenses: 'grammar', prepositions: 'grammar', articles: 'grammar', modals: 'grammar', passive: 'grammar', construction: 'vocabulary', pm: 'vocabulary', collocations: 'vocabulary', functional: 'vocabulary', email: 'vocabulary' };

// Choose items near the learner's current level (grammar+vocab average) so the exam is informative, not demoralising.
export function pickExamItems({ cat = 'all', n = 10, around = null, rnd = Math.random } = {}) {
  let pool = BANK.filter((b) => cat === 'all' || b.cat === cat);
  if (around != null) {
    const near = pool.filter((b) => Math.abs(b.level - around) <= 1);
    if (near.length >= n) pool = near;
  }
  return shuffle(pool, rnd).slice(0, Math.min(n, pool.length));
}

export function render(root) {
  root.append(h('h1', {}, 'Quick exams'), h('p', { class: 'muted' }, 'Fast, auto-scored checks. Use them for warm-ups, speed practice, and to track progress between full assessments.'));
  const area = h('div', {});
  root.append(area);
  setup();

  function setup() {
    clear(area);
    const L = state.profile.levels;
    const known = [L.grammar, L.vocabulary].filter((x) => x.n > 0);
    const around = known.length ? known.reduce((a, x) => a + x.est, 0) / known.length : null;
    const cat = h('select', { 'aria-label': 'Topic' }, [h('option', { value: 'all' }, 'Mixed (all topics)'), ...Object.entries(CATEGORIES).map(([k, v]) => h('option', { value: k }, v))]);
    const n = h('select', { 'aria-label': 'Questions' }, [5, 10, 20].map((x) => h('option', { value: x, selected: x === 10 }, x + ' questions')));
    const t = h('select', { 'aria-label': 'Time per question' }, [[0, 'No timer'], [30, '30 s per question'], [20, '20 s per question (fast)'], [10, '10 s per question (speed round)']].map(([v, l]) => h('option', { value: v }, l)));
    const adaptive = h('input', { type: 'checkbox', checked: around != null, id: 'adaptive', style: { width: 'auto' } });
    area.append(card(h('label', {}, 'Topic'), cat, h('label', {}, 'Length'), n, h('label', {}, 'Timer'), t, h('label', { style: { fontWeight: 400 } }, adaptive, ' Choose questions near my level', around == null ? ' (no level data yet; take the placement assessment first)' : ''),
      h('div', { class: 'row', style: { marginTop: '12px' } }, btn('Start exam', () => run({ cat: cat.value, n: Number(n.value), timer: Number(t.value), around: adaptive.checked ? around : null }), 'primary'))));
    history();
  }

  function history() {
    const ex = state.exams.filter((e) => e.kind === 'quick').slice(-8).reverse();
    if (!ex.length) return;
    area.append(card(h('h3', { style: { marginTop: 0 } }, 'Recent exams'), h('table', {}, h('thead', {}, h('tr', {}, ['Date', 'Topic', 'Score', 'Estimate'].map((x) => h('th', {}, x)))), h('tbody', {}, ex.map((e) => h('tr', {}, h('td', {}, fmtDate(e.date)), h('td', {}, e.cat === 'all' ? 'Mixed' : CATEGORIES[e.cat]), h('td', {}, `${e.score}/${e.total}`), h('td', {}, e.est ? toDetail(e.est) : '–')))))));
  }

  function run(opts) {
    const items = pickExamItems(opts);
    if (!items.length) { toast('No questions available.'); return; }
    clear(area);
    area.append(card(mcqRunner({ items, timerSec: opts.timer, label: opts.cat === 'all' ? 'Mixed' : CATEGORIES[opts.cat], onDone: (res) => finish(opts, res) })));
  }

  function finish(opts, res) {
    clear(area);
    const score = res.filter((r) => r.correct).length;
    const est = estimateFromItems(res.map((r) => ({ level: r.item.level, correct: r.correct })));
    state.exams.push({ id: 'x_' + Date.now().toString(36), kind: 'quick', date: Date.now(), cat: opts.cat, score, total: res.length, est });
    // update skills with a small weight per question
    const by = {};
    for (const r of res) { const sk = SKILL_OF[r.item.cat] || 'grammar'; (by[sk] = by[sk] || []).push({ level: r.item.level, correct: r.correct }); }
    for (const [sk, items] of Object.entries(by)) if (items.length >= 3) awardSkill(sk, estimateFromItems(items), Math.min(2, items.length * 0.15));
    save();
    logActivity('Quick exam', `${score}/${res.length}`, Object.keys(by));
    const wrong = res.filter((r) => !r.correct);
    const perCat = {};
    for (const r of res) { const k = CATEGORIES[r.item.cat]; perCat[k] = perCat[k] || [0, 0]; perCat[k][1]++; if (r.correct) perCat[k][0]++; }
    area.append(card(h('h2', {}, `Score: ${score}/${res.length}`), h('p', {}, sourceTag('auto'), ' ', est ? `Items suggest about ${toDetail(est)} on this set (small sample: treat as a rough signal).` : ''),
      h('h3', {}, 'By topic'), h('table', {}, h('tbody', {}, Object.entries(perCat).map(([k, [a, b]]) => h('tr', {}, h('td', {}, k), h('td', {}, `${a}/${b}`))))),
      wrong.length ? h('div', {}, h('h3', {}, 'To review'), h('ul', {}, wrong.map((r) => h('li', {}, `${r.item.q} → `, h('strong', {}, r.item.options[r.item.answer]), r.item.explain ? ' (' + r.item.explain + ')' : ''))),
        btn('Add wrong answers to my review cards', () => {
          let n = 0;
          for (const r of wrong) { const id = 'q:' + r.item.q; if (state.cards.some((c) => c.id === id)) continue; state.cards.push(newCard({ id, type: 'error', front: 'Complete: ' + r.item.q, back: r.item.options[r.item.answer], examples: [r.item.explain || ''], tags: [CATEGORIES[r.item.cat]] })); n++; }
          save(); toast(n + ' card(s) added.');
        })) : h('p', { class: 'good' }, 'Perfect score.'),
      h('div', { class: 'row', style: { marginTop: '12px' } }, btn('Another exam', setup, 'primary'))));
  }
}
