// Shared view components.
import { h, clear, btn, card, badge, note, sourceTag, toast } from '../ui.js';
import { state, save, logError } from '../store.js';
import { SKILLS, toDetail, confidence } from '../levels.js';
import { config } from '../ai.js';
import { speak, createRecognizer, sttSupported, stopSpeaking } from '../speech.js';
import { matchScore, diffWords } from '../compare.js';
import { logCorrection, logErrorId } from '../session.js';

export function levelMeters() {
  const L = state.profile.levels;
  return h('div', {}, SKILLS.map((k) => {
    const v = L[k];
    return h('div', { class: 'meter' },
      h('span', {}, k[0].toUpperCase() + k.slice(1)),
      h('div', { class: 'bar', role: 'img', 'aria-label': `${k}: ${v.n ? toDetail(v.est) : 'not assessed'}` }, h('div', { style: { width: v.n ? Math.min(100, ((v.est - 0.5) / 5.5) * 100) + '%' : '0%' } })),
      h('span', {}, v.n ? `${toDetail(v.est)} · ${confidence(v.n)}` : '–'));
  }));
}

// Speech input: microphone transcription + editable textarea. Returns {el, getText, setText}.
export function speechInput({ placeholder = 'Press Record and speak, or type here…', onStop, rows = 4 } = {}) {
  const ta = h('textarea', { placeholder, rows, 'aria-label': 'Your text' });
  let rec = null, recording = false;
  const status = h('span', { class: 'muted small' });
  const startedAtRef = { t: 0 };
  const b = btn('🎙️ Record', toggle, '');
  function toggle() {
    if (!sttSupported()) { toast('Speech recognition is not supported in this browser. Use Chrome or Edge, or type your answer.'); return; }
    if (recording) { rec.stop(); return; }
    rec = createRecognizer({
      onInterim: (t) => { ta.value = t; },
      onEnd: (finalText) => {
        recording = false; b.textContent = '🎙️ Record'; b.classList.remove('rec'); status.textContent = '';
        if (finalText) ta.value = finalText;
        const secs = (Date.now() - startedAtRef.t) / 1000;
        onStop && onStop(ta.value.trim(), secs);
      },
      onError: (e) => { status.textContent = e === 'not-allowed' ? 'Microphone permission was denied.' : e === 'no-speech' ? 'No speech detected.' : 'Speech error: ' + e; },
    });
    try { startedAtRef.t = Date.now(); rec.start(); recording = true; b.textContent = '⏹ Stop'; b.classList.add('rec'); status.textContent = 'Listening… speak now'; stopSpeaking(); }
    catch (e) { status.textContent = 'Could not start recording.'; }
  }
  const el = h('div', {}, ta, h('div', { class: 'row', style: { marginTop: '8px' } }, b, status));
  return { el, getText: () => ta.value.trim(), setText: (t) => { ta.value = t; }, ta, stop: () => { try { rec && recording && rec.abort(); } catch {} } };
}

export function playBtn(text, label = '🔊 Listen', opts = {}) {
  return btn(label, () => speak(text, opts), 'small');
}

// Render original text with the wrong fragments struck through (best-effort).
function markedOriginal(original, errors) {
  const parts = []; let rest = original;
  for (const e of errors || []) {
    const i = e.wrong ? rest.toLowerCase().indexOf(String(e.wrong).toLowerCase()) : -1;
    if (i < 0) continue;
    parts.push(rest.slice(0, i), h('span', { class: 'del' }, rest.slice(i, i + e.wrong.length)));
    rest = rest.slice(i + e.wrong.length);
  }
  parts.push(rest);
  return h('p', {}, parts);
}

// Show a correction result (from AI or offline). Logs errors into the error database once.
export function correctionView(res, original, { allowRepeat = true, source = 'ai', logErrors = true, logged: preLogged = null } = {}) {
  const wrap = h('div', {});
  wrap.append(h('div', { class: 'row' }, sourceTag(res.offline ? 'rule' : 'ai'), res.confidence ? badge('confidence: ' + res.confidence, res.confidence === 'low' ? 'warn' : '') : null));
  wrap.append(markedOriginal(original, res.errors));
  if (!res.hasErrors) wrap.append(h('p', { class: 'good' }, '✔ No important mistakes found.'));
  const logged = preLogged ? [...preLogged] : [];
  for (const e of res.errors || []) {
    if (logErrors) { const rec = logError(e); logged.push(rec); logErrorId(rec.id); logCorrection({ wrong: e.wrong, right: e.right, why: e.why, category: e.category }); }
    wrap.append(h('div', { class: 'corr' },
      h('div', {}, h('span', { class: 'del' }, e.wrong), ' → ', h('span', { class: 'ins' }, e.right), ' ', badge(e.category)),
      h('div', { class: 'small' }, e.why),
      e.whyArabic ? h('div', { class: 'small ar', dir: 'rtl' }, e.whyArabic) : null));
  }
  if (logErrors && logged.length) save();
  if (res.corrected && res.hasErrors) wrap.append(h('p', {}, h('strong', {}, 'Corrected: '), res.corrected));
  if (res.natural && res.natural !== res.corrected) wrap.append(h('p', {}, h('strong', {}, 'More natural: '), res.natural));
  if (res.comment) wrap.append(h('p', { class: 'muted small' }, res.comment));
  const target = res.natural || res.corrected || original;
  if (res.hasErrors || res.natural) {
    const row = h('div', { class: 'row' }, playBtn(target, '🔊 Hear it'));
    if (allowRepeat && sttSupported()) {
      const out = h('div', { class: 'small' });
      const inp = speechInput({ rows: 2, placeholder: 'Now say it yourself…', onStop: (t) => check(t) });
      function check(t) {
        clear(out);
        if (!t) return;
        const score = matchScore(t, target);
        out.append(h('div', {}, `Match with the target: ${Math.round(score * 100)}% `, sourceTag('auto'), ' '), h('div', {}, diffWords(t, target).map((o) => h('span', { class: o.type === 'missing' ? 'bad' : o.type === 'extra' ? 'del' : '' }, o.w + ' '))));
        if (score >= 0.85) {
          for (const r of logged) { r.correctUses = (r.correctUses || 0) + 1; if (r.correctUses >= 3) r.status = 'improving'; }
          save(); out.append(h('div', { class: 'good' }, '✔ Well done.'));
        } else out.append(h('div', { class: 'muted' }, 'Listen again and try once more. Words in red are missing.'));
      }
      wrap.append(row, h('details', {}, h('summary', {}, 'Repeat it (speaking practice)'), inp.el, out));
    } else wrap.append(row);
  }
  return wrap;
}

export function aiNeededNote() {
  return note('The AI teacher is not connected. Add your free Gemini key in Settings to turn on full feedback. Offline checks and auto-scored practice still work.', '');
}
export const aiReady = () => config.aiReady;

// ---------- pronunciation feedback (AI listening to your audio) ----------
import { checkRepeat } from '../ai.js';
import { startRecorder } from '../speech.js';
import { blobToBase64 } from '../voice.js';

export function pushToTalk({ label = '🎙️ Hold to talk', onAudio, onError }) {
  let rec = null, busy = false;
  const b = btn('🎙️ Record', toggle, 'primary', { 'aria-label': 'Record your voice' });
  async function toggle() {
    if (busy) return;
    if (!rec) {
      try { stopSpeaking(); rec = await startRecorder(); b.textContent = '⏹ Stop'; b.classList.add('rec'); }
      catch (e) { onError && onError(e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in the browser settings.' : 'Could not start the microphone.'); }
      return;
    }
    busy = true; b.disabled = true; b.textContent = '…'; b.classList.remove('rec');
    try { const r = await rec.stop(); rec = null; await onAudio({ wav: r.wav, base64: await blobToBase64(r.wav), samples: r.samples }); }
    finally { busy = false; b.disabled = false; b.textContent = '🎙️ Record'; }
  }
  b.cancel = async () => { if (rec) { try { await rec.stop(); } catch {} rec = null; } };
  return b;
}

export function pronView(items, { title = 'Pronunciation' } = {}) {
  if (!items || !items.length) return null;
  const box = h('div', { class: 'pron-box' }, h('div', { class: 'row' }, h('strong', {}, '🗣️ ' + title + ' '), sourceTag('ai')));
  for (const p of items) {
    const out = h('div', { class: 'small' });
    const tryBtn = config.audio ? pushToTalk({ onAudio: async ({ base64 }) => {
      clear(out); out.append('Checking…');
      try { const r = await checkRepeat({ target: p.word, audioBase64: base64 }); clear(out); out.append(h('span', { class: r.ok ? 'good' : 'bad' }, (r.ok ? '✔ ' : '↻ ') + r.feedback)); }
      catch (e) { clear(out); out.append(h('span', { class: 'bad' }, e.message)); }
    }, onError: (m) => toast(m) }) : null;
    if (tryBtn) tryBtn.textContent = '🎙️ Try';
    box.append(h('div', { class: 'pron-item' },
      h('div', {}, h('strong', {}, p.word), p.say ? h('span', {}, '  →  say ', h('span', { class: 'say' }, p.say)) : null, p.heardAs ? h('span', { class: 'muted small' }, `  (sounded like "${p.heardAs}")`) : null),
      p.tip ? h('div', { class: 'small' }, p.tip) : null,
      h('div', { class: 'row' }, btn('🔊 Hear', () => speak(p.word, { rate: 0.75 }), 'small'), tryBtn, out)));
  }
  return box;
}
