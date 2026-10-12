// AI teacher layer.
// Two ways to reach an AI model:
//  1. "device" mode: the phone/browser calls the provider directly with the learner's own key
//     (Gemini free tier recommended; any OpenAI-compatible endpoint such as Groq also works).
//     The key is stored only in this browser's localStorage. This is what the free hosted version uses.
//  2. "server" mode: the local Node server proxies calls with keys from its .env file.
import { state } from './store.js';
import { toDetail } from './levels.js';

export let config = { server: false, ai: 'none', aiReady: false, azureSpeech: false, device: false, audio: false };

const AI_KEY = 'englishTeacher.ai';
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Preference order when auto-picking a Gemini model (newest stable Flash first). Checked against the live model list.
export const GEMINI_PREFERRED = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];

export function getDeviceAI() {
  try { return { provider: 'gemini', key: '', model: '', baseUrl: '', ...(JSON.parse(localStorage.getItem(AI_KEY) || '{}')) }; }
  catch { return { provider: 'gemini', key: '', model: '', baseUrl: '' }; }
}
export function setDeviceAI(v) {
  try { localStorage.setItem(AI_KEY, JSON.stringify(v)); } catch {}
  refreshDeviceFlags();
}
function refreshDeviceFlags() {
  const d = getDeviceAI();
  config.device = !!(d.key && (d.provider === 'gemini' || d.baseUrl));
  config.audio = config.device && d.provider === 'gemini';
  config.aiReady = config.device || !!config.serverAI;
  config.ai = config.device ? (d.provider === 'gemini' ? 'gemini' : 'openai-compatible') : (config.serverAI ? config.serverProvider : 'none');
}

export async function loadConfig() {
  try {
    const r = await fetch('api/config', { headers: { accept: 'application/json' } });
    const d = r.ok ? await r.json() : null;
    if (d && d.server) { config.server = true; config.serverAI = d.aiReady; config.serverProvider = d.ai; config.azureSpeech = d.azureSpeech; }
  } catch {}
  refreshDeviceFlags();
  return config;
}

// ---------------- low-level calls ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiCall({ system, contents, json, temperature }) {
  const d = getDeviceAI();
  const model = d.model || GEMINI_PREFERRED[0];
  const body = { contents, generationConfig: { temperature: temperature ?? 0.7 } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (json) body.generationConfig.responseMimeType = 'application/json';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': d.key }, body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status === 503) {
      if (attempt < 2) { await sleep(r.status === 429 ? 4000 * (attempt + 1) : 1500); continue; }
      throw new Error(r.status === 429 ? 'The free Gemini limit was reached for the moment. Wait about a minute and try again.' : 'Gemini is busy. Try again in a moment.');
    }
    const t = await r.text();
    if (!r.ok) {
      let msg = t.slice(0, 200);
      try { msg = JSON.parse(t).error.message; } catch {}
      if (r.status === 400 && /API key/i.test(msg)) msg = 'The Gemini key was rejected. Check it in Settings.';
      if (r.status === 404) msg = `Model "${model}" is not available for this key. Open Settings and press "Test connection" to pick one automatically.`;
      throw new Error(msg);
    }
    const data = JSON.parse(t);
    const cand = data.candidates && data.candidates[0];
    const text = cand && cand.content && (cand.content.parts || []).map((p) => p.text || '').join('');
    if (!text) throw new Error(cand && cand.finishReason === 'SAFETY' ? 'The AI declined to answer that.' : 'Empty AI response');
    return text;
  }
}

async function openaiCompatCall({ system, messages, json, maxTokens }) {
  const d = getDeviceAI();
  const r = await fetch(d.baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + d.key },
    body: JSON.stringify({ model: d.model || 'llama-3.3-70b-versatile', max_tokens: maxTokens || 1500, messages: [{ role: 'system', content: (system || '') + (json ? '\nRespond with a single valid JSON object only.' : '') }, ...messages], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  const t = await r.text();
  if (r.status === 429) throw new Error('The free limit was reached for the moment. Wait a minute and try again.');
  if (!r.ok) throw new Error('AI error ' + r.status + ': ' + t.slice(0, 200));
  return JSON.parse(t).choices?.[0]?.message?.content || '';
}

const toGemini = (messages) => messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));

export async function ask({ system, messages, json = false, maxTokens = 1500 }) {
  if (config.device) {
    const d = getDeviceAI();
    if (d.provider === 'gemini') return geminiCall({ system, contents: toGemini(messages), json });
    return openaiCompatCall({ system, messages, json, maxTokens });
  }
  const r = await fetch('api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, messages, json, maxTokens }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'AI request failed. Add a free Gemini key in Settings.');
  return d.text;
}

// Audio + text in one call (Gemini only). history: [{role:'user'|'assistant', content}]
export async function askWithAudio({ system, history = [], audioBase64, mime = 'audio/wav', text = '' }) {
  if (!config.audio) throw new Error('Audio understanding needs a Gemini key.');
  const contents = toGemini(history);
  const parts = [{ inlineData: { mimeType: mime, data: audioBase64 } }];
  if (text) parts.push({ text });
  contents.push({ role: 'user', parts });
  return geminiCall({ system, contents, json: true, temperature: 0.6 });
}

// Connection test + automatic model choice for Gemini. Returns {ok, model, message}.
export async function testConnection(candidate) {
  const prev = getDeviceAI();
  const d = { ...prev, ...candidate };
  if (!d.key) return { ok: false, message: 'Paste your key first.' };
  if (d.provider === 'gemini') {
    try {
      const r = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': d.key } });
      const t = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, message: (t.error && t.error.message) || 'Key rejected (' + r.status + ')' };
      const names = (t.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
      let model = d.model && names.includes(d.model) ? d.model : GEMINI_PREFERRED.find((p) => names.includes(p));
      if (!model) model = names.find((n) => /flash/.test(n) && !/image|tts|live|audio|embedding/.test(n)) || names[0];
      if (!model) return { ok: false, message: 'No usable model found for this key.' };
      setDeviceAI({ ...d, model });
      const reply = await ask({ system: 'Reply with exactly: OK', messages: [{ role: 'user', content: 'Say OK' }] });
      return { ok: true, model, message: `Connected. Using ${model}. Reply: ${reply.trim().slice(0, 40)}` };
    } catch (e) { setDeviceAI(prev); return { ok: false, message: e.message }; }
  }
  try {
    setDeviceAI(d);
    const reply = await ask({ system: 'Reply with exactly: OK', messages: [{ role: 'user', content: 'Say OK' }] });
    return { ok: true, model: d.model, message: 'Connected. Reply: ' + reply.trim().slice(0, 40) };
  } catch (e) { setDeviceAI(prev); return { ok: false, message: e.message }; }
}

export function parseJSON(text) {
  if (!text) throw new Error('Empty AI response');
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

// ---------------- teacher persona ----------------
function levelSummary() {
  const L = state.profile.levels;
  return Object.entries(L).map(([k, v]) => `${k}: ${v.n ? toDetail(v.est) : 'not yet assessed'}`).join(', ');
}
function recurringErrors(limit = 6) {
  return state.errors.filter((e) => e.status === 'active').sort((a, b) => b.occurrences - a.occurrences).slice(0, limit)
    .map((e) => `${e.category}: "${e.wrong}" -> "${e.right}" (x${e.occurrences})`).join('; ');
}
function recurringSounds(limit = 5) {
  const by = {};
  for (const p of state.pron || []) for (const i of p.issues || []) by[i.sound || 'other'] = (by[i.sound || 'other'] || 0) + 1;
  return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, n]) => `${k} (x${n})`).join(', ');
}

export function teacherSystem(extra = '') {
  const p = state.profile;
  const arabic = p.settings.arabicSupport;
  const accent = { 'en-GB': 'British', 'en-AU': 'Australian', 'en-IN': 'Indian' }[p.settings.accent] || 'American';
  return `You are the personal English teacher of ${p.name}. About the student: ${p.about || 'an adult Arabic speaker learning English'}.
Personality: warm, patient, curious, practical and honest. Never flatter; say plainly when something is wrong.
Teaching language: English. Arabic support = "${arabic}" (off = never use Arabic; auto = a short Arabic gloss only when a concept is hard; always = add a brief Arabic explanation).
Pronunciation model the student is aiming for: clear ${accent} English.
Current estimated levels (CEFR): ${levelSummary()}.
Recurring grammar/vocabulary mistakes to revisit naturally: ${recurringErrors() || 'none recorded yet'}.
Recurring pronunciation issues: ${recurringSounds() || 'none recorded yet'}.
Things you remember about the student: ${(p.teacherNotes || []).slice(-12).join(' | ') || 'nothing yet'}.
Do not mark a sentence wrong merely because another phrasing is more common. Preserve the student's meaning.
${extra}`;
}

// ---------------- conversation (one call per turn: reply + correction together) ----------------
export const MODE_RULES = {
  chat: 'Have a natural, lively conversation about the topic. Share a short opinion or a small fact of your own sometimes, then ask ONE open follow-up question that makes the student talk more (why / how / tell me about a time...). If answers are short, gently push: "Can you give me an example?"',
  roleplay: 'Stay fully in your role in the scenario and move it forward realistically, with small complications.',
  debate: 'Politely take the OPPOSITE side to the student, give one clear counter-argument, then challenge them to respond. Model debating phrases (I see your point, but... / That may be true; however...).',
  story: 'Build a story together. Continue the student\'s story with 1-2 vivid sentences, then ask what happens next. Keep it fun.',
  interview: 'Interview the student about the topic like a friendly podcast host: one deep question at a time, building on their answers.',
  quickfire: 'Quick-fire mode: ask one SHORT, easy-to-answer question at a time, rapidly changing angle within the topic. Keep your turn under 15 words.',
  teachback: 'The student explains something they know (often from their work) as if to a new colleague. Act curious and slightly naive; ask clarifying questions that make them explain more simply and clearly.',
};

// Returns {reply, errors[], corrected, natural, confidence, levelEstimate, usedChallenge, challenge:{expression, meaning}|null, note}
export async function conversationTurn({ topic, mode, history, correction, challenge, replyLength = 'normal' }) {
  const strict = { fluency: 'Return errors only if meaning is seriously unclear (max 1).', balanced: 'Return only important errors (max 2): ones that hinder meaning, are very common, or recur.', intensive: 'Return most meaningful errors (max 4).' }[correction] || '';
  const sys = teacherSystem(`Activity: ${MODE_RULES[mode] || MODE_RULES.chat}
Topic: ${topic.title}. ${topic.role ? 'Your role: ' + topic.role + '.' : ''} ${topic.goal ? 'Student goal: ' + topic.goal + '.' : ''}
Your reply: ${replyLength === 'short' ? '1-2 short sentences' : '2-3 sentences'}, spoken style, matched to the student's level. Never correct the student inside "reply".
Analyse ONLY the student's LAST message (it may come from speech recognition: ignore punctuation/capitals). ${strict}
${challenge ? `The student's current challenge is to use the expression "${challenge}". Set usedChallenge true only if they used it naturally and correctly.` : ''}
Every 3-4 turns, or when the student just used their challenge, offer a NEW useful expression that fits this conversation as "challenge" (otherwise null).
Return JSON: {"reply":"","errors":[{"category":"verb tense|subject-verb agreement|articles|prepositions|word order|plurals/countable|word choice|collocation|pronoun|connectors|register|other","wrong":"","right":"","why":"one short sentence"}],"corrected":"full corrected last message or empty","natural":"more natural version or empty","confidence":"high|medium|low","levelEstimate":1-6,"usedChallenge":false,"challenge":{"expression":"","meaning":""} or null,"note":"one durable fact about the student worth remembering, or empty"}`);
  const messages = history.map((t) => ({ role: t.role === 'ai' ? 'assistant' : 'user', content: t.text }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', content: '(The student is ready. Start.)' });
  return normalizeTurn(parseJSON(await ask({ system: sys, messages, json: true, maxTokens: 1200 })));
}

// Voice turn with real audio (Gemini). Adds what was heard + pronunciation feedback from the audio.
export async function voiceTurn({ topic, mode, history, audioBase64, correction, accentLevel, challenge, replyLength = 'short' }) {
  const strict = { fluency: 'errors: max 1, only if meaning is unclear.', balanced: 'errors: max 1-2 important ones.', intensive: 'errors: max 3.' }[correction] || '';
  const accent = { off: 'Return pronunciation as an empty array.', gentle: 'pronunciation: at most 1 item, only a sound or stress problem that clearly hurts intelligibility.', strict: 'pronunciation: up to 3 items covering sounds, word stress, sentence stress or intonation that differ noticeably from the target accent.' }[accentLevel] || '';
  const sys = teacherSystem(`You are talking with the student by voice (they may be driving: keep everything short, clear and spoken-friendly; never ask them to read or look at anything).
Activity: ${MODE_RULES[mode] || MODE_RULES.chat}
Topic: ${topic.title}. ${topic.role ? 'Your role: ' + topic.role + '.' : ''}
The attached audio is the student's latest turn. Do these steps:
1. "heard": transcribe EXACTLY what they said, keeping their grammar mistakes (do not fix them). If you cannot understand it, set "heard" to "" and use the reply to ask them to repeat.
2. "command": if they gave an instruction to the app, one of: stop, repeat, slower, faster, new_topic, explain (explain your last correction), none.
3. "errors": grammar/vocabulary errors in "heard". ${strict}
4. "pronunciation": listen to HOW they said it. ${accent} Typical Arabic-speaker issues: p/b, v/f, th, short i vs long ee, a/e vowels, extra vowel in consonant clusters, word stress, flat intonation. Only report what you actually hear; never guess. For each: {"word":"","sound":"p-b|v-f|th|i-ee|vowel|cluster|word-stress|sentence-stress|intonation|r|other","heardAs":"how it sounded, simple spelling","say":"easy respelling with STRESS in capitals, e.g. SHED-jool","tip":"one short mouth/tongue instruction"}.
5. "reply": your natural spoken reply (${replyLength === 'short' ? '1-2 short sentences' : '2-3 sentences'}) continuing the conversation, ending with one question. Do not put corrections in the reply.
${challenge ? `6. "usedChallenge": true only if they used "${challenge}" correctly.` : ''}
Return JSON: {"heard":"","command":"none","errors":[{"category":"","wrong":"","right":"","why":""}],"corrected":"","pronunciation":[],"reply":"","confidence":"high|medium|low","levelEstimate":1-6,"usedChallenge":false,"challenge":null,"note":""}`);
  const hist = history.map((t) => ({ role: t.role === 'ai' ? 'assistant' : 'user', content: t.text }));
  const res = normalizeTurn(parseJSON(await askWithAudio({ system: sys, history: hist, audioBase64 })));
  res.heard = String(res.heard || '').trim();
  res.command = ['stop', 'repeat', 'slower', 'faster', 'new_topic', 'explain'].includes(res.command) ? res.command : 'none';
  res.pronunciation = (Array.isArray(res.pronunciation) ? res.pronunciation : []).filter((p) => p && p.word).slice(0, accentLevel === 'strict' ? 3 : accentLevel === 'off' ? 0 : 1);
  return res;
}

// Did the repeat attempt fix the sound? Returns {ok, feedback}
export async function checkRepeat({ target, audioBase64 }) {
  const sys = `You are a pronunciation coach. The learner (Arabic speaker) tried to say: "${target}". Listen to the audio and judge only whether the target word/phrase is clearly understandable and close to standard pronunciation. Be honest but encouraging. Return JSON: {"ok":true|false,"feedback":"one short spoken sentence"}`;
  const r = parseJSON(await askWithAudio({ system: sys, audioBase64 }));
  return { ok: !!r.ok, feedback: String(r.feedback || '') };
}

function normalizeTurn(r) {
  r = r && typeof r === 'object' ? r : {};
  r.reply = String(r.reply || '').trim();
  r.errors = (Array.isArray(r.errors) ? r.errors : []).filter((e) => e && e.wrong && e.right && String(e.wrong).toLowerCase() !== String(e.right).toLowerCase());
  r.hasErrors = r.errors.length > 0;
  r.challenge = r.challenge && r.challenge.expression ? { expression: String(r.challenge.expression), meaning: String(r.challenge.meaning || '') } : null;
  return r;
}

// Hint for a stuck learner: {ideas:[...], phrases:[...]}
export async function getHint({ topic, history }) {
  const last = [...history].reverse().find((t) => t.role === 'ai');
  const sys = teacherSystem('The student is stuck answering your last message. Return JSON: {"ideas":["2-3 short ideas of what they could say"],"phrases":["3 useful sentence starters at their level"]}');
  return parseJSON(await ask({ system: sys, messages: [{ role: 'user', content: `Topic: ${topic.title}. Your last message: "${last ? last.text : ''}"` }], json: true, maxTokens: 400 }));
}

// ---------------- other teacher tasks (unchanged behaviour) ----------------
export async function converse(scenario, history, mode) {
  const t = await conversationTurn({ topic: { title: scenario.title, role: scenario.aiRole, goal: scenario.goal }, mode: 'roleplay', history, correction: mode });
  return t.reply;
}

export async function correctSentence(text, mode = 'balanced', context = 'spoken conversation') {
  const strictness = { fluency: 'Only list errors that seriously hinder understanding (max 2).', balanced: 'List important errors only (max 3): ones that hinder meaning, are very common, or recur. Ignore minor stylistic preferences.', intensive: 'List most meaningful errors (max 6) with fuller explanations.' }[mode] || '';
  const sys = teacherSystem(`Task: analyse the student's ${context} sentence(s). It was transcribed by speech recognition, so ignore punctuation/capitalisation and likely transcription artefacts.
${strictness}
Return JSON: {"hasErrors":bool,"errors":[{"category":"one of: verb tense|subject-verb agreement|articles|prepositions|word order|plurals/countable|word choice|collocation|pronoun|spelling|connectors|register|other","wrong":"exact wrong fragment","right":"corrected fragment","why":"one or two plain sentences","whyArabic":"optional short Arabic note, only if helpful"}],"corrected":"full corrected sentence","natural":"a more natural native-like alternative, or empty string if the corrected one is already natural","confidence":"high|medium|low","levelEstimate":number 1-6 (CEFR A1=1..C2=6) for this sample,"comment":"one short honest sentence"}
If there are no genuine errors set hasErrors false and leave errors empty.`);
  const r = parseJSON(await ask({ system: sys, messages: [{ role: 'user', content: text }], json: true, maxTokens: 900 }));
  r.errors = Array.isArray(r.errors) ? r.errors : [];
  r.hasErrors = r.errors.length > 0;
  return r;
}

export async function correctWriting(text, context) {
  const sys = teacherSystem(`Task: review the student's writing. Context: ${context}.
Return JSON: {"corrected":"minimal-edit corrected version preserving meaning","professional":"polished professional version suited to the context","errors":[{"category":"...","wrong":"...","right":"...","why":"..."}],"vocabulary":[{"expression":"","meaning":"","example":""}],"patterns":"2-3 sentences on recurring weaknesses seen in this text","exercise":{"instruction":"","items":[{"prompt":"","answer":""}]},"levelEstimate":number 1-6,"confidence":"high|medium|low"}
Give at most 8 errors and at most 5 vocabulary items (prefer collocations/phrases). The exercise has 3-4 items built from the student's own mistakes.`);
  return parseJSON(await ask({ system: sys, messages: [{ role: 'user', content: text }], json: true, maxTokens: 2200 }));
}

export async function askTeacher(question, history = []) {
  const sys = teacherSystem('The student asks a question about English. Answer clearly with 2-3 examples (use examples from the student\'s life and work when natural). Keep under 180 words.');
  return ask({ system: sys, messages: [...history, { role: 'user', content: question }], maxTokens: 700 });
}

export async function sessionSummary(turns) {
  const sys = teacherSystem('Summarise this practice conversation. Return JSON: {"summary":"2 sentences","notes":["up to 3 durable facts about the student worth remembering, e.g. topics, projects, interests; empty if none"],"nextFocus":"one recommendation"}');
  return parseJSON(await ask({ system: sys, messages: [{ role: 'user', content: turns.map((t) => `${t.role}: ${t.text}`).join('\n') }], json: true, maxTokens: 500 }));
}

export async function generateReading(level, topic) {
  const sys = teacherSystem(`Write an ORIGINAL reading text about "${topic}" at CEFR ${level}. Return JSON: {"title":"","text":"","glossary":[{"word":"","meaning":"","arabic":""}],"questions":[{"q":"","options":["","","",""],"answer":0}]}. Text 120-220 words. 4 questions. 6 glossary items.`);
  return parseJSON(await ask({ system: sys, messages: [{ role: 'user', content: 'Generate now.' }], json: true, maxTokens: 1800 }));
}

export async function generateQuiz(skill, level, n = 8) {
  const sys = teacherSystem(`Create ${n} ORIGINAL multiple-choice questions testing ${skill} at CEFR ${level}. Return JSON: {"items":[{"q":"","options":["","","",""],"answer":0,"level":3,"explain":""}]}. Exactly one correct option; plausible distractors.`);
  return parseJSON(await ask({ system: sys, messages: [{ role: 'user', content: 'Generate now.' }], json: true, maxTokens: 2500 }));
}
