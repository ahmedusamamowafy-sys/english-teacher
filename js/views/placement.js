import { h, clear, card, btn, note, badge, mcqRunner, shuffle, toast } from '../ui.js';
import { state, save } from '../store.js';
import { estimateFromItems, emptyLevels, toDetail, SKILLS } from '../levels.js';
import { BANK, PLACEMENT_READING, PLACEMENT_LISTENING, PLACEMENT_VOCAB, PLACEMENT_PROMPTS } from '../content/exams.js';
import { config, correctWriting, correctSentence } from '../ai.js';
import { speak, startRecorder, assessPronunciation } from '../speech.js';
import { offlineCheck, textStats } from '../offline.js';
import { speechInput, correctionView, levelMeters, aiNeededNote } from './shared.js';
import { awardSkill, logActivity } from '../session.js';
import { buildProfile, roughWritingLevel, roughSpeakingLevel } from '../plan.js';

const GRAMMAR_CATS = ['tenses', 'prepositions', 'articles', 'modals', 'passive'];

export function pickGrammarItems() {
  const pool = BANK.filter((b) => GRAMMAR_CATS.includes(b.cat));
  const want = { 1: 2, 2: 3, 3: 3, 4: 2, 5: 2 };
  const out = [];
  for (const [lvl, n] of Object.entries(want)) out.push(...shuffle(pool.filter((p) => p.level === Number(lvl))).slice(0, n));
  return out;
}

export function render(root) {
  const R = { grammar: [], vocab: [], reading: [], listening: [], writing: null, speaking: null, pron: null };
  const body = h('div', {});
  root.append(h('h1', {}, 'Placement assessment'), h('p', { class: 'muted' }, 'Seven short sections. Answer honestly and do not guess wildly; the goal is an accurate starting point. You can skip speaking or writing sections if you cannot do them now.'), body);
  const steps = [intro, grammar, vocab, reading, listening, writing, speaking, pronunciation, results];
  let idx = 0;
  const next = () => { idx++; steps[idx](); window.scrollTo(0, 0); };
  const stepBar = () => h('div', { class: 'progress' }, h('div', { style: { width: (idx / (steps.length - 1)) * 100 + '%' } }));
  const show = (...nodes) => { clear(body); body.append(stepBar(), ...nodes); };

  function intro() {
    show(card(h('h2', {}, 'Before you start'), h('ul', {},
      h('li', {}, 'About 25 minutes in total. Your level estimates are saved only when you reach the end; you can leave and retake later.'),
      h('li', {}, 'Listening needs sound. Speaking needs a microphone (Chrome or Edge work best).'),
      h('li', {}, 'Results are estimates on the CEFR scale (A1 to C2). One short answer never decides your level.')),
      !config.aiReady ? aiNeededNote() : null,
      h('p', { class: 'ar', dir: 'rtl' }, 'هذا الاختبار لتحديد مستواك الحالي بشكل تقريبي. أجب بصدق ولا تخمّن عشوائياً.'),
      btn('Start', next, 'primary')));
  }

  function mcqSection(title, desc, items, key, skill) {
    show(card(h('h2', {}, title), h('p', { class: 'muted' }, desc), mcqRunner({ items, showExplain: false, label: title, onDone: (res) => { R[key] = res.map((r) => ({ level: r.item.level, correct: r.correct })); next(); } })));
  }
  function grammar() { mcqSection('1 · Grammar', 'Choose the best answer.', pickGrammarItems(), 'grammar', 'grammar'); }
  function vocab() { mcqSection('2 · Vocabulary', 'Choose the best meaning.', PLACEMENT_VOCAB, 'vocab', 'vocabulary'); }

  function reading() {
    let p = 0;
    const res = [];
    const run = () => {
      if (p >= PLACEMENT_READING.length) { R.reading = res; return next(); }
      const t = PLACEMENT_READING[p];
      show(card(h('h2', {}, '3 · Reading'), h('h3', {}, t.title), h('p', {}, t.text), mcqRunner({ items: t.questions, showExplain: false, label: `Passage ${p + 1}/${PLACEMENT_READING.length}`, onDone: (r) => { r.forEach((x) => res.push({ level: x.item.level, correct: x.correct })); p++; run(); } })));
    };
    run();
  }

  function listening() {
    let p = 0; const res = [];
    const run = () => {
      if (p >= PLACEMENT_LISTENING.length) { R.listening = res; return next(); }
      const it = PLACEMENT_LISTENING[p];
      let plays = 0;
      const playB = btn('▶ Play', () => { if (plays >= 2) { toast('Maximum two plays.'); return; } plays++; playB.textContent = `▶ Play again (${2 - plays} left)`; speak(it.text, { lang: it.accent, rate: 1 }); }, 'primary');
      show(card(h('h2', {}, '4 · Listening'), h('p', { class: 'muted' }, 'You can play each recording twice. The text is hidden.'), playB, mcqRunner({ items: [it.q], showExplain: false, label: `Recording ${p + 1}/${PLACEMENT_LISTENING.length}`, onDone: (r) => { res.push({ level: it.level, correct: r[0].correct }); p++; run(); } })));
    };
    run();
  }

  function writing() {
    const ta = h('textarea', { placeholder: 'Write here…', rows: 6, 'aria-label': 'Your writing' });
    const out = h('div', {});
    const go = btn('Submit writing', async () => {
      const text = ta.value.trim();
      if (text.split(/\s+/).length < 8) { toast('Please write at least a few sentences.'); return; }
      go.disabled = true; clear(out);
      const stats = textStats(text);
      let level, view;
      try {
        if (config.aiReady) {
          const res = await correctWriting(text, 'placement writing task');
          level = Number(res.levelEstimate) || null;
          const errs = Array.isArray(res.errors) ? res.errors : [];
          view = correctionView({ hasErrors: errs.length > 0, errors: errs, corrected: res.corrected, natural: res.professional, confidence: res.confidence, comment: res.patterns }, text, { allowRepeat: false });
        }
      } catch (e) { out.append(note('AI check failed: ' + e.message + '. Using the offline estimate.')); }
      if (level == null) {
        const off = offlineCheck(text);
        level = roughWritingLevel({ words: stats.words, avgSentence: stats.avgSentence, errorCount: off.errors.length });
        view = view || correctionView(off, text, { allowRepeat: false });
        out.append(note('Rough offline estimate (low confidence). With an AI key this is much more reliable.', 'info'));
      }
      R.writing = { level, w: config.aiReady ? 3 : 1 };
      out.append(view, btn('Continue', next, 'primary'));
    }, 'primary');
    show(card(h('h2', {}, '5 · Writing'), h('p', {}, PLACEMENT_PROMPTS.writing), ta, h('div', { class: 'row', style: { marginTop: '8px' } }, go, btn('Skip', () => { R.writing = null; next(); })), out));
  }

  function speaking() {
    const out = h('div', {});
    const inp = speechInput({ rows: 6, onStop: () => {} });
    const go = btn('Submit speaking', async () => {
      const text = inp.getText();
      if (text.split(/\s+/).length < 15) { toast('Please speak (or type) a little more: at least a few sentences.'); return; }
      go.disabled = true; clear(out);
      const words = (text.match(/[A-Za-z']+/g) || []).length;
      const wpm = words; // the task is about one minute; this is a rough proxy only
      const stats = textStats(text);
      let level = null, view = null;
      try {
        if (config.aiReady) {
          const res = await correctSentence(text, 'balanced', 'spoken answer (transcribed)');
          level = Number(res.levelEstimate) || null;
          view = correctionView(res, text, { allowRepeat: false });
        }
      } catch (e) { out.append(note('AI check failed: ' + e.message)); }
      if (level == null) {
        level = roughSpeakingLevel({ wordsPerMinute: wpm, avgSentence: stats.avgSentence });
        view = correctionView(offlineCheck(text), text, { allowRepeat: false });
        out.append(note('Rough offline estimate from length only (low confidence).', 'info'));
      }
      R.speaking = { level, w: config.aiReady ? 3 : 1 };
      out.append(view, btn('Continue', next, 'primary'));
    }, 'primary');
    show(card(h('h2', {}, '6 · Speaking'), h('p', {}, PLACEMENT_PROMPTS.speaking), note('Speech recognition transcribes what you say; you can correct the text before submitting. Pronunciation cannot be measured by transcription alone (next section).', 'info'), inp.el, h('div', { class: 'row', style: { marginTop: '8px' } }, go, btn('Skip', () => { R.speaking = null; next(); })), out));
  }

  function pronunciation() {
    if (!config.azureSpeech) {
      show(card(h('h2', {}, '7 · Pronunciation'), note('Pronunciation scoring needs Azure Speech (not configured), so your pronunciation level is left unassessed rather than guessed. You can still train it in the Speak section, and add Azure keys later.', 'info'), btn('Continue', next, 'primary')));
      return;
    }
    const ref = 'The project manager said that the schedule is three weeks behind.';
    const out = h('div', {});
    let rec = null;
    const b = btn('🎙️ Record', async () => {
      if (!rec) { try { rec = await startRecorder(); b.textContent = '⏹ Stop and score'; b.classList.add('rec'); } catch { toast('Microphone permission needed.'); } return; }
      const r = await rec.stop(); rec = null; b.textContent = '🎙️ Record'; b.classList.remove('rec'); clear(out); out.append(h('p', {}, 'Scoring…'));
      try {
        const s = await assessPronunciation(r.wav, ref);
        clear(out);
        out.append(h('p', {}, badge('Measured (Azure)', 'ok'), ` Accuracy ${Math.round(s.accuracy)} · Fluency ${Math.round(s.fluency)} · Completeness ${Math.round(s.completeness)}${s.prosody != null ? ' · Prosody ' + Math.round(s.prosody) : ''}`));
        // Map 0-100 accuracy to a rough CEFR-like estimate; conservative and low weight.
        const acc = (s.accuracy + s.fluency) / 2;
        const lvl = acc >= 90 ? 5 : acc >= 80 ? 4 : acc >= 70 ? 3 : acc >= 55 ? 2 : 1;
        R.pron = { level: lvl, w: 1, scores: s };
        out.append(btn('Continue', next, 'primary'));
      } catch (e) { clear(out); out.append(note('Scoring failed: ' + e.message)); }
    }, '');
    show(card(h('h2', {}, '7 · Pronunciation'), h('p', {}, 'Read this sentence aloud:'), h('p', { style: { fontSize: '1.15rem' } }, ref), h('div', { class: 'row' }, btn('🔊 Hear it', () => speak(ref), 'small'), b, btn('Skip', () => { R.pron = null; next(); })), out));
  }

  function results() {
    const apply = (skill, items) => {
      if (!items || !items.length) return;
      const est = estimateFromItems(items);
      awardSkill(skill, est, Math.max(2, items.length / 2));
    };
    // Fresh start for first placement; blend into existing estimates on a retake.
    if (!state.profile.placementDone) state.profile.levels = emptyLevels();
    apply('grammar', R.grammar); apply('vocabulary', R.vocab); apply('reading', R.reading); apply('listening', R.listening);
    if (R.writing) awardSkill('writing', R.writing.level, R.writing.w);
    if (R.speaking) awardSkill('speaking', R.speaking.level, R.speaking.w);
    if (R.pron) awardSkill('pronunciation', R.pron.level, R.pron.w);
    state.profile.placementDone = true; state.profile.placementDate = Date.now();
    state.exams.push({ id: 'x_' + Date.now().toString(36), kind: 'placement', date: Date.now(), levels: JSON.parse(JSON.stringify(state.profile.levels)) });
    save();
    logActivity('Placement assessment', '', SKILLS);
    const prof = buildProfile(state.profile.levels, state.errors);
    show(card(h('h2', {}, 'Your learning profile'), levelMeters(),
      h('p', {}, h('strong', {}, 'Strongest: '), prof.strongest.join(', ') || '–', '   ', h('strong', {}, 'Weakest: '), prof.weakest.join(', ') || '–'),
      prof.unassessed.length ? note('Not assessed yet: ' + prof.unassessed.join(', ') + '. These stay at "–" until there is evidence.', 'info') : null,
      h('h3', {}, 'Most frequent errors so far'), prof.topErrors.length ? h('ul', {}, prof.topErrors.map((e) => h('li', {}, `${e.wrong} → ${e.right} (${e.category})`))) : h('p', { class: 'muted' }, 'None logged yet; they appear as you write and speak.'),
      h('h3', {}, 'Recommended weekly schedule'), h('ul', {}, prof.days.map(([d, a]) => h('li', {}, h('strong', {}, d + ': '), a))), prof.extra.length ? h('p', { class: 'small' }, 'Extra time on your weakest skills: ' + prof.extra.join('; ')) : null,
      h('h3', {}, 'Objectives'), h('ul', {}, [...prof.objectives.short, ...prof.objectives.long].map((o) => h('li', {}, o))),
      note('These are estimates from a short test, so treat them as a starting point. The app re-estimates as you practise, and you should retake this assessment in about 4 weeks.', 'info'),
      btn('Go to today\'s plan', () => { location.hash = '#/today'; }, 'primary')));
  }

  steps[0]();
}
