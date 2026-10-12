// Hands-free "car mode": continuous voice conversation with spoken corrections and accent coaching.
import { h, clear, card, btn, note, badge, toast } from '../ui.js';
import { state, save } from '../store.js';
import { config, voiceTurn, conversationTurn, checkRepeat } from '../ai.js';
import { speak, stopSpeaking } from '../speech.js';
import { createVoiceLoop, createSpeechRecLoop, PAUSES, sentences } from '../voice.js';
import { CATEGORIES, MODES, pickTopic } from '../content/topics.js';
import { ALL_TOPICS, findTopic } from './talk.js';
import { applyTurn, finishConversation } from '../convo.js';
import { pronView, correctionView } from './shared.js';

const STATES = {
  idle: ['Ready', '#8a94a6'], listening: ['Listening… speak when ready', '#1f9d55'], hearing: ['Hearing you…', '#1f4fd8'],
  processing: ['Thinking…', '#c98a00'], speaking: ['Teacher speaking', '#7b3fd8'], paused: ['Paused', '#8a94a6'], repeat: ['Your turn: repeat the word', '#d8472f'],
};

// Build what the teacher says after a turn: short corrections first, then the conversational reply (which ends with a question).
export function composeSpeech(res, { voiceCorrection = 'balanced', accentCoach = 'gentle' } = {}) {
  const parts = [];
  const errs = voiceCorrection === 'off' || res.confidence === 'low' ? [] : (res.errors || []).slice(0, voiceCorrection === 'intensive' ? 2 : 1);
  errs.forEach((e, i) => {
    parts.push({ text: `${i === 0 ? 'Quick tip' : 'Also'}: say "${e.right}", not "${e.wrong}".` });
    if (voiceCorrection === 'intensive' && e.why) parts.push({ text: e.why });
  });
  const pr = accentCoach === 'off' ? [] : (res.pronunciation || []).slice(0, accentCoach === 'strict' ? 2 : 1);
  for (const p of pr) {
    parts.push({ text: `Pronunciation: the word ${p.word}.` });
    if (p.tip) parts.push({ text: p.tip });
    parts.push({ text: p.word, rate: 0.7, model: true });
  }
  if (res.reply) parts.push({ text: res.reply, reply: true });
  return { parts, pronToRepeat: accentCoach === 'strict' ? pr[0] || null : null };
}

export function render(root) {
  const q = new URLSearchParams((location.hash.split('?')[1]) || '');
  const s = state.profile.settings;
  let topic = (q.get('topic') && findTopic(q.get('topic'))) || null;
  let mode = q.get('mode') || null;
  let loop = null, stopped = true, rate = s.ttsRate || 1;
  const turns = [];
  const review = [];  // {said, res}
  let lastSpoken = [], lastRes = null, pausedByUser = false;

  root.append(h('h1', {}, '🚗 Hands-free conversation'));
  const area = h('div', {});
  root.append(area);
  setup();

  function setup() {
    clear(area);
    if (!config.aiReady) {
      area.append(card(h('h2', { style: { marginTop: 0 } }, 'Connect the free AI first'), h('p', {}, 'Hands-free conversation needs the AI teacher. Add your free Gemini key in Settings. It takes about 2 minutes, and the Gemini key also lets the teacher listen to your accent.'), btn('Open Settings', () => { location.hash = '#/settings'; }, 'primary')));
      return;
    }
    if (!config.audio) area.append(note('Your AI provider cannot listen to audio, so this mode uses your browser\'s speech recognition and gives grammar feedback only. Use a Gemini key for pronunciation coaching.', 'info'));
    const topicSel = h('select', { 'aria-label': 'Topic' }, [h('option', { value: '' }, '🎲 Surprise me (a new topic each time)'), ...CATEGORIES.map(([k, l]) => h('optgroup', { label: l }, ALL_TOPICS.filter((t) => t.cat === k).map((t) => h('option', { value: t.id, selected: topic && topic.id === t.id }, t.title)))), h('optgroup', { label: '🎭 Work role-plays' }, ALL_TOPICS.filter((t) => t.cat === 'scenes').map((t) => h('option', { value: t.id, selected: topic && topic.id === t.id }, t.title)))]);
    const modeSel = h('select', { 'aria-label': 'Activity' }, [h('option', { value: '' }, '✨ Best for the topic'), ...MODES.map(([k, l]) => h('option', { value: k, selected: mode === k }, l))]);
    const set = (key, opts) => h('select', { 'aria-label': key, onchange: (e) => { s[key] = e.target.value; save(); } }, opts.map(([v, t]) => h('option', { value: v, selected: s[key] === v }, t)));
    area.append(card(
      h('label', {}, 'Topic'), topicSel, h('label', {}, 'Activity'), modeSel,
      h('div', { class: 'grid', style: { marginTop: '4px' } },
        h('div', {}, h('label', {}, 'Accent coaching'), set('accentCoach', [['off', 'Off'], ['gentle', 'Gentle: 1 sound per turn'], ['strict', 'Strict: up to 2 sounds, and you repeat']])),
        h('div', {}, h('label', {}, 'Grammar corrections'), set('voiceCorrection', [['off', 'Off (just talk)'], ['balanced', 'Important only'], ['intensive', 'More, with reasons']])),
        h('div', {}, h('label', {}, 'Wait after I stop talking'), set('pauseLength', [['short', 'Short (0.9 s)'], ['normal', 'Normal (1.5 s)'], ['long', 'Long (2.3 s): I pause a lot']])),
        h('div', {}, h('label', {}, 'Teacher\'s answers'), set('replyLength', [['short', 'Short'], ['normal', 'Normal']]))),
      note('Safety first: set this up before you start driving. After you press Start, everything works by voice, and you never need to look at or touch the screen. Say "repeat", "slower", "new topic" or "stop". If traffic needs your attention, just stay silent: the teacher waits.', ''),
      btn('▶ Start talking', () => {
        topic = topicSel.value ? findTopic(topicSel.value) : pickTopic(state.topicsDone, null);
        mode = modeSel.value || topic.mode || 'chat';
        if (mode === 'roleplay' && !topic.role) mode = 'chat';
        run();
      }, 'primary', { style: { fontSize: '1.2rem', padding: '14px 28px', marginTop: '10px' } })));
  }

  // ---------- running screen ----------
  let orb, statusEl, heardEl, replyEl, topicEl, levelBar, pauseBtn;
  function drawRunning() {
    clear(area);
    orb = h('div', { class: 'orb', role: 'img', 'aria-label': 'status' });
    statusEl = h('div', { class: 'orb-status', 'aria-live': 'polite' });
    levelBar = h('div', { class: 'lvl' }, h('div', {}));
    topicEl = h('div', { class: 'muted' });
    heardEl = h('div', { class: 'heard' });
    replyEl = h('div', { class: 'reply' });
    pauseBtn = btn('⏸ Pause', togglePause, 'big');
    area.append(h('section', { class: 'card car' }, topicEl, orb, statusEl, levelBar, h('div', { class: 'car-label' }, 'You said'), heardEl, h('div', { class: 'car-label' }, 'Teacher'), replyEl,
      h('div', { class: 'car-buttons' }, pauseBtn, btn('🔁 Repeat', () => sayParts(lastSpoken).then(listen), 'big'), btn('🎲 New topic', newTopic, 'big'), btn('⏹ End', end, 'big danger'))));
    topicEl.textContent = '🗣️ ' + topic.title;
  }
  function setStatus(st) {
    const [label, color] = STATES[st] || STATES.idle;
    if (statusEl) statusEl.textContent = label;
    if (orb) { orb.style.background = color; orb.dataset.state = st; }
  }

  async function run() {
    stopped = false;
    drawRunning();
    const pauseMs = PAUSES[s.pauseLength] || PAUSES.normal;
    try {
      if (config.audio) {
        loop = createVoiceLoop({ pauseMs, onState: setStatus, onLevel: (l) => { if (levelBar) levelBar.firstChild.style.width = Math.min(100, l * 900) + '%'; }, onUtterance: ({ base64 }) => handleAudio(base64) });
      } else {
        loop = createSpeechRecLoop({ onState: setStatus, onText: (t) => handleText(t), lang: s.accent || 'en-US' });
        if (!loop) { toast('Speech recognition is not available in this browser. Use Chrome, or add a Gemini key.'); setup(); return; }
      }
      await loop.start();
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? 'Microphone permission is needed. Allow it in your browser settings and try again.' : 'Could not start the microphone: ' + e.message, 5000);
      stopped = true; setup(); return;
    }
    const greet = `Okay ${state.profile.name}, let's talk. ${topic.opener}`;
    turns.push({ role: 'ai', text: topic.opener });
    replyEl.textContent = topic.opener;
    await sayParts([{ text: greet, reply: true }]);
    listen();
  }

  function listen() { if (!stopped && !pausedByUser && loop) loop.resume(); }

  async function sayParts(parts) {
    if (!parts || !parts.length) return;
    lastSpoken = parts;
    setStatus('speaking');
    for (const p of parts) {
      for (const sen of sentences(p.text)) {
        if (stopped) return;
        await speak(sen, { rate: (p.rate || 1) * rate });
      }
    }
  }

  async function handleAudio(base64) {
    let res;
    try {
      res = await voiceTurn({ topic, mode, history: turns, audioBase64: base64, correction: s.voiceCorrection === 'off' ? 'fluency' : s.voiceCorrection, accentLevel: s.accentCoach, replyLength: s.replyLength });
    } catch (e) { return failSoft(e); }
    if (stopped) return;
    if (!res.heard) { await sayParts([{ text: res.reply || 'Sorry, I didn\'t catch that. Could you say it again?' }]); return listen(); }
    heardEl.textContent = res.heard;
    if (await handleCommand(res.command)) return;
    turns.push({ role: 'me', text: res.heard });
    await afterTurn(res.heard, res);
  }

  async function handleText(text) {
    heardEl.textContent = text;
    const cmd = localCommand(text);
    if (cmd && await handleCommand(cmd)) return;
    turns.push({ role: 'me', text });
    let res;
    try { res = await conversationTurn({ topic, mode, history: turns, correction: s.voiceCorrection === 'off' ? 'fluency' : s.voiceCorrection, replyLength: s.replyLength }); }
    catch (e) { return failSoft(e); }
    await afterTurn(text, res);
  }

  async function afterTurn(said, res) {
    lastRes = res;
    const logged = applyTurn(res, said, { voice: true });
    review.push({ said, res, logged });
    const { parts, pronToRepeat } = composeSpeech(res, { voiceCorrection: s.voiceCorrection, accentCoach: s.accentCoach });
    const replyPart = parts.find((p) => p.reply);
    const before = parts.filter((p) => !p.reply);
    if (res.reply) turns.push({ role: 'ai', text: res.reply });
    replyEl.textContent = res.reply || '';
    await sayParts(before);
    if (pronToRepeat && config.audio && !stopped) await repeatDrill(pronToRepeat);
    if (replyPart && !stopped) await sayParts([replyPart]);
    lastSpoken = parts;
    listen();
  }

  // Strict accent mode: the learner repeats the word once and gets a verdict.
  async function repeatDrill(p) {
    await sayParts([{ text: 'Your turn. Say: ' + p.word }]);
    if (stopped) return;
    const audio = await new Promise((resolve) => {
      const timer = setTimeout(() => { loop.pause(); resolve(null); }, 9000);
      loop.listenOnce(({ base64 }) => { clearTimeout(timer); resolve(base64); });
      setStatus('repeat');
    });
    if (!audio || stopped) return;
    setStatus('processing');
    try { const r = await checkRepeat({ target: p.word, audioBase64: audio }); await sayParts([{ text: r.feedback || (r.ok ? 'Good.' : 'Not quite, but we will practise it again.') }]); }
    catch {}
  }

  function localCommand(t) {
    const x = t.toLowerCase().trim().replace(/[.!?]/g, '');
    if (/^(stop|end|finish)( the)?( conversation| lesson)?$/.test(x)) return 'stop';
    if (/^(repeat|say (it|that) again|again|pardon|what)$/.test(x)) return 'repeat';
    if (/^(slower|slow down|speak slower|more slowly)$/.test(x)) return 'slower';
    if (/^(faster|speak faster)$/.test(x)) return 'faster';
    if (/^(new topic|change (the )?topic|next topic)$/.test(x)) return 'new_topic';
    if (/^(explain|why|explain that)$/.test(x)) return 'explain';
    return null;
  }

  async function handleCommand(cmd) {
    if (!cmd || cmd === 'none') return false;
    if (cmd === 'stop') { await end(); return true; }
    if (cmd === 'repeat') { await sayParts(lastSpoken); listen(); return true; }
    if (cmd === 'slower') { rate = Math.max(0.6, rate - 0.15); await sayParts([{ text: 'Okay, I will speak more slowly.' }, ...lastSpoken.filter((p) => p.reply)]); listen(); return true; }
    if (cmd === 'faster') { rate = Math.min(1.4, rate + 0.15); await sayParts([{ text: 'Okay, a little faster.' }]); listen(); return true; }
    if (cmd === 'new_topic') { await newTopic(); return true; }
    if (cmd === 'explain') {
      const e = lastRes && (lastRes.errors || [])[0];
      await sayParts([{ text: e ? `${e.why || ''} So we say: ${e.right}.` : 'There was nothing to correct in your last answer. Well done.' }]);
      listen(); return true;
    }
    return false;
  }

  async function newTopic() {
    loop && loop.pause();
    stopSpeaking();
    topic = pickTopic(state.topicsDone, null);
    mode = topic.mode === 'roleplay' && !topic.role ? 'chat' : topic.mode || 'chat';
    turns.length = 0;
    turns.push({ role: 'ai', text: topic.opener });
    topicEl.textContent = '🗣️ ' + topic.title;
    replyEl.textContent = topic.opener; heardEl.textContent = '';
    await sayParts([{ text: 'New topic: ' + topic.title + '. ' + topic.opener, reply: true }]);
    listen();
  }

  async function failSoft(e) {
    const msg = /limit/i.test(e.message) ? 'I need a short break because the free limit was reached. Let\'s continue in a minute.' : 'Sorry, I had a connection problem. Please say that again.';
    toast(e.message, 4000);
    await sayParts([{ text: msg }]);
    if (/limit/i.test(e.message)) await new Promise((r) => setTimeout(r, 20000));
    listen();
  }

  function togglePause() {
    pausedByUser = !pausedByUser;
    if (pausedByUser) { loop && loop.pause(); stopSpeaking(); pauseBtn.textContent = '▶ Resume'; }
    else { pauseBtn.textContent = '⏸ Pause'; listen(); }
  }

  async function end() {
    if (stopped) return;
    stopped = true;
    stopSpeaking();
    try { loop && (await loop.stop()); } catch {}
    const mine = turns.filter((t) => t.role === 'me');
    clear(area);
    const box = card(h('h2', { style: { marginTop: 0 } }, 'Session review'), h('p', { class: 'muted' }, 'Saving…'));
    area.append(box);
    const r = await finishConversation({ topic, mode, turns, extra: { voice: true } });
    if (mine.length) speak(`Great work. You spoke ${mine.length} time${mine.length > 1 ? 's' : ''}. You can review the corrections when you have stopped driving.`);
    clear(box);
    box.append(h('h2', { style: { marginTop: 0 } }, 'Session review'), h('p', { class: 'muted small' }, 'Read this later, when you are not driving.'));
    if (r) box.append(h('p', {}, `${r.turnsCount} turns · about ${r.avgWords} words per turn · longest answer ${r.longest} words.`), r.summary ? h('p', {}, r.summary.summary) : null, r.summary && r.summary.nextFocus ? h('p', {}, h('strong', {}, 'Next focus: '), r.summary.nextFocus) : null);
    const withErr = review.filter((x) => (x.res.errors || []).length);
    if (withErr.length) { box.append(h('h3', {}, 'Grammar and vocabulary')); for (const x of withErr) box.append(h('div', {}, h('p', { class: 'muted small' }, 'You said: ' + x.said), correctionView({ ...x.res, natural: '' }, x.said, { logErrors: false, logged: x.logged }))); }
    const allPron = review.flatMap((x) => x.res.pronunciation || []);
    const pv = pronView(allPron, { title: 'Sounds to practise' }); if (pv) box.append(pv);
    if (!withErr.length && !allPron.length && mine.length) box.append(h('p', { class: 'good' }, 'No corrections in this session.'));
    box.append(h('div', { class: 'row' }, btn('Talk again', () => { review.length = 0; turns.length = 0; setup(); }, 'primary'), btn('Back to topics', () => { location.hash = '#/talk'; })));
  }

  return () => { stopped = true; stopSpeaking(); try { loop && loop.stop(); } catch {} };
}
