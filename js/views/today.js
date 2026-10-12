import { h, card, btn, note, badge, clear } from '../ui.js';
import { state, save } from '../store.js';
import { isDue, isNew } from '../srs.js';
import { finishSession, recommendNext, hasActiveSession } from '../session.js';
import { SKILLS } from '../levels.js';

// Builds a flexible plan for the available time. Steps adapt to due cards and the weakest skill.
export function buildPlan(minutes, st = state) {
  const L = st.profile.levels;
  const due = st.cards.filter((c) => !isNew(c) && isDue(c)).length;
  const assessed = SKILLS.filter((k) => L[k].n > 0).sort((a, b) => L[a].est - L[b].est);
  const weakest = assessed[0] || 'grammar';
  const focus = { speaking: ['#/talk', 'Guided conversation'], pronunciation: ['#/pron', 'Pronunciation practice'], writing: ['#/write', 'Writing workspace'], grammar: ['#/grammar', 'Grammar drills'], vocabulary: ['#/vocab', 'Vocabulary practice'], listening: ['#/listen', 'Listening practice'], reading: ['#/read', 'Reading practice'] }[weakest] || ['#/grammar', 'Grammar drills'];
  const review = { id: 'review', title: due ? `Review ${Math.min(due, 20)} due cards` : 'Review (nothing due: learn 5 new cards)', min: minutes <= 10 ? 3 : 5, href: '#/vocab' };
  const talk = { id: 'talk', title: 'Guided conversation', min: minutes <= 10 ? 5 : 10, href: '#/talk' };
  const media = { id: 'media', title: 'Listening or reading', min: 10, href: weakest === 'reading' ? '#/read' : '#/listen' };
  const focused = { id: 'focus', title: `Focus: ${focus[1]} (your weakest skill)`, min: 10, href: focus[0] };
  const quick = { id: 'exam', title: 'Quick exam (5 questions)', min: 3, href: '#/exam' };
  if (minutes <= 10) return [review, talk];
  if (minutes <= 20) return [review, talk, { ...focused, min: 7 }];
  if (minutes <= 30) return [review, talk, media, focused];
  return [review, talk, media, focused, quick];
}

export function render(root) {
  const s = state.profile.settings;
  root.append(h('h1', {}, 'Today\'s session'), h('p', { class: 'muted' }, 'Pick the time you have. The plan adapts to your due cards and weakest skill.'));
  const holder = h('div', {});
  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Available time' });
  function draw() {
    clear(tabs);
    for (const m of [10, 20, 30, 45]) tabs.append(h('button', { class: 'btn', type: 'button', 'aria-pressed': String(s.dailyMinutes === m), onclick: () => { s.dailyMinutes = m; save(); draw(); } }, m + ' min'));
    clear(holder);
    const plan = buildPlan(s.dailyMinutes);
    holder.append(card(h('ol', {}, plan.map((st) => h('li', { style: { margin: '8px 0' } }, h('a', { href: st.href }, st.title), ' ', badge(st.min + ' min')))), note('Finish the steps in any order. When you are done, tap "Finish session" to get your learning report.', 'info')));
  }
  draw();
  root.append(tabs, holder);
  const out = h('div', {});
  root.append(h('div', { class: 'row' }, btn('Finish session & get report', () => {
    const r = finishSession();
    clear(out);
    if (!r) { out.append(note('Nothing practised yet in this session. Do an activity first, then finish.', 'info')); return; }
    out.append(reportCard(r));
  }, 'primary'), hasActiveSession() ? badge('session in progress', 'ok') : null), out);
}

export function reportCard(r) {
  return card(
    h('h2', {}, 'Learning report'), h('p', { class: 'muted' }, `${r.minutes} minute${r.minutes > 1 ? 's' : ''} · ${new Date(r.date).toLocaleString()}`),
    h('h3', {}, 'Activities completed'), h('ul', {}, r.activities.map((a) => h('li', {}, a))),
    h('h3', {}, 'Skills practised'), h('p', {}, r.skills.join(', ') || '–'),
    h('h3', {}, 'Important corrections'), r.corrections.length ? h('ul', {}, r.corrections.map((c) => h('li', {}, `${c.wrong} → ${c.right} (${c.category})`))) : h('p', { class: 'muted' }, 'None logged.'),
    h('h3', {}, 'New expressions'), h('p', {}, (r.newExpressions || []).join('; ') || '–'),
    h('h3', {}, 'Mistakes to review'), r.mistakesToReview.length ? h('ul', {}, r.mistakesToReview.map((m) => h('li', {}, `${m.wrong} → ${m.right}`))) : h('p', { class: 'muted' }, 'None.'),
    h('h3', {}, 'Recommended next session'), h('ul', {}, (r.next || recommendNext()).map((x) => h('li', {}, x))));
}
