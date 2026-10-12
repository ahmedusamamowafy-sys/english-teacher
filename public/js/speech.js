// Speech: text-to-speech (browser or Azure), speech recognition (browser), recording, Azure pronunciation scoring.
import { state } from './store.js';
import { config } from './ai.js';

let currentAudio = null;

export function ttsSupported() { return 'speechSynthesis' in window || config.azureSpeech; }
export function sttSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

export function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export async function speak(text, { rate, lang, azureVoice } = {}) {
  stopSpeaking();
  const s = state.profile.settings;
  rate = rate || s.ttsRate || 1;
  if (config.azureSpeech && s.useAzureTts !== false) {
    try {
      const r = await fetch('api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: azureVoice }) });
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        const a = new Audio(url); a.playbackRate = rate; currentAudio = a;
        await new Promise((res) => { a.onended = res; a.onerror = res; a.play().catch(res); });
        URL.revokeObjectURL(url);
        return;
      }
    } catch {}
  }
  if (!('speechSynthesis' in window)) return;
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || s.accent || 'en-US'; u.rate = rate;
    const voices = speechSynthesis.getVoices();
    const v = (s.voiceName && voices.find((x) => x.name === s.voiceName)) || voices.find((x) => x.lang === u.lang) || voices.find((x) => x.lang.startsWith('en'));
    if (v) u.voice = v;
    u.onend = resolve; u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

export function listVoices() { return 'speechSynthesis' in window ? speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en')) : []; }

// ---- Speech recognition (browser) ----
export function createRecognizer({ onInterim, onFinal, onEnd, onError, lang } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = lang || state.profile.settings.accent || 'en-US';
  r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
  let finalText = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + ' '; else interim += t;
    }
    onInterim && onInterim((finalText + interim).trim());
  };
  r.onerror = (e) => onError && onError(e.error);
  r.onend = () => { onEnd && onEnd(finalText.trim()); };
  return { start: () => { finalText = ''; r.start(); }, stop: () => r.stop(), abort: () => r.abort() };
}

// ---- Recording to 16 kHz mono WAV (for playback comparison and Azure scoring) ----
export async function startRecorder() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc); proc.connect(ctx.destination);
  return {
    stop: async () => {
      proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop());
      const rate = ctx.sampleRate; await ctx.close();
      const samples = flatten(chunks);
      const wav = encodeWav(downsample(samples, rate, 16000), 16000);
      return { wav, samples: downsample(samples, rate, 16000), url: URL.createObjectURL(wav) };
    },
  };
}
function flatten(chunks) { const n = chunks.reduce((a, c) => a + c.length, 0); const out = new Float32Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out; }
export function downsample(buf, from, to) {
  if (to >= from) return buf;
  const ratio = from / to, len = Math.floor(buf.length / ratio), out = new Float32Array(len);
  for (let i = 0; i < len; i++) { const s = Math.floor(i * ratio), e = Math.min(buf.length, Math.floor((i + 1) * ratio)); let sum = 0; for (let j = s; j < e; j++) sum += buf[j]; out[i] = sum / Math.max(1, e - s); }
  return out;
}
export function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

// Draw a simple waveform on a canvas (self-comparison aid, not a score).
export function drawWave(canvas, samples, color = '#2f6fed') {
  const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  c.clearRect(0, 0, w, h); c.strokeStyle = color; c.beginPath();
  const step = Math.max(1, Math.floor(samples.length / w));
  for (let x = 0; x < w; x++) { let mn = 1, mx = -1; for (let i = 0; i < step; i++) { const s = samples[x * step + i] || 0; if (s < mn) mn = s; if (s > mx) mx = s; } c.moveTo(x, (1 + mn) * h / 2); c.lineTo(x, (1 + mx) * h / 2); }
  c.stroke();
}

// ---- Azure pronunciation assessment (MEASURED) ----
export async function assessPronunciation(wavBlob, referenceText) {
  const r = await fetch('api/pronunciation?ref=' + encodeURIComponent(referenceText), { method: 'POST', body: wavBlob });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Pronunciation service error');
  const nb = (d.NBest && d.NBest[0]) || {};
  const pa = nb.PronunciationAssessment || {};
  return {
    recognized: nb.Display || d.DisplayText || '',
    accuracy: pa.AccuracyScore ?? nb.AccuracyScore, fluency: pa.FluencyScore ?? nb.FluencyScore,
    completeness: pa.CompletenessScore ?? nb.CompletenessScore, prosody: pa.ProsodyScore ?? nb.ProsodyScore, overall: pa.PronScore ?? nb.PronScore,
    words: (nb.Words || []).map((w) => ({ word: w.Word, score: w.PronunciationAssessment?.AccuracyScore ?? w.AccuracyScore, error: w.PronunciationAssessment?.ErrorType ?? w.ErrorType, phonemes: (w.Phonemes || []).map((p) => ({ p: p.Phoneme, s: p.PronunciationAssessment?.AccuracyScore ?? p.AccuracyScore })) })),
  };
}
