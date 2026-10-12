import { h, clear, card, btn, note, badge, toast } from '../ui.js';
import { state } from '../store.js';
import { config, askTeacher } from '../ai.js';
import { GRAMMAR } from '../content/grammar.js';
import { VOCAB, FUNCTIONS } from '../content/vocab.js';
import { speak } from '../speech.js';
import { speechInput, aiNeededNote } from './shared.js';
import { logActivity } from '../session.js';

// Offline fallback: keyword search over the built-in lessons and expressions.
export function offlineSearch(query) {
  const words = String(query).toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 2 && !['the', 'and', 'what', 'when', 'how', 'why', 'for', 'with', 'use', 'say', 'does', 'mean'].includes(w));
  if (!words.length) return [];
  const score = (text) => words.reduce((a, w) => a + (text.toLowerCase().includes(w) ? 1 : 0), 0);
  const hits = [];
  for (const g of GRAMMAR) { const s = score(g.title + ' ' + g.rule); if (s) hits.push({ s, type: 'Grammar', title: g.title, text: g.rule + ' Example: ' + g.ex[0] }); }
  for (const v of VOCAB) { const s = score(v.expr + ' ' + v.meaning); if (s) hits.push({ s, type: 'Expression', title: v.expr, text: v.meaning + '. Example: ' + v.ex[0] }); }
  for (const [k, list] of Object.entries(FUNCTIONS)) { const s = score(k); if (s) hits.push({ s, type: 'Useful phrases: ' + k, title: k, text: list.join('  ·  ') }); }
  return hits.sort((a, b) => b.s - a.s).slice(0, 5);
}

export function render(root) {
  root.append(h('h1', {}, 'Ask your teacher'), h('p', { class: 'muted' }, 'Ask about grammar, vocabulary, how to say something at work, or why a correction was made.'));
  const log = h('div', {});
  const history = [];
  const inp = speechInput({ rows: 3, placeholder: 'e.g. "What is the difference between delay and postpone?"' });
  const go = btn('Ask', async () => {
    const q = inp.getText(); if (!q) return;
    inp.setText(''); go.disabled = true;
    log.prepend(card(h('p', {}, h('strong', {}, 'You: '), q)));
    if (!config.aiReady) {
      const hits = offlineSearch(q);
      log.prepend(card(note('Offline mode: showing matching lessons from the built-in material. Add an AI key for full answers.', 'info'), hits.length ? hits.map((x) => h('div', { style: { margin: '8px 0' } }, h('strong', {}, x.title), ' ', badge(x.type), h('div', { class: 'small' }, x.text))) : h('p', {}, 'No matching built-in lesson found. Try different keywords.')));
      go.disabled = false; logActivity('Ask teacher (offline)', '', ['grammar']); return;
    }
    try {
      const a = await askTeacher(q, history.slice(-6));
      history.push({ role: 'user', content: q }, { role: 'assistant', content: a });
      log.prepend(card(h('div', { style: { whiteSpace: 'pre-wrap' } }, a), h('div', { class: 'row', style: { marginTop: '6px' } }, btn('🔊 Listen', () => speak(a), 'small'), badge('AI answer', 'warn'))));
      logActivity('Ask teacher', q.slice(0, 40), ['grammar', 'vocabulary']);
    } catch (e) { log.prepend(card(note('Could not get an answer: ' + e.message))); }
    go.disabled = false;
  }, 'primary');
  root.append(card(inp.el, h('div', { class: 'row', style: { marginTop: '8px' } }, go), !config.aiReady ? aiNeededNote() : null), log);
}
