import { h, clear, card, btn, note, badge, mcqRunner, toast } from '../ui.js';
import { state, save } from '../store.js';
import { READINGS } from '../content/media.js';
import { config, generateReading, correctWriting, ask } from '../ai.js';
import { offlineCheck, textStats } from '../offline.js';
import { correctionView, aiNeededNote } from './shared.js';
import { speak } from '../speech.js';
import { logActivity, awardSkill, logNewExpression } from '../session.js';
import { addVocabCard } from './write.js';

const LEVEL_NUM = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

export function render(root) {
  root.append(h('h1', {}, 'Reading'), h('p', { class: 'muted' }, 'Graded texts about your work and daily life. Read, check the words you do not know, answer questions, then write a short summary.'));
  const area = h('div', {});
  root.append(area);
  list();

  function list() {
    clear(area);
    const grid = h('div', { class: 'grid' });
    for (const r of READINGS) grid.append(card(h('h3', { style: { marginTop: 0 } }, r.title), h('div', { class: 'row' }, badge(r.level), badge(r.topic)), h('p', { class: 'small muted' }, r.text.slice(0, 90) + '…'), btn('Read', () => open(r), 'primary small')));
    area.append(grid);
    const topic = h('input', { placeholder: 'Topic, e.g. "writing a variation order request"', 'aria-label': 'Topic' });
    const level = h('select', { 'aria-label': 'Level' }, ['A2', 'B1', 'B2', 'C1'].map((l) => h('option', { value: l }, l)));
    const gen = btn('Generate a new text (AI)', async () => {
      if (!topic.value.trim()) { toast('Enter a topic first.'); return; }
      gen.disabled = true; gen.textContent = 'Generating…';
      try { const g = await generateReading(level.value, topic.value.trim()); open({ id: 'gen_' + Date.now(), level: level.value, topic: topic.value.trim(), title: g.title, text: g.text, glossary: g.glossary || [], questions: (g.questions || []).map((q) => ({ q: q.q, options: q.options, answer: q.answer })), generated: true }); }
      catch (e) { toast('Could not generate: ' + e.message); gen.disabled = false; gen.textContent = 'Generate a new text (AI)'; }
    }, 'primary', { disabled: !config.aiReady });
    area.append(card(h('h3', { style: { marginTop: 0 } }, 'Make your own reading'), config.aiReady ? null : aiNeededNote(), topic, h('div', { class: 'row', style: { marginTop: '8px' } }, level, gen)));
  }

  function open(r) {
    clear(area);
    const showAr = state.profile.settings.arabicSupport !== 'off';
    const gloss = h('div', { class: 'note info', hidden: true });
    const textEl = h('p', { style: { fontSize: '1.08rem', lineHeight: 1.8 } });
    // highlight glossary words (clickable)
    const words = (r.glossary || []).map((g) => g.word);
    const rx = words.length ? new RegExp('(' + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi') : null;
    if (rx) {
      r.text.split(rx).forEach((part) => {
        const g = (r.glossary || []).find((x) => x.word.toLowerCase() === part.toLowerCase());
        if (g) textEl.append(h('button', { class: 'btn small', style: { padding: '0 6px', margin: '0 1px', background: 'var(--warn-bg)' }, onclick: () => showGloss(g) }, part));
        else textEl.append(part);
      });
    } else textEl.append(r.text);
    function showGloss(g) {
      clear(gloss); gloss.hidden = false;
      gloss.append(h('strong', {}, g.word), ' — ', g.meaning, (showAr && g.arabic) ? h('span', { class: 'ar', dir: 'rtl' }, '  ' + g.arabic) : null, ' ', btn('+ Card', () => { toast(addVocabCard({ expression: g.word, meaning: g.meaning, example: '' }) ? 'Added to your cards.' : 'Already in your cards.'); }, 'small'), ' ', btn('🔊', () => speak(g.word), 'small'));
      logNewExpression(g.word);
    }
    const qArea = h('div', {});
    const sumArea = h('div', {});
    const trans = h('div', {});
    area.append(card(h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, r.title), badge(r.level)), textEl, gloss, h('div', { class: 'row' }, btn('🔊 Read aloud', () => speak(r.text, { rate: 0.9 }), 'small'), config.aiReady && showAr ? btn('Arabic translation (AI)', async (e) => { e.target.disabled = true; try { const t = await ask({ system: 'Translate the text into clear Modern Standard Arabic. Output only the translation.', messages: [{ role: 'user', content: r.text }], maxTokens: 1200 }); clear(trans); trans.append(badge('AI translation', 'warn'), h('p', { class: 'ar', dir: 'rtl' }, t)); } catch (err) { toast('Translation failed: ' + err.message); } }, 'small') : null, btn('Back', list, 'small')), trans),
      card(h('h3', { style: { marginTop: 0 } }, 'Comprehension'), qArea), sumArea);
    qArea.append(mcqRunner({ items: r.questions, label: 'Check', onDone: (res) => {
      const ok = res.filter((x) => x.correct).length;
      const lv = LEVEL_NUM[r.level] || 3;
      awardSkill('reading', ok / res.length >= 0.67 ? lv + 0.25 : lv - 0.75, 0.5);
      logActivity('Reading', `${r.title} (${ok}/${res.length})`, ['reading']);
      clear(qArea); qArea.append(h('p', {}, `Score: ${ok}/${res.length}`), btn('Try again', () => open(r), 'small'));
      summaryBox();
    } }));
    function summaryBox() {
      clear(sumArea);
      const ta = h('textarea', { rows: 4, placeholder: 'Write 2-3 sentences in your own words (do not copy).' });
      const out = h('div', {});
      sumArea.append(card(h('h3', { style: { marginTop: 0 } }, 'Your summary'), ta, btn('Get feedback', async (e) => {
        const text = ta.value.trim(); if (text.split(/\s+/).length < 8) { toast('Write a little more.'); return; }
        e.target.disabled = true; clear(out);
        try {
          if (config.aiReady) { const res = await correctWriting(text, 'summary of the reading text "' + r.title + '" (check it also matches the text)'); out.append(correctionView({ hasErrors: (res.errors || []).length > 0, errors: res.errors || [], corrected: res.corrected, natural: res.professional, confidence: res.confidence }, text, { allowRepeat: false })); if (Number(res.levelEstimate)) awardSkill('writing', Number(res.levelEstimate), 0.5); }
          else out.append(correctionView(offlineCheck(text), text, { allowRepeat: false }));
        } catch (err) { out.append(note('Feedback failed: ' + err.message)); }
        logActivity('Reading summary', r.title, ['writing', 'reading']); e.target.disabled = false;
      }, 'primary small'), out));
    }
  }
}
