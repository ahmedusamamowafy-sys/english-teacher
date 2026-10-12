import { h, clear, card, btn, note, badge, sourceTag, toast, shuffle } from '../ui.js';
import { state, save } from '../store.js';
import { MINIMAL_PAIRS, CLUSTER_WORDS, STRESS_WORDS, SENTENCES_TO_SHADOW } from '../content/media.js';
import { config } from '../ai.js';
import { speak, stopSpeaking, startRecorder, drawWave, assessPronunciation, createRecognizer, sttSupported } from '../speech.js';
import { logActivity, awardSkill } from '../session.js';
import { matchScore, tokens } from '../compare.js';

export function render(root) {
  root.append(h('h1', {}, 'Speaking and pronunciation'), h('p', { class: 'muted' }, 'Goal: clear, internationally understandable English. You do not need to remove your accent.'));
  root.append(note(config.azureSpeech ? 'Azure pronunciation scoring is on: sound-level scores are labelled "Measured". Browser recognition checks are only a rough intelligibility signal.' : 'Azure pronunciation scoring is not configured. You can still listen, record, compare and drill. Without scoring, nothing here claims to measure your pronunciation; it is practice and self-comparison.', 'info'));
  const tabs = [['pairs', 'Sound pairs'], ['shadow', 'Listen · record · compare'], ['stress', 'Word stress'], ['clusters', 'Clusters']];
  const holder = h('div', {});
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  let cur = 'pairs';
  function draw() {
    clear(bar); clear(holder);
    for (const [k, l] of tabs) bar.append(h('button', { class: 'btn', type: 'button', role: 'tab', 'aria-pressed': String(cur === k), onclick: () => { cur = k; draw(); } }, l));
    ({ pairs, shadow, stress, clusters })[cur](holder);
  }
  root.append(bar, holder);
  draw();
  return () => stopSpeaking();
}

function pairs(el) {
  for (const g of MINIMAL_PAIRS) {
    const quizOut = h('div', {});
    el.append(card(h('h3', { style: { marginTop: 0 } }, g.title), h('p', { class: 'small muted' }, g.note),
      h('table', {}, h('tbody', {}, g.pairs.map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, btn('🔊', () => speak(a, { rate: 0.85 }), 'small', { 'aria-label': 'Hear ' + a })), h('td', {}, b), h('td', {}, btn('🔊', () => speak(b, { rate: 0.85 }), 'small', { 'aria-label': 'Hear ' + b }))))) ),
      h('div', { class: 'row', style: { marginTop: '10px' } }, btn('Which word do you hear? (quiz)', () => quiz(g, quizOut), 'primary small')), quizOut));
  }
}

function quiz(g, out) {
  const rounds = shuffle(Array.from({ length: 8 }, (_, i) => { const p = g.pairs[i % g.pairs.length]; const pick = Math.random() < 0.5 ? 0 : 1; return { p, pick }; }));
  let i = 0, ok = 0;
  const step = () => {
    clear(out);
    if (i >= rounds.length) {
      state.pron.push({ id: 'p_' + Date.now().toString(36), kind: 'discrimination', group: g.id, date: Date.now(), correct: ok, total: rounds.length }); save();
      logActivity('Sound-pair quiz', `${g.title}: ${ok}/${rounds.length}`, ['pronunciation', 'listening']);
      out.append(h('p', {}, `Score: ${ok}/${rounds.length} `, sourceTag('auto')), h('p', { class: 'muted small' }, 'This tests whether you can hear the difference (computer voice). Hearing comes before saying.'), btn('Again', () => { i = 0; ok = 0; step(); }, 'small'));
      return;
    }
    const r = rounds[i];
    speak(r.p[r.pick], { rate: 0.85 });
    out.append(h('p', {}, `Round ${i + 1}/${rounds.length}: which word did you hear?`), h('div', { class: 'row' }, r.p.map((w, k) => btn(w, () => { if (k === r.pick) { ok++; toast('✔'); } else toast('It was "' + r.p[r.pick] + '"'); i++; step(); })), btn('🔁 Replay', () => speak(r.p[r.pick], { rate: 0.85 }), 'small')));
  };
  step();
}

function shadow(el) {
  let target = SENTENCES_TO_SHADOW[0].t;
  const sel = h('select', { 'aria-label': 'Sentence', onchange: (e) => { target = e.target.value; custom.value = ''; refSent.textContent = target; } }, SENTENCES_TO_SHADOW.map((s) => h('option', { value: s.t }, `${s.level} · ${s.t}`)));
  const custom = h('input', { placeholder: 'or type your own sentence (e.g. a sentence from your next meeting)', oninput: (e) => { if (e.target.value.trim()) { target = e.target.value.trim(); refSent.textContent = target; } } });
  const refSent = h('p', { style: { fontSize: '1.2rem' } }, target);
  const canvas = h('canvas', { width: 800, height: 70, 'aria-label': 'Waveform of your recording' });
  const out = h('div', {});
  const audio = h('audio', { controls: true, hidden: true });
  let rec = null, last = null;
  const recB = btn('🎙️ Record', async () => {
    if (!rec) {
      try { rec = await startRecorder(); recB.textContent = '⏹ Stop'; recB.classList.add('rec'); } catch { toast('Microphone permission is needed.'); }
      return;
    }
    last = await rec.stop(); rec = null; recB.textContent = '🎙️ Record again'; recB.classList.remove('rec');
    audio.src = last.url; audio.hidden = false; drawWave(canvas, last.samples);
    clear(out); out.append(sourceTag('self'), h('p', { class: 'small muted' }, 'Listen to the reference, then to your recording. Notice stress, rhythm and the sounds you find difficult. This is not a score.'));
    // Optional recognition check (rough intelligibility signal)
    if (config.azureSpeech) out.append(btn('Score with Azure (Measured)', score, 'primary small'));
  });
  async function score() {
    const b = out.querySelector('button.primary'); if (b) b.disabled = true;
    try {
      const s = await assessPronunciation(last.wav, target);
      const rows = h('table', {}, h('thead', {}, h('tr', {}, ['Word', 'Score', 'Note'].map((x) => h('th', {}, x)))), h('tbody', {}, s.words.map((w) => h('tr', {}, h('td', {}, w.word), h('td', {}, w.score != null ? Math.round(w.score) : '–'), h('td', {}, w.error && w.error !== 'None' ? w.error : (w.score != null && w.score < 60 ? 'practise this word' : ''))))));
      out.append(h('p', {}, badge('Measured (Azure)', 'ok'), ` Accuracy ${Math.round(s.accuracy)} · Fluency ${Math.round(s.fluency)} · Completeness ${Math.round(s.completeness)}${s.prosody != null ? ' · Prosody ' + Math.round(s.prosody) : ''}`), rows);
      state.pron.push({ id: 'p_' + Date.now().toString(36), kind: 'azure', date: Date.now(), ref: target, accuracy: s.accuracy, fluency: s.fluency, prosody: s.prosody ?? null, completeness: s.completeness }); save();
      const avg = (s.accuracy + s.fluency) / 2;
      awardSkill('pronunciation', avg >= 90 ? 5 : avg >= 80 ? 4 : avg >= 70 ? 3 : avg >= 55 ? 2 : 1, 0.5);
      logActivity('Pronunciation scoring', target.slice(0, 40), ['pronunciation']);
    } catch (e) { out.append(note('Scoring failed: ' + e.message)); }
  }
  el.append(card(h('h3', { style: { marginTop: 0 } }, 'Shadowing and self-comparison'), sel, custom, refSent,
    h('div', { class: 'row' }, btn('🔊 Listen (normal)', () => speak(target)), btn('🐢 Listen (slow)', () => speak(target, { rate: 0.7 })), recB), canvas, audio, out));
}

function stress(el) {
  el.append(card(h('h3', { style: { marginTop: 0 } }, 'Word stress for project English'), h('p', { class: 'small muted' }, 'Capital letters show the stressed syllable. Notice how stress changes between noun and verb forms. Say each word out loud after listening.'),
    h('table', {}, h('tbody', {}, STRESS_WORDS.map((w) => h('tr', {}, h('td', {}, w.w), h('td', {}, h('strong', {}, w.s)), h('td', {}, btn('🔊', () => speak(w.w.replace(/ \(.*\)/, '')), 'small', { 'aria-label': 'Hear ' + w.w }))))))));
  el.append(note('Browser voices sometimes ignore noun/verb stress differences. Trust the stress pattern shown in capitals over the audio for the "(noun)/(verb)" pairs.', 'info'));
}

function clusters(el) {
  const out = h('div', {});
  el.append(card(h('h3', { style: { marginTop: 0 } }, 'Consonant clusters'), h('p', { class: 'small muted' }, 'English allows up to three consonants together (s-t-r in "street"). Avoid inserting a vowel inside the cluster ("is-treet", "pi-lan"). Listen slowly, then say the word.'),
    h('div', { class: 'pill-list' }, CLUSTER_WORDS.map((w) => btn('🔊 ' + w, () => speak(w, { rate: 0.8 }), 'small'))),
    sttSupported() ? h('div', { style: { marginTop: '12px' } }, h('h3', {}, 'Say-it check'), h('p', { class: 'small muted' }, 'The browser tries to recognise the word. If it understands you, a listener probably will too. This is a rough intelligibility signal, not a pronunciation score.'), btn('Start check', () => check(), 'primary small'), out) : null));
  function check() {
    const words = shuffle(CLUSTER_WORDS).slice(0, 5); let i = 0, ok = 0;
    const next = () => {
      clear(out);
      if (i >= words.length) { out.append(h('p', {}, `Recognised ${ok}/${words.length} `, badge('AI/browser estimate', 'warn'))); logActivity('Cluster say-it check', `${ok}/${words.length}`, ['pronunciation']); return; }
      const w = words[i];
      out.append(h('p', { style: { fontSize: '1.4rem' } }, w));
      let heard = '';
      const r = createRecognizer({ onInterim: (t) => { heard = t; }, onEnd: (t) => { heard = t || heard; const good = tokens(heard).includes(w); if (good) ok++; toast(good ? '✔ Recognised' : 'Heard: "' + (heard || '…') + '"'); i++; next(); }, onError: () => {} });
      const b = btn('🎙️ Say it', () => { try { r.start(); b.disabled = true; setTimeout(() => { try { r.stop(); } catch {} }, 2500); } catch {} }, 'primary');
      out.append(b);
    };
    next();
  }
}
