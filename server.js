// Personal English Teacher - zero-dependency Node server (Node 18+).
// Serves the PWA, persists your student data to ./data/state.json,
// and proxies AI / speech calls so API keys never reach the browser.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// ---- tiny .env loader (no dependency) ----
(function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1'; // local only by default
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_BODY = 25 * 1024 * 1024;

const env = (k) => (process.env[k] || '').trim();

function providers() {
  const ai = env('AI_PROVIDER') || (env('ANTHROPIC_API_KEY') ? 'anthropic' : env('OPENAI_API_KEY') ? 'openai' : 'none');
  return {
    ai,
    aiReady: (ai === 'anthropic' && !!env('ANTHROPIC_API_KEY')) || (ai === 'openai' && !!env('OPENAI_API_KEY')),
    azureSpeech: !!(env('AZURE_SPEECH_KEY') && env('AZURE_SPEECH_REGION')),
  };
}

// ---- helpers ----
function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const sendJson = (res, status, obj) => { const b = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(b); };

function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(tmp, file);
}

// ---- AI proxy ----
async function callAI({ system, messages, json, maxTokens }) {
  const p = providers();
  if (!p.aiReady) throw Object.assign(new Error('No AI provider configured. Add a key to .env (see README).'), { status: 501 });
  maxTokens = Math.min(Number(maxTokens) || 1500, 4000);
  if (p.ai === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env('ANTHROPIC_MODEL') || 'claude-sonnet-5-5',
        max_tokens: maxTokens,
        system: (system || '') + (json ? '\n\nRespond with a single valid JSON object only. No prose, no code fences.' : ''),
        messages,
      }),
    });
    const t = await r.text();
    if (!r.ok) throw Object.assign(new Error('AI provider error: ' + t.slice(0, 300)), { status: 502 });
    const d = JSON.parse(t);
    return (d.content || []).map((c) => c.text || '').join('');
  }
  // OpenAI-compatible
  const base = (env('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env('OPENAI_API_KEY') },
    body: JSON.stringify({
      model: env('OPENAI_MODEL') || 'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system || '' }, ...messages],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error('AI provider error: ' + t.slice(0, 300)), { status: 502 });
  return JSON.parse(t).choices?.[0]?.message?.content || '';
}

// ---- Azure speech ----
// AZURE_TEST_BASE is only for automated tests (points at a local mock); normally unset.
const azureHost = (kind) => env('AZURE_TEST_BASE') || `https://${env('AZURE_SPEECH_REGION')}.${kind}.speech.microsoft.com`;

async function azureTTS(text, voice) {
  voice = voice || 'en-US-JennyNeural';
  if (!/^[A-Za-z]{2}-[A-Za-z]{2}-[A-Za-z0-9]+$/.test(voice)) voice = 'en-US-JennyNeural';
  const esc = String(text).slice(0, 1500).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${voice}">${esc}</voice></speak>`;
  const r = await fetch(`${azureHost('tts')}/cognitiveservices/v1`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': env('AZURE_SPEECH_KEY'), 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3' },
    body: ssml,
  });
  if (!r.ok) throw Object.assign(new Error('Azure TTS error ' + r.status), { status: 502 });
  return Buffer.from(await r.arrayBuffer());
}

async function azurePronunciation(wav, referenceText) {
  const cfg = { ReferenceText: referenceText, GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: 'Comprehensive', EnableMiscue: 'True', EnableProsodyAssessment: 'True' };
  const r = await fetch(`${azureHost('stt')}/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env('AZURE_SPEECH_KEY'),
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Pronunciation-Assessment': Buffer.from(JSON.stringify(cfg)).toString('base64'),
      Accept: 'application/json',
    },
    body: wav,
  });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error('Azure pronunciation error ' + r.status + ': ' + t.slice(0, 200)), { status: 502 });
  return JSON.parse(t);
}

// ---- static files ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const full = path.normalize(path.join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC + path.sep) && full !== PUBLIC) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ---- router ----
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (!p.startsWith('/api/')) return serveStatic(req, res, p);

    // CSRF/DNS-rebinding guard: only accept same-origin browser calls.
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return sendJson(res, 403, { error: 'Cross-origin request blocked' });

    if (p === '/api/config' && req.method === 'GET') return sendJson(res, 200, { server: true, ...providers() });

    if (p === '/api/state') {
      // One file per learner profile. "default" keeps the original file name.
      const prof = url.searchParams.get('profile') || 'default';
      if (!/^[a-z0-9_-]{1,40}$/i.test(prof)) return sendJson(res, 400, { error: 'bad profile id' });
      const file = prof === 'default' ? STATE_FILE : path.join(DATA_DIR, `state-${prof}.json`);
      if (req.method === 'GET') {
        if (!fs.existsSync(file)) return sendJson(res, 200, { state: null });
        return sendJson(res, 200, { state: JSON.parse(fs.readFileSync(file, 'utf8')) });
      }
      if (req.method === 'PUT') {
        const body = JSON.parse((await readBody(req)).toString('utf8'));
        if (!body || typeof body.state !== 'object' || Array.isArray(body.state)) return sendJson(res, 400, { error: 'state object required' });
        atomicWrite(file, JSON.stringify(body.state));
        return sendJson(res, 200, { ok: true });
      }
    }

    if (p === '/api/ai' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8'));
      if (!Array.isArray(body.messages) || !body.messages.length) return sendJson(res, 400, { error: 'messages required' });
      const text = await callAI(body);
      return sendJson(res, 200, { text });
    }

    if (p === '/api/tts' && req.method === 'POST') {
      if (!providers().azureSpeech) return sendJson(res, 501, { error: 'Azure speech not configured' });
      const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8'));
      const mp3 = await azureTTS(body.text || '', body.voice);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
      return res.end(mp3);
    }

    if (p === '/api/pronunciation' && req.method === 'POST') {
      if (!providers().azureSpeech) return sendJson(res, 501, { error: 'Azure speech not configured' });
      const ref = (url.searchParams.get('ref') || '').slice(0, 500);
      if (!ref) return sendJson(res, 400, { error: 'ref required' });
      const wav = await readBody(req, 5 * 1024 * 1024);
      return sendJson(res, 200, await azurePronunciation(wav, ref));
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    sendJson(res, e.status || (e instanceof SyntaxError ? 400 : 500), { error: e instanceof SyntaxError ? 'Invalid JSON' : (e.message || 'Server error') });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const c = providers();
    console.log(`English Teacher running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`AI: ${c.aiReady ? c.ai : 'offline mode (no key)'} | Azure speech: ${c.azureSpeech ? 'on' : 'off'}`);
  });
}
module.exports = { server, providers };
