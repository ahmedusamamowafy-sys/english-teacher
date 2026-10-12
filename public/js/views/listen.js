import { h, clear, card, btn, note, badge, mcqRunner, toast, sourceTag } from '../ui.js';
import { state, save } from '../store.js';
import { DIALOGUES, DICTATION } from '../content/media.js';
import { speak, stopSpeaking } from '../speech.js';
import { diffWords, matchScore } from '../compare.js';
import { logActivity, awardSkill } from '../session.js';

const LEVEL_NUM = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
let token = 0;

async function playLines(lines, rate, onLine) {
  const my = ++token;
  for (let i = 0; i < lines.length; i++) {
    if (my !== token) return;
    onLine && onLine(i);
    await speak(lines[i].t, { lang: lines[i].a, rate });
    if (my !== token) return;
    await new Promise((r) => setTimeout(r, 350));
  }
  onLine && onLine(-1);
}

export function render(root) {
  root.append(h('h1', {}, 'Listening'), h('p', { class: 'muted' }, 'Different accents, adjustable speed, dictation. Try to understand before revealing the transcript.'));
  root.append(note('Voices come from your browser or device (or Azure when configured). Accents depend on the voices installed; if you hear the same voice for every accent, install more voices in your system settings.', 'info'));
  const tabs = [['dialogues', 'Dialogues'], ['dictation', 'Dictation']];
  let cur = 'dialogues';
  const bar = h('div', { class: 'tabs' }), holder = h('div', {});
  const draw = () => {
    token++; stopSpeaking(); clear(bar); clear(holder);
    for (const [k, l] of tabs) bar.append(h('button', { class: 'btn', type: 'button', 'aria-pressed': String(cur === k), onclick: () => { cur = k; draw(); } }, l));
    (cur === 'dialogues' ? dialogues : dictation)(holder);
  };
  root.append(bar, holder); draw();
  return () => { token++; stopSpeaking(); };
}

function dialogues(el) {
  const list = h('div', { class: 'grid' });
  const stage = h('div', {});
  el.append(list, stage);
  for (const d of DIALOGUES) list.append(card(h('h3', { style: { marginTop: 0 } }, d.title), h('div', { class: 'row' }, badge(d.level), badge([...new Set(d.lines.map((l) => l.a.replace('en-', '')))].join('/'))), btn('Open', () => open(d), 'primary small')));

  function open(d) {
    clear(stage); window.scrollTo(0, 0);
    let rate = 1, revealed = false;
    const transcript = h('div', { hidden: true });
    const speedSel = h('select', { 'aria-label': 'Speed', onchange: (e) => { rate = Number(e.target.value); } }, [[0.7, 'Slow (0.7×)'], [1, 'Normal'], [1.25, 'Fast (1.25×)'], [1.5, 'Very fast (1.5×)']].map(([v, t]) => h('option', { value: v, selected: v === 1 }, t)));
    const lineEls = d.lines.map((l, i) => h('div', { class: 'row', style: { margin: '4px 0' } }, h('strong', {}, l.s + ':'), h('span', {}, l.t), btn('🔁', () => { token++; speak(l.t, { lang: l.a, rate }); }, 'small', { 'aria-label': 'Replay line ' + (i + 1) })));
    transcript.append(...lineEls);
    const qArea = h('div', {});
    stage.append(card(h('h2', { style: { marginTop: 0 } }, d.title), h('div', { class: 'row' }, btn('▶ Play dialogue', () => playLines(d.lines, rate), 'primary'), btn('⏹ Stop', () => { token++; stopSpeaking(); }), speedSel, btn('Show transcript', (e) => { revealed = !revealed; transcript.hidden = !revealed; e.target.textContent = revealed ? 'Hide transcript' : 'Show transcript'; }, 'small')), transcript),
      card(h('h3', { style: { marginTop: 0 } }, 'Questions'), qArea));
    qArea.append(mcqRunner({ items: d.questions, label: 'Comprehension', onDone: (res) => {
      const ok = res.filter((r) => r.correct).length, lv = LEVEL_NUM[d.level] || 3;
      awardSkill('listening', ok / res.length >= 0.67 ? lv + 0.25 : lv - 0.75, 0.5);
      logActivity('Listening dialogue', `${d.title} (${ok}/${res.length})`, ['listening']);
      clear(qArea); qArea.append(h('p', {}, `Score: ${ok}/${res.length} `, sourceTag('auto')), h('p', { class: 'muted small' }, 'Now show the transcript and replay the lines you missed. Listen again at normal speed.'));
      transcript.hidden = false;
    } }));
  }
}

function dictation(el) {
  let idx = 0;
  const area = h('div', {});
  el.append(area);
  const show = () => {
    clear(area);
    const d = DICTATION[idx % DICTATION.length];
    let rate = 1;
    const inp = h('textarea', { rows: 2, placeholder: 'Type exactly what you hear…', 'aria-label': 'Dictation answer' });
    const out = h('div', {});
    const speedSel = h('select', { 'aria-label': 'Speed', onchange: (e) => { rate = Number(e.target.value); } }, [[0.7, 'Slow'], [1, 'Normal'], [1.3, 'Fast']].map(([v, t]) => h('option', { value: v, selected: v === 1 }, t)));
    area.append(card(h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, `Dictation ${idx % DICTATION.length + 1}/${DICTATION.length}`), badge(d.level)),
      h('div', { class: 'row', style: { margin: '8px 0' } }, btn('▶ Play', () => speak(d.t, { lang: d.a, rate }), 'primary'), speedSel), inp,
      h('div', { class: 'row', style: { marginTop: '8px' } }, btn('Check', () => {
        clear(out);
        const ops = diffWords(inp.value, d.t), sc = matchScore(inp.value, d.t);
        out.append(h('p', {}, `Correct words: ${Math.round(sc * 100)}% `, sourceTag('auto')), h('p', {}, ops.map((o) => h('span', { class: o.type === 'missing' ? 'bad' : o.type === 'extra' ? 'del' : '', title: o.type }, (o.type === 'missing' ? '[' + o.w + ']' : o.w) + ' '))), h('p', { class: 'small muted' }, `Answer: ${d.t}  ·  [missing words in brackets], crossed out = extra words.`));
        awardSkill('listening', (LEVEL_NUM[d.level] || 3) + (sc >= 0.9 ? 0.25 : sc >= 0.6 ? -0.25 : -1), 0.4);
        logActivity('Dictation', d.level, ['listening']);
      }, 'primary'), btn('Show answer', () => { clear(out); out.append(h('p', {}, d.t)); }, 'small'), btn('Next →', () => { idx++; show(); }, 'small')), out));
  };
  show();
}
