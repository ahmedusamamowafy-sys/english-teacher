import { h, clear, card, btn, note, badge, toast, fmtDate } from '../ui.js';
import { state, save } from '../store.js';
import { WRITING_CONTEXTS } from '../content/scenarios.js';
import { config, correctWriting } from '../ai.js';
import { offlineCheck, textStats } from '../offline.js';
import { correctionView, aiNeededNote, speechInput } from './shared.js';
import { logActivity, awardSkill, logNewExpression, creditCorrectUses } from '../session.js';
import { newCard, autoGrade } from '../srs.js';
import { roughWritingLevel } from '../plan.js';

export function addVocabCard(v) {
  const id = 'w:' + String(v.expression).toLowerCase();
  if (state.cards.some((c) => c.id === id)) return false;
  const ex = v.example || '';
  const rx = new RegExp(String(v.expression).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  state.cards.push(newCard({ id, type: 'vocab', front: v.expression, back: v.meaning || '', examples: ex ? [ex] : [], cloze: ex && rx.test(ex) ? ex.replace(rx, '___') : '', tags: ['from-writing'] }));
  logNewExpression(v.expression);
  save();
  return true;
}

export function render(root) {
  root.append(h('h1', {}, 'Writing workspace'), h('p', { class: 'muted' }, 'Write, submit, and get corrections that explain the important edits and keep your meaning.'));
  const sel = h('select', { 'aria-label': 'Writing context' }, WRITING_CONTEXTS.map((c) => h('option', { value: c.id }, c.label)));
  const promptEl = h('p', { class: 'muted' });
  const ta = h('textarea', { rows: 9, placeholder: 'Write here…', 'aria-label': 'Your writing' });
  const counter = h('span', { class: 'muted small' }, '0 words');
  const out = h('div', {});
  const ctx = () => WRITING_CONTEXTS.find((c) => c.id === sel.value);
  const showPrompt = () => { promptEl.textContent = ctx().prompt + '  Hint: ' + ctx().hint; };
  sel.addEventListener('change', showPrompt); showPrompt();
  ta.addEventListener('input', () => { counter.textContent = (ta.value.match(/[A-Za-z']+/g) || []).length + ' words'; });
  const dictate = speechInput({ rows: 2, placeholder: 'Optional: dictate a sentence, then copy it into your text', onStop: (t) => { if (t) { ta.value = (ta.value ? ta.value + ' ' : '') + t; ta.dispatchEvent(new Event('input')); } } });

  const go = btn('Submit for feedback', async () => {
    const text = ta.value.trim();
    if (text.split(/\s+/).length < 4) { toast('Please write a little more.'); return; }
    go.disabled = true; clear(out); out.append(h('p', { class: 'muted' }, 'Checking…'));
    creditCorrectUses(text);
    const stats = textStats(text);
    let res = null, ai = false;
    if (config.aiReady) { try { res = await correctWriting(text, ctx().label + ': ' + ctx().prompt); ai = true; } catch (e) { toast('AI check failed: ' + e.message); } }
    clear(out);
    if (!ai) {
      const off = offlineCheck(text);
      out.append(card(h('h3', { style: { marginTop: 0 } }, 'Offline check'), correctionView(off, text, { allowRepeat: false }), h('p', { class: 'small muted' }, `${stats.words} words · ${stats.sentences} sentences · average ${stats.avgSentence} words per sentence.`), config.aiReady ? null : aiNeededNote()));
      state.writings.push({ id: 'wr_' + Date.now().toString(36), date: Date.now(), context: ctx().id, original: text, result: { offline: true, errors: off.errors, corrected: off.corrected } }); save();
      awardSkill('writing', roughWritingLevel({ words: stats.words, avgSentence: stats.avgSentence, errorCount: off.errors.length }), 0.3);
    } else {
      const errs = Array.isArray(res.errors) ? res.errors : [];
      const view = h('div', {});
      view.append(card(h('h3', { style: { marginTop: 0 } }, 'Your text, with corrections'), correctionView({ hasErrors: errs.length > 0, errors: errs, corrected: res.corrected, natural: '', confidence: res.confidence }, text, { allowRepeat: false })));
      if (res.professional) view.append(card(h('h3', { style: { marginTop: 0 } }, 'Natural, professional version'), h('p', {}, res.professional), btn('🔊 Hear it', () => import('../speech.js').then((m) => m.speak(res.professional)), 'small')));
      if (Array.isArray(res.vocabulary) && res.vocabulary.length) {
        view.append(card(h('h3', { style: { marginTop: 0 } }, 'Vocabulary and collocations worth learning'), h('table', {}, h('tbody', {}, res.vocabulary.map((v) => h('tr', {}, h('td', {}, h('strong', {}, v.expression)), h('td', {}, v.meaning), h('td', { class: 'small muted' }, v.example), h('td', {}, btn('+ Card', (e) => { toast(addVocabCard(v) ? 'Added to your cards.' : 'Already in your cards.'); e.target.disabled = true; }, 'small'))))))));
      }
      if (res.patterns) view.append(card(h('h3', { style: { marginTop: 0 } }, 'Recurring weaknesses'), h('p', {}, res.patterns)));
      if (res.exercise && Array.isArray(res.exercise.items) && res.exercise.items.length) view.append(exerciseCard(res.exercise));
      out.append(view);
      state.writings.push({ id: 'wr_' + Date.now().toString(36), date: Date.now(), context: ctx().id, original: text, result: { corrected: res.corrected, professional: res.professional, errors: errs, level: res.levelEstimate } }); save();
      if (Number(res.levelEstimate)) awardSkill('writing', Number(res.levelEstimate), res.confidence === 'low' ? 0.5 : 1);
    }
    logActivity('Writing', ctx().label, ['writing', 'grammar']);
    go.disabled = false;
  }, 'primary');

  root.append(card(h('label', {}, 'Context'), sel, promptEl, ta, h('div', { class: 'row between', style: { marginTop: '6px' } }, counter, h('div', { class: 'row' }, go, btn('Clear', () => { ta.value = ''; clear(out); }))), h('details', { style: { marginTop: '8px' } }, h('summary', {}, 'Dictate instead of typing'), dictate.el)), out);

  if (state.writings.length) {
    root.append(h('h2', {}, 'Recent writing'), card(h('table', {}, h('tbody', {}, state.writings.slice(-6).reverse().map((w) => h('tr', {}, h('td', { class: 'small' }, fmtDate(w.date)), h('td', { class: 'small' }, (WRITING_CONTEXTS.find((c) => c.id === w.context) || {}).label || w.context), h('td', { class: 'small' }, w.original.slice(0, 80) + (w.original.length > 80 ? '…' : ''))))))));
  }
}

function exerciseCard(ex) {
  const inputs = ex.items.map(() => h('input', { type: 'text', 'aria-label': 'Your answer' }));
  const res = h('div', {});
  return card(h('h3', { style: { marginTop: 0 } }, 'Practice from your own mistakes'), h('p', { class: 'small muted' }, ex.instruction || 'Fix or complete each item.'),
    ex.items.map((it, i) => h('div', { style: { margin: '8px 0' } }, h('div', {}, `${i + 1}. ${it.prompt}`), inputs[i])),
    btn('Check', () => {
      clear(res);
      ex.items.forEach((it, i) => { const g = autoGrade(inputs[i].value, it.answer); res.append(h('div', {}, g >= 4 ? h('span', { class: 'good' }, '✔ ') : h('span', { class: 'bad' }, '✘ '), g >= 4 ? inputs[i].value : `Answer: ${it.answer}`)); });
    }, 'primary small'), res);
}
