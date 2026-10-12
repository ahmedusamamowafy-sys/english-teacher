const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
global.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };

test('VAD helpers', async () => {
  const { thresholdFor, rms, sentences, PAUSES } = await import('../public/js/voice.js');
  assert.equal(thresholdFor(0), 0.012, 'minimum threshold in a quiet room');
  assert.ok(thresholdFor(0.05) > 0.1, 'threshold rises with car noise');
  assert.equal(rms(new Float32Array([0.5, -0.5])), 0.5);
  assert.deepEqual(sentences('Hello there. How are you? Fine!'), ['Hello there.', 'How are you?', 'Fine!']);
  assert.deepEqual(sentences(''), []);
  assert.ok(PAUSES.short < PAUSES.normal && PAUSES.normal < PAUSES.long);
});

test('composeSpeech: corrections first, reply last, respects settings', async () => {
  const { composeSpeech } = await import('../public/js/views/voice.js');
  const res = { reply: 'Nice. What happened next?', confidence: 'high', errors: [{ wrong: 'I am agree', right: 'I agree', why: 'agree is a verb' }, { wrong: 'informations', right: 'information', why: 'uncountable' }], pronunciation: [{ word: 'project', tip: 'Stress the first part.', say: 'PRO-ject' }, { word: 'very', tip: 'Top teeth on lip.' }] };
  const bal = composeSpeech(res, { voiceCorrection: 'balanced', accentCoach: 'gentle' });
  assert.match(bal.parts[0].text, /say "I agree", not "I am agree"/);
  assert.equal(bal.parts.filter((p) => /Also/.test(p.text)).length, 0, 'balanced = one correction');
  assert.ok(bal.parts.some((p) => p.model && p.text === 'project'), 'model word spoken');
  assert.ok(!bal.parts.some((p) => p.text === 'very'), 'gentle = one sound');
  assert.equal(bal.parts.at(-1).reply, true, 'reply (with the question) comes last');
  assert.equal(bal.pronToRepeat, null);
  const strict = composeSpeech(res, { voiceCorrection: 'intensive', accentCoach: 'strict' });
  assert.ok(strict.parts.some((p) => /Also/.test(p.text)));
  assert.ok(strict.parts.some((p) => p.text === 'agree is a verb'), 'intensive includes reasons');
  assert.equal(strict.pronToRepeat.word, 'project');
  const quiet = composeSpeech(res, { voiceCorrection: 'off', accentCoach: 'off' });
  assert.equal(quiet.parts.length, 1);
  const low = composeSpeech({ ...res, confidence: 'low' }, { voiceCorrection: 'balanced', accentCoach: 'off' });
  assert.equal(low.parts.length, 1, 'low-confidence corrections are not spoken');
});

test('topic library and picking', async () => {
  const { TOPICS, CATEGORIES, MODES, pickTopic } = await import('../public/js/content/topics.js');
  assert.ok(TOPICS.length >= 120);
  const cats = new Set(CATEGORIES.map((c) => c[0]));
  const modes = new Set(MODES.map((m) => m[0]));
  for (const t of TOPICS) { assert.ok(cats.has(t.cat), t.id); assert.ok(modes.has(t.mode), t.id + ' mode'); assert.ok(t.opener.length > 15); }
  assert.equal(new Set(TOPICS.map((t) => t.id)).size, TOPICS.length, 'unique ids');
  const done = Object.fromEntries(TOPICS.filter((t) => t.cat === 'food').slice(1).map((t) => [t.id, 2]));
  const first = TOPICS.find((t) => t.cat === 'food');
  assert.equal(pickTopic(done, 'food').id, first.id, 'prefers the least-practised topic');
});

test('profiles keep separate data', async () => {
  const st = await import('../public/js/store.js');
  st.setRemote(false);
  await st.load();
  st.state.profile.name = 'Ahmed'; st.state.cards.push({ id: 'x' }); st.save();
  const id = st.addProfile('Sara', 'teacher');
  st.switchProfile(id);
  await st.load();
  assert.equal(st.state.profile.name, 'Sara');
  assert.equal(st.state.profile.about, 'teacher');
  assert.equal(st.state.cards.length, 0, 'new learner starts empty');
  st.switchProfile('default');
  await st.load();
  assert.equal(st.state.cards.length, 1);
  assert.equal(st.getProfiles().list.length, 2);
  assert.equal(st.removeProfile('default') && st.getProfiles().list.length, 1);
  assert.equal(st.removeProfile(id), false, 'cannot delete the last learner');
});

test('device AI settings decide readiness', async () => {
  const ai = await import('../public/js/ai.js');
  global.fetch = async () => ({ ok: false, json: async () => ({}) });
  await ai.loadConfig();
  assert.equal(ai.config.aiReady, false);
  ai.setDeviceAI({ provider: 'gemini', key: 'k' });
  assert.equal(ai.config.aiReady, true);
  assert.equal(ai.config.audio, true);
  ai.setDeviceAI({ provider: 'openai', key: 'k', baseUrl: '' });
  assert.equal(ai.config.aiReady, false, 'OpenAI-compatible needs a base URL');
  ai.setDeviceAI({ provider: 'openai', key: 'k', baseUrl: 'https://x/v1' });
  assert.equal(ai.config.aiReady, true);
  assert.equal(ai.config.audio, false, 'only Gemini listens to audio');
});
