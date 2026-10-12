const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'et-'));
process.env.DATA_DIR = tmp;           // never touch the real data folder
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.AI_PROVIDER;
const { server } = require('../server.js');
const mock = require('./mock-ai.js');

let base, mockInfo;
test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  mockInfo = await mock.start(0);
});
test.after(() => { server.close(); mockInfo.server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const j = (r) => r.json();

test('static files, traversal and unknown API', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/js/ui.js')).status, 200);
  assert.equal((await fetch(base + '/%2e%2e/server.js')).status, 404, 'encoded traversal blocked');
  assert.equal((await fetch(base + '/api/nope')).status, 404);
  const sw = await fetch(base + '/sw.js');
  assert.match(sw.headers.get('content-type'), /javascript/);
});

test('without keys: offline config and clear 501 for AI', async () => {
  const cfg = await j(await fetch(base + '/api/config'));
  assert.equal(cfg.aiReady, false);
  assert.equal(JSON.stringify(cfg).includes('key'), false, 'config never exposes keys');
  assert.equal(cfg.server, true);
  const r = await fetch(base + '/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) });
  assert.equal(r.status, 501);
  assert.equal((await fetch(base + '/api/tts', { method: 'POST', body: '{}' })).status, 501);
});

test('state round trip, backup file, and validation', async () => {
  assert.equal((await j(await fetch(base + '/api/state'))).state, null);
  const put = (body) => fetch(base + '/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put({ state: { profile: { name: 'A' }, v: 1 } })).status, 200);
  assert.equal((await put({ state: { profile: { name: 'B' }, v: 2 } })).status, 200);
  assert.equal((await j(await fetch(base + '/api/state'))).state.profile.name, 'B');
  assert.ok(fs.existsSync(path.join(tmp, 'state.json.bak')), 'previous version kept as .bak');
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'state.json.bak'), 'utf8')).profile.name, 'A');
  assert.equal((await put({ nope: 1 })).status, 400);
  const bad = await fetch(base + '/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);
  assert.equal((await j(await fetch(base + '/api/state'))).state.profile.name, 'B', 'bad write did not corrupt state');
});

test('per-profile state files are separate and ids are validated', async () => {
  const put = (q, body) => fetch(base + '/api/state' + q, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put('?profile=wife1', { state: { profile: { name: 'W' } } })).status, 200);
  assert.equal((await j(await fetch(base + '/api/state?profile=wife1'))).state.profile.name, 'W');
  assert.notEqual((await j(await fetch(base + '/api/state'))).state.profile.name, 'W');
  assert.ok(fs.existsSync(path.join(tmp, 'state-wife1.json')));
  assert.equal((await fetch(base + '/api/state?profile=../x')).status, 400);
  assert.equal((await put('?profile=a', { state: [1] })).status, 400);
});

test('cross-origin browser requests are blocked', async () => {
  const r = await fetch(base + '/api/state', { headers: { Origin: 'http://evil.example' } });
  assert.equal(r.status, 403);
});

test('OpenAI-compatible provider via mock: JSON mode, auth header, errors', async () => {
  process.env.AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${mockInfo.port}/v1`;
  const cfg = await j(await fetch(base + '/api/config'));
  assert.equal(cfg.aiReady, true);
  const call = (body) => fetch(base + '/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ok = await j(await call({ system: 'Task: analyse the student', messages: [{ role: 'user', content: 'He go to site' }], json: true }));
  assert.equal(JSON.parse(ok.text).errors[0].right, 'He goes');
  const last = mockInfo.requests.at(-1);
  assert.equal(last.auth, 'Bearer test-key');
  assert.equal(last.json, true);
  assert.equal((await call({ messages: [] })).status, 400);
  const err = await call({ system: 'FORCE_ERROR', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(err.status, 502);
  assert.ok(!(await err.text()).includes('test-key'), 'error never leaks the key');
});
