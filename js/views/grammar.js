import { h, clear, card, btn, note, badge, toast, sourceTag } from '../ui.js';
import { state, save } from '../store.js';
import { GRAMMAR } from '../content/grammar.js';
import { logActivity, awardSkill } from '../session.js';
import { answerMatches } from '../compare.js';

const isCorrect = answerMatches;

export function render(root) {
  root.append(h('h1', {}, 'Grammar'), h('p', { class: 'muted' }, 'Short lessons for the patterns that matter most for Arabic speakers at work. Lessons linked to your own mistakes are marked.'));
  const area = h('div', {});
  root.append(area);
  list();

  function list() {
    clear(area);
    const activeCats = new Set(state.errors.filter((e) => e.status === 'active').map((e) => e.category));
    const grid = h('div', { class: 'grid' });
    const sorted = [...GRAMMAR].sort((a, b) => (b.cats.some((c) => activeCats.has(c)) ? 1 : 0) - (a.cats.some((c) => activeCats.has(c)) ? 1 : 0));
    for (const g of sorted) {
      const rel = g.cats.some((c) => activeCats.has(c));
      grid.append(card(h('h3', { style: { marginTop: 0 } }, g.title), h('div', { class: 'row' }, badge('from ' + ['A1', 'A2', 'B1', 'B2', 'C1'][g.level - 1]), rel ? badge('matches your mistakes', 'warn') : null), btn('Open', () => open(g), 'primary small')));
    }
    area.append(grid);
  }

  function open(g) {
    clear(area); window.scrollTo(0, 0);
    const showAr = state.profile.settings.arabicSupport !== 'off';
    const inputs = g.drills.map(() => h('input', { type: 'text', autocomplete: 'off', 'aria-label': 'Answer' }));
    const out = h('div', {});
    area.append(card(h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, g.title), btn('Back', list, 'small')), h('p', {}, g.rule), showAr && g.ar ? h('p', { class: 'ar', dir: 'rtl' }, g.ar) : null, h('ul', {}, g.ex.map((e) => h('li', {}, e)))),
      card(h('h3', { style: { marginTop: 0 } }, 'Practice'), g.drills.map((d, i) => h('div', { style: { margin: '10px 0' } }, h('div', {}, `${i + 1}. ${d.q}`), inputs[i])),
        h('div', { class: 'row' }, btn('Check answers', () => {
          clear(out); let ok = 0;
          g.drills.forEach((d, i) => { const c = isCorrect(inputs[i].value, d.a); if (c) ok++; out.append(h('div', {}, c ? h('span', { class: 'good' }, '✔ ') : h('span', { class: 'bad' }, '✘ '), c ? inputs[i].value : `Your answer: "${inputs[i].value || '(empty)'}"  ·  Accepted: ${d.a[0]}`)); });
          out.prepend(h('p', {}, h('strong', {}, `${ok}/${g.drills.length}`), ' ', sourceTag('auto')));
          awardSkill('grammar', g.level + (ok / g.drills.length >= 0.8 ? 0.25 : ok / g.drills.length >= 0.5 ? -0.25 : -0.75), 0.4);
          // Drilled categories: a perfect score counts as a correct use for matching errors.
          if (ok === g.drills.length) for (const e of state.errors) if (g.cats.includes(e.category) && e.status === 'active') { e.correctUses = (e.correctUses || 0) + 1; if (e.correctUses >= 3) e.status = 'improving'; }
          save(); logActivity('Grammar drill', g.title + ` (${ok}/${g.drills.length})`, ['grammar']);
        }, 'primary')), out));
  }
}
