import { load, state, save, setRemote, getProfiles, switchProfile } from './store.js';
import { loadConfig, config } from './ai.js';
import { newCard } from './srs.js';
import { VOCAB } from './content/vocab.js';
import { h, clear, toast } from './ui.js';
import { hasActiveSession } from './session.js';

const ROUTES = [
  ['', 'Home', '🏠', 'dashboard'],
  ['today', 'Today', '📅', 'today'],
  ['talk', 'Talk', '💬', 'talk'],
  ['voice', 'Hands-free', '🚗', 'voice'],
  ['pron', 'Speak', '🎙️', 'pron'],
  ['write', 'Write', '✍️', 'write'],
  ['read', 'Read', '📖', 'read'],
  ['listen', 'Listen', '🎧', 'listen'],
  ['vocab', 'Vocabulary', '🗂️', 'vocab'],
  ['grammar', 'Grammar', '🧩', 'grammar'],
  ['exam', 'Quick exam', '⏱️', 'exam'],
  ['ask', 'Ask teacher', '🙋', 'ask'],
  ['progress', 'Progress', '📈', 'progress'],
  ['settings', 'Settings', '⚙️', 'settings'],
];
const HIDDEN = { placement: 'placement' };

function seedCards() {
  if (state.seeded) return;
  for (const v of VOCAB) {
    state.cards.push(newCard({ id: 'v:' + v.expr, type: 'vocab', front: v.expr, back: v.meaning, arabic: v.ar || '', collocations: v.colloc || [], examples: v.ex || [], cloze: v.cloze, tags: [v.tag] }));
  }
  state.seeded = true;
  save();
}

function renderNav(current) {
  const nav = document.getElementById('nav');
  clear(nav);
  nav.append(h('div', { class: 'brand' }, '🎓 My English Teacher'));
  const profs = getProfiles();
  if (profs.list.length > 1) {
    nav.append(h('div', { class: 'brand-learner' }, h('label', { class: 'sr-only', for: 'learner' }, 'Learner'),
      h('select', { id: 'learner', 'aria-label': 'Learner', onchange: (e) => { switchProfile(e.target.value); location.reload(); } }, profs.list.map((p) => h('option', { value: p.id, selected: p.id === profs.current }, '👤 ' + p.name)))));
  }
  for (const [path, label, icon] of ROUTES) {
    nav.append(h('a', { href: '#/' + path, 'aria-current': path === current ? 'page' : null }, h('span', { 'aria-hidden': 'true' }, icon), h('span', {}, label)));
  }
}

let cleanup = null;
async function route() {
  const hash = location.hash.replace(/^#\/?/, '').split('?')[0];
  const name = hash || '';
  const known = ROUTES.find((r) => r[0] === name) || (HIDDEN[name] ? [name, '', '', HIDDEN[name]] : ROUTES[0]);
  renderNav(known[0]);
  if (typeof cleanup === 'function') { try { cleanup(); } catch {} }
  cleanup = null;
  const main = document.getElementById('main');
  clear(main);
  main.append(h('p', { class: 'muted' }, 'Loading…'));
  try {
    const mod = await import(`./views/${known[3]}.js`);
    clear(main);
    cleanup = await mod.render(main);
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    clear(main);
    main.append(h('div', { class: 'card' }, h('h2', {}, 'Something went wrong'), h('p', {}, String(e.message || e)), h('a', { href: '#/' }, 'Back to home')));
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => { if (hasActiveSession()) { /* data is saved on every action; nothing to block */ } });

(async function init() {
  await loadConfig();
  setRemote(config.server);
  await load();
  seedCards();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  await route();
  if (!state.profile.placementDone && !sessionStorage.getItem('placementNudged')) {
    sessionStorage.setItem('placementNudged', '1');
    toast('Welcome! Start with the placement assessment on the Home page.', 4500);
  }
})();
