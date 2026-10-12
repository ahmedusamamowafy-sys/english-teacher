import { h, clear, card, btn, note, badge, toast, fmtDate } from '../ui.js';
import { state, save } from '../store.js';
import { SCENARIOS } from '../content/scenarios.js';
import { TOPICS, CATEGORIES, MODES, pickTopic, topicById } from '../content/topics.js';
import { config, conversationTurn, voiceTurn, getHint, ask } from '../ai.js';
import { speak, stopSpeaking, sttSupported, createRecognizer } from '../speech.js';
import { offlineCheck } from '../offline.js';
import { correctionView, pronView, pushToTalk } from './shared.js';
import { applyTurn, finishConversation } from '../convo.js';
import { logNewExpression } from '../session.js';

const FOLLOW_UPS = ['That is interesting. Can you tell me more?', 'Why do you think so?', 'Can you give me an example?', 'How did that make you feel?', 'What happened next?', 'What would you do differently next time?', 'Who else was involved?', 'What do most people in your country think about that?'];

// Role-play scenarios become topics too.
export const SCENE_TOPICS = SCENARIOS.map((s) => ({ id: 'scene:' + s.id, cat: 'scenes', title: s.title, opener: s.opener, mode: 'roleplay', role: s.aiRole, goal: s.goal }));
export const ALL_TOPICS = [...TOPICS, ...SCENE_TOPICS];
export const ALL_CATS = [...CATEGORIES, ['scenes', '🎭 Work role-plays']];
export const findTopic = (id) => topicById(id) || SCENE_TOPICS.find((t) => t.id === id);

export function render(root) {
  let cleanup = [];
  root.append(h('h1', {}, 'Talk with your teacher'), h('p', { class: 'muted' }, `${ALL_TOPICS.length} topics, 7 ways to practise. Speak or type; your teacher replies, keeps the conversation going, and tracks your mistakes and your accent.`));
  const area = h('div', {});
  root.append(area);
  hub();

  function hub() {
    stopSpeaking();
    clear(area);
    // Hands-free hero
    area.append(h('section', { class: 'card hero' }, h('h2', { style: { marginTop: 0 } }, '🚗 Hands-free conversation'), h('p', {}, 'Talk naturally with no buttons, like a phone call. It listens, waits for you to finish, replies out loud, and coaches your pronunciation.'),
      btn('Start hands-free', () => { location.hash = '#/voice'; })));
    if (!config.aiReady) area.append(note('The AI teacher is not connected yet, so conversations use simple scripted questions. Add your free Gemini key in Settings (2 minutes) for real conversations and accent feedback.'), btn('Open Settings', () => { location.hash = '#/settings'; }, 'small'));

    // Activity (mode) chooser
    let mode = 'auto';
    const modeChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Activity' });
    const drawModes = () => { clear(modeChips); modeChips.append(chip('✨ Best for topic', mode === 'auto', () => { mode = 'auto'; drawModes(); })); for (const [k, l] of MODES) modeChips.append(chip(l, mode === k, () => { mode = k; drawModes(); })); };
    drawModes();

    // Free topic
    const custom = h('input', { placeholder: 'Or type any topic, e.g. "my trip to Jeddah" or "how to manage stress"', 'aria-label': 'Your own topic' });
    const startCustom = () => { const t = custom.value.trim(); if (!t) { toast('Type a topic first.'); return; } start({ id: '', cat: 'custom', title: t, opener: `Let's talk about ${t}. What would you like to tell me about it first?`, mode: 'chat' }, mode); };
    area.append(card(h('h3', { style: { marginTop: 0 } }, 'How do you want to practise?'), modeChips,
      h('div', { class: 'row', style: { marginTop: '6px' } }, btn('🎲 Surprise me', () => start(pickTopic(state.topicsDone, null), mode), 'primary'), h('div', { style: { flex: 1, minWidth: '220px' } }, custom), btn('Start', startCustom))));

    // Category + search + grid
    let cat = null;
    const search = h('input', { type: 'search', placeholder: 'Search topics…', 'aria-label': 'Search topics' });
    const catChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Category' });
    const grid = h('div', { class: 'grid' });
    const drawCats = () => { clear(catChips); catChips.append(chip('All', !cat, () => { cat = null; drawCats(); drawGrid(); })); for (const [k, l] of ALL_CATS) catChips.append(chip(l, cat === k, () => { cat = k; drawCats(); drawGrid(); })); };
    const drawGrid = () => {
      clear(grid);
      const q = search.value.trim().toLowerCase();
      const list = ALL_TOPICS.filter((t) => (!cat || t.cat === cat) && (!q || (t.title + ' ' + t.opener).toLowerCase().includes(q)));
      for (const t of list.slice(0, 60)) {
        const done = state.topicsDone[t.id] || 0;
        grid.append(h('section', { class: 'card topic' }, h('h3', {}, t.title), h('p', { class: 'opener' }, t.opener),
          h('div', { class: 'row between' }, h('div', { class: 'row' }, badge((MODES.find((m) => m[0] === t.mode) || ['', ''])[1]), done ? badge('✓ ' + done, 'ok') : null),
            h('div', { class: 'row' }, btn('🚗', () => { location.hash = '#/voice?topic=' + encodeURIComponent(t.id) + (mode !== 'auto' ? '&mode=' + mode : ''); }, 'small', { 'aria-label': 'Start hands-free: ' + t.title, title: 'Hands-free' }), btn('Start', () => start(t, mode), 'primary small')))));
      }
      if (!list.length) grid.append(h('p', { class: 'muted' }, 'No topic matches. Type it in the box above to talk about it anyway.'));
      if (list.length > 60) grid.append(h('p', { class: 'muted small' }, `Showing 60 of ${list.length}. Pick a category or search to narrow down.`));
    };
    search.addEventListener('input', drawGrid);
    drawCats(); drawGrid();
    area.append(h('h2', {}, 'Topics'), search, catChips, grid);

    // Recent conversations
    const recent = state.convos.slice(-5).reverse();
    if (recent.length) area.append(h('h2', {}, 'Recent conversations'), card(recent.map((c) => h('div', { style: { margin: '6px 0' } }, h('strong', {}, c.scenario), ' ', h('span', { class: 'muted small' }, fmtDate(c.date) + (c.voice ? ' · hands-free' : '')), c.summary ? h('div', { class: 'small muted' }, c.summary) : null))));
  }

  function chip(label, pressed, onclick) { return h('button', { class: 'chip', type: 'button', 'aria-pressed': String(pressed), onclick }, label); }

  function start(topic, chosenMode) {
    const mode = chosenMode && chosenMode !== 'auto' ? chosenMode : topic.mode || 'chat';
    clear(area); window.scrollTo(0, 0);
    const s = state.profile.settings;
    const correction = s.correctionMode;
    const turns = [];
    const pending = [];
    const pronAll = [];
    let speakReplies = true, busy = false, turnCount = 0, challenge = null, challengesDone = 0;
    const chat = h('div', { class: 'chat', 'aria-live': 'polite' });
    const feedback = h('div', {});
    const challengeBox = h('div', { class: 'challenge', hidden: true });
    const stats = h('div', { class: 'statline' });
    const ta = h('textarea', { rows: 2, placeholder: config.audio ? 'Type, or press Record to speak (includes accent feedback)…' : 'Type your answer, or use the microphone…', 'aria-label': 'Your message' });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } });
    const sendB = btn('Send', () => sendText(), 'primary');

    // Microphone: Gemini audio (with accent feedback) or browser speech recognition.
    let micEl;
    if (config.audio) {
      micEl = pushToTalk({ onAudio: ({ base64 }) => sendAudio(base64), onError: (m) => toast(m) });
    } else if (sttSupported()) {
      let rec = null, on = false;
      micEl = btn('🎙️ Speak', () => {
        if (on) { rec.stop(); return; }
        rec = createRecognizer({ onInterim: (t) => { ta.value = t; }, onEnd: (t) => { on = false; micEl.textContent = '🎙️ Speak'; micEl.classList.remove('rec'); if (t) { ta.value = t; sendText(); } }, onError: (e) => { if (e === 'not-allowed') toast('Microphone permission was denied.'); } });
        try { stopSpeaking(); rec.start(); on = true; micEl.textContent = '⏹ Stop'; micEl.classList.add('rec'); } catch {}
      });
    }
    cleanup.push(() => micEl && micEl.cancel && micEl.cancel());

    const tts = h('input', { type: 'checkbox', checked: true, id: 'tts', style: { width: 'auto' }, onchange: (e) => { speakReplies = e.target.checked; if (!speakReplies) stopSpeaking(); } });
    const lastAi = () => [...turns].reverse().find((t) => t.role === 'ai');

    function addMsg(role, text) {
      const actions = role === 'ai' ? h('div', { class: 'row', style: { marginTop: '4px' } }, btn('🔊', () => speak(text), 'small', { 'aria-label': 'Listen again' }),
        config.aiReady && s.arabicSupport !== 'off' ? btn('ع', async (e) => { e.target.disabled = true; try { const t = await ask({ system: 'Translate into simple Modern Standard Arabic. Output only the translation.', messages: [{ role: 'user', content: text }], maxTokens: 400 }); e.target.replaceWith(h('div', { class: 'ar small', dir: 'rtl' }, t)); } catch (err) { toast(err.message); e.target.disabled = false; } }, 'small', { 'aria-label': 'Translate to Arabic', title: 'Arabic' }) : null) : null;
      chat.append(h('div', { class: 'msg ' + role }, text, actions));
      chat.scrollTop = chat.scrollHeight;
      turns.push({ role, text });
      drawStats();
    }
    function drawStats() {
      clear(stats);
      const mine = turns.filter((t) => t.role === 'me');
      const w = mine.map((t) => (t.text.match(/[A-Za-z']+/g) || []).length);
      stats.append(h('span', {}, `💬 ${mine.length} turns`), h('span', {}, `📏 avg ${w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : 0} words`), h('span', {}, `🏆 longest ${w.length ? Math.max(...w) : 0}`), h('span', {}, `🎯 ${challengesDone} challenges`));
    }
    function setChallenge(c) {
      challenge = c;
      challengeBox.hidden = !c;
      clear(challengeBox);
      if (c) { challengeBox.append('🎯 Challenge: use ', h('strong', {}, '"' + c.expression + '"'), c.meaning ? ` (${c.meaning})` : '', ' in your next answers.'); logNewExpression(c.expression); }
    }

    area.append(card(h('div', { class: 'row between' }, h('div', {}, h('h2', { style: { margin: 0 } }, topic.title), h('div', { class: 'muted small' }, (MODES.find((m) => m[0] === mode) || ['', mode])[1] + ' · corrections: ' + correction)), btn('← Topics', () => { end(true); })), stats, challengeBox, chat),
      card(ta, h('div', { class: 'row', style: { marginTop: '8px' } }, micEl, sendB,
        config.aiReady ? btn('💡 Hint', hint, 'small') : null,
        btn('🔁 Repeat', () => { const l = lastAi(); if (l) speak(l.text); }, 'small'),
        btn('🐢 Slower', () => { const l = lastAi(); if (l) speak(l.text, { rate: 0.75 }); }, 'small'),
        btn('End & feedback', () => end(false)),
        h('label', { style: { margin: 0, fontWeight: 400 } }, tts, ' Read replies aloud'))),
      feedback);
    addMsg('ai', topic.opener);
    if (speakReplies) speak(topic.opener);

    async function hint() {
      try { const r = await getHint({ topic, history: turns }); clear(feedback); feedback.append(card(h('h3', { style: { marginTop: 0 } }, '💡 Ideas'), h('ul', {}, (r.ideas || []).map((x) => h('li', {}, x))), h('p', { class: 'small' }, h('strong', {}, 'Start with: '), (r.phrases || []).join(' · ')))); }
      catch (e) { toast(e.message); }
    }

    async function sendText() {
      const text = ta.value.trim();
      if (!text || busy) return;
      ta.value = ''; stopSpeaking();
      addMsg('me', text); turnCount++;
      await runTurn(() => conversationTurn({ topic, mode, history: turns, correction, challenge: challenge && challenge.expression, replyLength: s.replyLength }), text);
    }

    async function sendAudio(base64) {
      if (busy) return;
      stopSpeaking();
      const placeholder = h('div', { class: 'msg me muted' }, '🎙️ …');
      chat.append(placeholder); chat.scrollTop = chat.scrollHeight;
      await runTurn(async () => {
        const r = await voiceTurn({ topic, mode, history: turns, audioBase64: base64, correction, accentLevel: s.accentCoach, challenge: challenge && challenge.expression, replyLength: s.replyLength });
        placeholder.remove();
        if (!r.heard) { if (r.reply) { addMsg('ai', r.reply); if (speakReplies) speak(r.reply); } r._skip = true; return r; }
        addMsg('me', r.heard); turnCount++;
        return r;
      }, null).finally(() => placeholder.remove());
    }

    async function runTurn(fn, said) {
      busy = true; sendB.disabled = true;
      const typing = h('div', { class: 'msg ai muted' }, '…');
      chat.append(typing); chat.scrollTop = chat.scrollHeight;
      let res;
      try {
        if (config.aiReady) res = await fn();
        else { res = { ...offlineCheck(said || ''), reply: FOLLOW_UPS[(turnCount - 1) % FOLLOW_UPS.length] }; }
      } catch (e) { typing.remove(); busy = false; sendB.disabled = false; toast('AI problem: ' + e.message, 4000); return; }
      typing.remove();
      if (res._skip) { busy = false; sendB.disabled = false; return; }
      const text = said || res.heard || '';
      if (res.reply) { addMsg('ai', res.reply); if (speakReplies) speak(res.reply); }
      const logged = config.aiReady ? applyTurn(res, text, { voice: !!res.heard }) : [];
      if (res.usedChallenge && challenge) { challengesDone++; toast('🎯 Challenge complete! Nice use of "' + challenge.expression + '"'); state.profile.challengesDone = (state.profile.challengesDone || 0) + 1; save(); setChallenge(null); drawStats(); }
      if (res.challenge && (!challenge || res.usedChallenge)) setChallenge(res.challenge);
      showFeedback(text, res, logged);
      busy = false; sendB.disabled = false;
    }

    function showFeedback(text, res, logged) {
      const pr = res.pronunciation || [];
      if (pr.length) pronAll.push(...pr);
      if (correction === 'fluency') { if (res.errors && res.errors.length) pending.push({ text, res, logged }); clear(feedback); if (pr.length) feedback.append(card(pronView(pr))); return; }
      clear(feedback);
      const box = card(h('h3', { style: { marginTop: 0 } }, 'Feedback on your last answer'));
      if (res.errors && res.errors.length && res.confidence !== 'low') box.append(correctionView({ ...res, natural: correction === 'intensive' ? res.natural : '' }, text, { logErrors: false, logged }));
      else box.append(h('p', { class: 'muted small' }, '✔ No important grammar mistake.'));
      const pv = pronView(pr); if (pv) box.append(pv);
      feedback.append(box);
    }

    async function end(silent) {
      stopSpeaking(); cleanup.forEach((f) => f()); cleanup = [];
      const mine = turns.filter((t) => t.role === 'me');
      if (!mine.length) { hub(); return; }
      clear(feedback);
      const box = card(h('h2', { style: { marginTop: 0 } }, 'Conversation feedback'), h('p', { class: 'muted' }, 'Saving…'));
      feedback.append(box);
      feedback.scrollIntoView({ behavior: 'smooth' });
      const r = await finishConversation({ topic, mode, turns, extra: { challengesDone } });
      clear(box);
      box.append(h('h2', { style: { marginTop: 0 } }, 'Conversation feedback'),
        h('div', { class: 'grid' }, statBox('Turns', r.turnsCount), statBox('Avg words / turn', r.avgWords), statBox('Longest answer', r.longest + ' words'), statBox('Challenges', challengesDone)));
      if (r.summary) box.append(h('p', {}, r.summary.summary), r.summary.nextFocus ? h('p', {}, h('strong', {}, 'Next focus: '), r.summary.nextFocus) : null);
      if (pending.length) { box.append(h('h3', {}, 'Corrections from your conversation')); for (const p of pending) box.append(h('div', {}, h('p', { class: 'muted small' }, 'You said: ' + p.text), correctionView(p.res, p.text, { logErrors: false, logged: p.logged }))); }
      const pv = pronView(dedupe(pronAll), { title: 'Sounds to practise from this conversation' }); if (pv) box.append(pv);
      box.append(h('div', { class: 'row' }, btn('Another topic', hub, 'primary'), btn('🎲 Surprise me', () => start(pickTopic(state.topicsDone, null), 'auto')), topic.id ? btn('🚗 Same topic hands-free', () => { location.hash = '#/voice?topic=' + encodeURIComponent(topic.id); }) : null));
      if (silent) hub();
    }
  }

  return () => { stopSpeaking(); cleanup.forEach((f) => f()); };
}

const dedupe = (list) => { const seen = new Set(); return list.filter((p) => { const k = (p.word || '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };
const statBox = (label, value) => h('div', {}, h('div', { style: { fontSize: '1.5rem', fontWeight: 700 } }, String(value)), h('div', { class: 'muted small' }, label));
