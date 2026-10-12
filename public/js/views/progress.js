import { h, clear, card, btn, note, badge, fmtDate, toast, pct } from '../ui.js';
import { state, save, errorStats } from '../store.js';
import { levelMeters } from './shared.js';
import { weeklyReview, recommendNext } from '../session.js';
import { reportCard } from './today.js';
import { retention } from '../srs.js';
import { buildProfile } from '../plan.js';
import { toDetail, SKILLS } from '../levels.js';
import { errorCardsFromMistakes } from './vocab.js';
import { CATEGORIES } from '../content/exams.js';
import { soundStats, SOUND_NAMES } from '../convo.js';

export function render(root) {
  const w = weeklyReview();
  root.append(h('h1', {}, 'Progress'));
  const days = state.profile.placementDate ? Math.floor((Date.now() - state.profile.placementDate) / 86400000) : null;
  if (!state.profile.placementDone) root.append(note('No placement yet, so no level data. Start from the Home page.', 'info'));
  else if (days >= 28) root.append(note(`It has been ${days} days since your last placement. Time to reassess so the plan reflects real progress.`), btn('Reassess now', () => { location.hash = '#/placement'; }, 'primary'));

  root.append(card(h('h2', { style: { marginTop: 0 } }, 'Levels now'), levelMeters(), levelHistory()));
  root.append(card(h('h2', { style: { marginTop: 0 } }, 'Weekly review'), h('div', { class: 'grid' }, stat('Sessions', w.sessions), stat('Minutes', w.minutes), stat('Active days', w.days), stat('Card retention', pct(w.retention)), stat('Mistake types improving', w.improving), stat('New mistake types', w.errNew)), h('h3', {}, 'Recommended focus'), h('ul', {}, recommendNext().map((x) => h('li', {}, x)))));
  root.append(errorsCard());
  root.append(pronCard());
  root.append(sessionsCard());
  root.append(notesCard());
}

function levelHistory() {
  const snaps = state.exams.filter((e) => e.kind === 'placement' && e.levels);
  if (snaps.length < 2) return h('p', { class: 'muted small' }, snaps.length ? 'After your next placement you will see how each skill changed.' : '');
  const a = snaps[snaps.length - 2].levels, b = snaps[snaps.length - 1].levels;
  return h('div', {}, h('h3', {}, 'Change since previous placement'), h('table', {}, h('tbody', {}, SKILLS.filter((k) => a[k].n && b[k].n).map((k) => { const d = b[k].est - a[k].est; return h('tr', {}, h('td', {}, k), h('td', {}, toDetail(a[k].est) + ' → ' + toDetail(b[k].est)), h('td', { class: d > 0.1 ? 'good' : d < -0.1 ? 'bad' : '' }, (d > 0 ? '+' : '') + d.toFixed(2))); }))));
}

function errorsCard() {
  const stats = errorStats();
  const list = [...state.errors].sort((a, b) => b.occurrences - a.occurrences).slice(0, 30);
  return card(h('h2', { style: { marginTop: 0 } }, 'My error database'),
    !state.errors.length ? h('p', { class: 'muted' }, 'No mistakes logged yet. They are recorded when you speak or write and get corrections.') : h('div', {},
      h('div', { class: 'pill-list' }, stats.map((s) => badge(`${s.category}: ${s.occ}`))),
      h('table', {}, h('thead', {}, h('tr', {}, ['Mistake', 'Seen', 'Status', 'Last'].map((x) => h('th', {}, x)))), h('tbody', {}, list.map((e) => h('tr', {}, h('td', {}, h('span', { class: 'del' }, e.wrong), ' → ', h('span', { class: 'ins' }, e.right), h('div', { class: 'small muted' }, e.category + ' · ' + e.why)), h('td', {}, '×' + e.occurrences), h('td', {}, badge(e.status, e.status === 'improving' ? 'ok' : 'warn')), h('td', { class: 'small' }, fmtDate(e.lastSeen)))))),
      h('p', { class: 'small muted' }, '"Improving" = used correctly three times since the last mistake. If the same mistake appears again, it returns to "active".'),
      btn('Turn mistakes into review cards', () => { const n = errorCardsFromMistakes(); toast(n ? n + ' card(s) added.' : 'Nothing new to add.'); }, 'small')));
}

function pronCard() {
  const az = state.pron.filter((p) => p.kind === 'azure').slice(-8);
  const dis = state.pron.filter((p) => p.kind === 'discrimination').slice(-8);
  const sounds = soundStats();
  if (!az.length && !dis.length && !sounds.length) return h('span', {});
  return card(h('h2', { style: { marginTop: 0 } }, 'Pronunciation'),
    sounds.length ? h('div', {}, h('h3', {}, 'Sounds the teacher heard you struggle with ', badge('AI estimate from your voice', 'warn')), h('table', {}, h('tbody', {}, sounds.slice(0, 8).map((x) => h('tr', {}, h('td', {}, SOUND_NAMES[x.sound] || x.sound), h('td', {}, '×' + x.n), h('td', { class: 'small muted' }, x.examples.join(', ')))))), h('p', { class: 'small muted' }, 'Practise these in Speak → Sound pairs, and ask the teacher about them.')) : null,
    az.length ? h('div', {}, h('h3', {}, badge('Measured (Azure)', 'ok')), h('table', {}, h('tbody', {}, az.map((p) => h('tr', {}, h('td', { class: 'small' }, fmtDate(p.date)), h('td', {}, `acc ${Math.round(p.accuracy)} · flu ${Math.round(p.fluency)}${p.prosody != null ? ' · pro ' + Math.round(p.prosody) : ''}`), h('td', { class: 'small muted' }, (p.ref || '').slice(0, 40)))))) ) : null,
    dis.length ? h('div', {}, h('h3', {}, 'Sound-pair listening quizzes'), h('table', {}, h('tbody', {}, dis.map((p) => h('tr', {}, h('td', { class: 'small' }, fmtDate(p.date)), h('td', {}, p.group), h('td', {}, `${p.correct}/${p.total}`)))))) : null);
}

function sessionsCard() {
  const list = state.sessions.slice(-10).reverse();
  const holder = h('div', {});
  return card(h('h2', { style: { marginTop: 0 } }, 'Session reports'), !list.length ? h('p', { class: 'muted' }, 'Finish a session from the Today page to create a report.') : h('div', {}, list.map((s) => h('div', { class: 'row between', style: { margin: '4px 0' } }, h('span', {}, `${new Date(s.date).toLocaleDateString()} · ${s.minutes} min · ${s.activities.length} activities`), btn('Open', () => { clear(holder); holder.append(reportCard(s)); holder.scrollIntoView({ behavior: 'smooth' }); }, 'small')))), holder);
}

function notesCard() {
  const notes = state.profile.teacherNotes || [];
  if (!notes.length) return h('span', {});
  const box = card(h('h2', { style: { marginTop: 0 } }, 'What the teacher remembers about you'), h('p', { class: 'small muted' }, 'Short facts used to make conversations personal. Remove anything you do not want kept.'));
  notes.forEach((n, i) => box.append(h('div', { class: 'row between', style: { margin: '4px 0' } }, h('span', {}, n), btn('Remove', () => { state.profile.teacherNotes.splice(i, 1); save(); location.hash = '#/progress'; window.dispatchEvent(new HashChangeEvent('hashchange')); }, 'small danger'))));
  return box;
}

const stat = (label, value) => h('div', {}, h('div', { style: { fontSize: '1.6rem', fontWeight: 700 } }, String(value)), h('div', { class: 'muted small' }, label));
