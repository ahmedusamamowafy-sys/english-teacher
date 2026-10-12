import { h, clear, card, btn, note, badge, toast, pct, fmtDate } from '../ui.js';
import { state, save } from '../store.js';
import { newCard, review, buildQueue, retention, autoGrade, isDue, isNew } from '../srs.js';
import { speak } from '../speech.js';
import { logActivity, logNewExpression } from '../session.js';

const norm = (s) => String(s).replace(/^to /i, '').replace(/[.?…]+$/g, '').trim();
const newToday = () => state.cards.filter((c) => c.history && c.history[0] && new Date(c.history[0].t).toDateString() === new Date().toDateString()).length;

export function errorCardsFromMistakes() {
  let n = 0;
  for (const e of state.errors) {
    if (e.status === 'improving') continue;
    const id = 'e:' + e.key;
    if (state.cards.some((c) => c.id === id)) continue;
    state.cards.push(newCard({ id, type: 'error', front: 'Correct this: ' + e.wrong, back: e.right, examples: [e.why], tags: [e.category], errorId: e.id })); n++;
  }
  if (n) save();
  return n;
}

export function render(root) {
  root.append(h('h1', {}, 'Vocabulary and review'), h('p', { class: 'muted' }, 'Spaced repetition with active recall. Expressions and collocations come first, single words second.'));
  const area = h('div', {});
  root.append(area);
  home();

  function home() {
    clear(area);
    const now = Date.now();
    const due = state.cards.filter((c) => !isNew(c) && isDue(c, now)).length;
    const fresh = Math.max(0, state.profile.settings.newCardsPerDay - newToday());
    const queue = buildQueue(state.cards, { newLimit: state.profile.settings.newCardsPerDay, newToday: newToday() });
    area.append(card(h('div', { class: 'grid' }, stat('Due', due), stat('New available today', Math.min(fresh, state.cards.filter(isNew).length)), stat('Total cards', state.cards.length), stat('Retention (14 days)', pct(retention(state.cards)))),
      h('div', { class: 'row', style: { marginTop: '12px' } }, btn(queue.length ? `Start review (${queue.length})` : 'Nothing to review', () => session(queue), 'primary', { disabled: !queue.length }),
        btn('Turn my mistakes into cards', () => { const n = errorCardsFromMistakes(); toast(n ? `${n} mistake card${n > 1 ? 's' : ''} added.` : 'No new mistakes to add.'); home(); }),
        btn('Browse / add cards', browse))));
  }

  function session(queue) {
    let i = 0, done = 0, good = 0;
    const q = [...queue];
    const step = () => {
      clear(area);
      if (!q.length) { logActivity('Vocabulary review', `${done} cards`, ['vocabulary']); area.append(card(h('h2', {}, 'Review finished'), h('p', {}, `${done} reviews, ${done ? Math.round((good / done) * 100) : 0}% remembered.`), h('p', { class: 'muted small' }, 'Cards you missed will come back again soon; the others return after growing intervals.'), btn('Back', home, 'primary'))); return; }
      const c = q.shift();
      const typed = h('input', { type: 'text', placeholder: 'Type the expression (optional)', 'aria-label': 'Your answer', autocomplete: 'off' });
      const mine = h('input', { type: 'text', placeholder: 'Write your own sentence with it (optional, helps memory)', 'aria-label': 'Your own sentence', autocomplete: 'off' });
      const back = h('div', { hidden: true });
      const isErr = c.type === 'error';
      const target = isErr ? c.back : c.front;
      const prompt = isErr ? h('p', { class: 'cloze' }, c.front) : h('div', {}, h('p', { class: 'cloze' }, c.cloze || c.back), c.cloze ? h('p', { class: 'muted' }, 'Meaning: ' + c.back) : null);
      const show = btn('Show answer', () => {
        show.hidden = true; typed.disabled = true; back.hidden = false;
        const g = typed.value ? autoGrade(typed.value, norm(target)) : null;
        clear(back);
        back.append(h('p', {}, h('strong', {}, isErr ? c.back : c.front), ' ', btn('🔊', () => speak(isErr ? c.back : c.front), 'small')),
          g != null ? h('p', {}, g >= 4 ? h('span', { class: 'good' }, '✔ Your answer matches.') : h('span', { class: 'bad' }, 'Your answer: ' + typed.value)) : null,
          c.arabic && state.profile.settings.arabicSupport !== 'off' ? h('p', { class: 'ar', dir: 'rtl' }, c.arabic) : null,
          !isErr ? h('p', {}, c.back) : (c.examples[0] ? h('p', { class: 'muted' }, c.examples[0]) : null),
          c.collocations && c.collocations.length ? h('p', { class: 'small' }, h('strong', {}, 'Collocations: '), c.collocations.join(' · ')) : null,
          !isErr && c.examples && c.examples.length ? h('p', { class: 'small muted' }, 'Example: ' + c.examples[0]) : null,
          c.mySentence ? h('p', { class: 'small' }, 'Your sentence: ' + c.mySentence) : null,
          h('div', { class: 'row' }, [['Again', 1, 'danger'], ['Hard', 3, ''], ['Good', 4, 'primary'], ['Easy', 5, '']].map(([l, gr, k]) => btn(l, () => rate(c, gr), k))));
      }, 'primary');
      area.append(card(h('div', { class: 'row between' }, badge(isErr ? 'my mistake' : (c.tags && c.tags[0]) || 'vocab'), h('span', { class: 'muted small' }, `${q.length + 1} left`)), prompt, typed, mine, h('div', { class: 'row', style: { marginTop: '8px' } }, show), back));
      typed.focus();
      function rate(card_, gr) {
        const idx = state.cards.findIndex((x) => x.id === card_.id);
        const updated = review(state.cards[idx], gr);
        if (mine.value.trim()) updated.mySentence = mine.value.trim();
        state.cards[idx] = updated;
        if (isErr && gr >= 4 && card_.errorId) { const e = state.errors.find((x) => x.id === card_.errorId); if (e) { e.correctUses++; if (e.correctUses >= 3) e.status = 'improving'; } }
        if (!isErr && isNewCard(card_)) logNewExpression(card_.front);
        done++; if (gr >= 3) good++;
        if (gr < 3) q.push(updated); // see again this session
        save(); step();
      }
    };
    step();
  }
  const isNewCard = (c) => !(c.history && c.history.length);

  function browse() {
    clear(area);
    const f = h('input', { placeholder: 'Search cards…', 'aria-label': 'Search' });
    const list = h('div', {});
    const draw = () => {
      clear(list);
      const t = f.value.toLowerCase();
      const rows = state.cards.filter((c) => !t || (c.front + ' ' + c.back).toLowerCase().includes(t)).slice(0, 80);
      list.append(h('table', {}, h('thead', {}, h('tr', {}, ['Expression', 'Meaning', 'Next review'].map((x) => h('th', {}, x)))), h('tbody', {}, rows.map((c) => h('tr', {}, h('td', {}, c.front), h('td', { class: 'small' }, c.back.slice(0, 70)), h('td', { class: 'small' }, isNewCard(c) ? 'new' : fmtDate(c.due)))))));
    };
    f.addEventListener('input', draw); draw();
    const e1 = h('input', { placeholder: 'Expression or collocation', 'aria-label': 'Expression' }), e2 = h('input', { placeholder: 'Meaning (English)', 'aria-label': 'Meaning' }), e3 = h('input', { placeholder: 'Example sentence (use the expression in it)', 'aria-label': 'Example' });
    area.append(card(h('h3', { style: { marginTop: 0 } }, 'Add your own card'), e1, e2, e3, btn('Add card', () => {
      if (!e1.value.trim() || !e2.value.trim()) { toast('Expression and meaning are required.'); return; }
      const ex = e3.value.trim(), expr = e1.value.trim();
      const idx = ex.toLowerCase().indexOf(expr.toLowerCase());
      state.cards.push(newCard({ type: 'vocab', front: expr, back: e2.value.trim(), examples: ex ? [ex] : [], cloze: idx >= 0 ? ex.slice(0, idx) + '___' + ex.slice(idx + expr.length) : '', tags: ['mine'] }));
      save(); toast('Card added.'); e1.value = e2.value = e3.value = ''; draw();
    }, 'primary'), ' ', btn('Back', home)), card(f, list));
  }
}

const stat = (label, value) => h('div', {}, h('div', { style: { fontSize: '1.6rem', fontWeight: 700 } }, String(value)), h('div', { class: 'muted small' }, label));
