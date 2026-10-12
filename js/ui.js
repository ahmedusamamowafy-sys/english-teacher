// Tiny DOM helpers. Everything is built with textContent so AI output can never inject HTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dir') el.setAttribute('dir', v);
    else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export const shuffle = (arr, rnd = Math.random) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function badge(text, kind = '') { return h('span', { class: 'badge ' + kind }, text); }
export function card(...children) { return h('section', { class: 'card' }, ...children); }
export function btn(label, onclick, kind = '', props = {}) { return h('button', { class: 'btn ' + kind, onclick, type: 'button', ...props }, label); }
export function note(text, kind = '') { return h('p', { class: 'note ' + kind }, text); }

// Label so users can tell how a result was produced (research doc: honest labelling).
export function sourceTag(kind) {
  const map = { measured: ['Measured', 'ok'], ai: ['AI estimate', 'warn'], self: ['Self-comparison (not scored)', ''], rule: ['Offline rule check', ''], auto: ['Auto-scored', 'ok'] };
  const [t, k] = map[kind] || [kind, ''];
  return badge(t, k);
}

// Multiple-choice runner. items: [{q, options, answer, explain, level, cat}]
// onDone(results) with results [{item, chosen, correct, ms}]
export function mcqRunner({ items, onAnswer, onDone, showExplain = true, timerSec = 0, label = '' }) {
  const root = h('div', { class: 'mcq' });
  const results = [];
  let i = 0, startedAt = 0, tick = null;
  const prepared = items.map((it) => {
    const order = shuffle(it.options.map((_, idx) => idx));
    return { it, order };
  });
  function finish() { clearInterval(tick); onDone && onDone(results); }
  function show() {
    clearInterval(tick); clear(root);
    if (i >= prepared.length) return finish();
    const { it, order } = prepared[i];
    startedAt = Date.now();
    const head = h('div', { class: 'row between' }, h('span', { class: 'muted' }, `${label}${label ? ' · ' : ''}Question ${i + 1} of ${prepared.length}`), timerSec ? h('span', { class: 'badge', id: 'timer' }, timerSec + 's') : null);
    const bar = h('div', { class: 'progress' }, h('div', { style: { width: (i / prepared.length) * 100 + '%' } }));
    const qEl = h('h3', { class: 'q' }, it.q);
    const feedback = h('div', { class: 'feedback' });
    const nextBtn = btn(i === prepared.length - 1 ? 'Finish' : 'Next', () => { i++; show(); }, 'primary', { hidden: true });
    let answered = false;
    const buttons = order.map((origIdx) => h('button', { class: 'option', type: 'button', onclick: () => answer(origIdx, false) }, it.options[origIdx]));
    function answer(origIdx, timedOut) {
      if (answered) return; answered = true; clearInterval(tick);
      const correct = !timedOut && origIdx === it.answer;
      const r = { item: it, chosen: timedOut ? null : origIdx, correct, ms: Date.now() - startedAt };
      results.push(r);
      buttons.forEach((b, k) => { b.disabled = true; if (order[k] === it.answer) b.classList.add('correct'); else if (order[k] === origIdx) b.classList.add('wrong'); });
      clear(feedback);
      feedback.append(h('strong', { class: correct ? 'good' : 'bad' }, timedOut ? 'Time is up.' : correct ? 'Correct.' : 'Not quite.'));
      if (showExplain && it.explain) feedback.append(' ', it.explain);
      nextBtn.hidden = false; nextBtn.focus();
      onAnswer && onAnswer(r);
    }
    root.append(head, bar, qEl, h('div', { class: 'options' }, buttons), feedback, nextBtn);
    if (timerSec) {
      let left = timerSec;
      tick = setInterval(() => { left--; const t = root.querySelector('#timer'); if (t) t.textContent = left + 's'; if (left <= 0) answer(-1, true); }, 1000);
    }
  }
  show();
  return root;
}

export function fmtDate(ms) { return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
export function pct(x) { return x == null ? '–' : Math.round(x * 100) + '%'; }
