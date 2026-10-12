import { h, card, btn, note, badge, pct } from '../ui.js';
import { state, getProfiles, switchProfile } from '../store.js';
import { config } from '../ai.js';
import { levelMeters } from './shared.js';
import { isDue, isNew, retention } from '../srs.js';
import { recommendNext, weeklyReview } from '../session.js';

export function render(root) {
  const p = state.profile;
  const now = Date.now();
  const due = state.cards.filter((c) => !isNew(c) && isDue(c, now)).length;
  const w = weeklyReview();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  root.append(h('h1', {}, `${greet}, ${p.name}`), h('p', { class: 'muted' }, state.streak.count > 1 ? `🔥 ${state.streak.count}-day streak` : 'Short, regular practice works better than long, rare sessions.'));

  const profs = getProfiles();
  if (profs.list.length > 1) root.append(h('div', { class: 'chips' }, profs.list.map((x) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(x.id === profs.current), onclick: () => { if (x.id !== profs.current) { switchProfile(x.id); location.reload(); } } }, '👤 ' + x.name))));
  if (!config.aiReady) root.append(card(h('h2', { style: { marginTop: 0 } }, '🔑 Connect your free AI teacher'), h('p', {}, 'For real conversations, hands-free talking and accent feedback, add a free Google Gemini key. It takes about 2 minutes and needs no credit card.'), btn('Set it up', () => { location.hash = '#/settings'; }, 'primary')));
  else root.append(h('section', { class: 'card hero' }, h('h2', { style: { marginTop: 0 } }, '🚗 Talk now, hands-free'), h('p', {}, 'Practise speaking anywhere: it listens, replies and coaches your accent.'), h('div', { class: 'row' }, btn('Start hands-free', () => { location.hash = '#/voice'; }), btn('Choose a topic', () => { location.hash = '#/talk'; }))));
  if (!p.placementDone) {
    root.append(card(h('h2', {}, 'Step 1: Placement assessment'), h('p', {}, 'About 25 minutes (you can pause between sections). It estimates your CEFR level for each skill so the plan fits you. Nothing is assumed about your level until you do this.'), btn('Start assessment', () => { location.hash = '#/placement'; }, 'primary')));
  } else {
    root.append(card(h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, 'Today'), badge(`${p.settings.dailyMinutes} min plan`)), h('p', {}, due ? `You have ${due} card${due > 1 ? 's' : ''} due for review.` : 'No cards due right now.'), h('div', { class: 'row' }, btn('Start today\'s session', () => { location.hash = '#/today'; }, 'primary'), btn('Quick exam', () => { location.hash = '#/exam'; }), btn('Review cards', () => { location.hash = '#/vocab'; }))));
  }

  root.append(card(h('h2', {}, 'Your levels (CEFR)'), levelMeters(), h('p', { class: 'muted small' }, 'Estimates, not certificates. Confidence rises as more evidence is collected.'), p.placementDone ? btn('Retake placement', () => { location.hash = '#/placement'; }, 'small') : null));

  root.append(card(h('h2', {}, 'This week'), h('div', { class: 'grid' },
    stat('Sessions', w.sessions), stat('Minutes', w.minutes), stat('Active days', w.days), stat('Card retention (7d)', pct(w.retention)), stat('New mistake types', w.errNew), stat('Improving', w.improving))));

  root.append(card(h('h2', {}, 'Suggested next'), h('ul', {}, recommendNext().map((r) => h('li', {}, r)))));

  root.append(card(h('h2', {}, 'System status'), h('div', { class: 'pill-list' },
    badge(config.aiReady ? `AI teacher: ${config.ai}` : 'AI teacher: not connected', config.aiReady ? 'ok' : 'warn'),
    badge(config.audio ? 'Accent listening: on' : 'Accent listening: off', config.audio ? 'ok' : ''),
    config.azureSpeech ? badge('Pronunciation scoring: Azure', 'ok') : null,
    badge('speechRecognition' in window || 'webkitSpeechRecognition' in window ? 'Speech input: available' : 'Speech input: unavailable here', 'speechRecognition' in window || 'webkitSpeechRecognition' in window ? 'ok' : 'warn')),
    !config.aiReady ? note('Without the AI: exams, flashcards, reading, listening, grammar drills and a limited writing checker still work.', 'info') : null));
}

const stat = (label, value) => h('div', {}, h('div', { style: { fontSize: '1.7rem', fontWeight: 700 } }, String(value)), h('div', { class: 'muted small' }, label));
