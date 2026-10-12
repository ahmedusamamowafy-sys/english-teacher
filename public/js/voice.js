// Hands-free listening: voice-activity detection (VAD) on the microphone.
// It notices when you start talking and when you stop (a pause), then hands over the recorded
// utterance as a 16 kHz WAV. No buttons needed between turns.
import { downsample, encodeWav } from './speech.js';

export const PAUSES = { short: 900, normal: 1500, long: 2300 };

// Pure helper (unit-tested): adaptive threshold from the measured background noise.
export function thresholdFor(noiseFloor) { return Math.max(0.012, noiseFloor * 2.8); }
export function rms(buf) { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / Math.max(1, buf.length)); }

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * createVoiceLoop({onState, onUtterance, onLevel, pauseMs})
 * onUtterance({wav, base64, ms}) is awaited; while it runs the loop does not listen.
 * Call resume() when you want it to listen again (e.g. after the reply has been spoken),
 * or set autoResume: true.
 */
export function createVoiceLoop({ onState = () => {}, onUtterance, onLevel = () => {}, pauseMs = PAUSES.normal, minSpeechMs = 450, maxMs = 30000 } = {}) {
  let ctx = null, stream = null, proc = null, src = null, wakeLock = null;
  let active = false, running = false, hearing = false;
  let floor = 0.01, aboveRun = 0, lastVoiceAt = 0, startedAt = 0, ignoreUntil = 0;
  let chunks = [], preroll = [];
  let rate = 48000;
  let onceHandler = null;
  const PREROLL_MS = 400;

  const setState = (s) => { try { onState(s); } catch {} };

  async function acquireWakeLock() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  }
  const onVis = () => { if (running && document.visibilityState === 'visible') acquireWakeLock(); };

  function onAudio(e) {
    if (!running) return;
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    const chunkMs = (data.length / rate) * 1000;
    const level = rms(data);
    onLevel(level);
    const now = performance.now();
    if (!active || now < ignoreUntil) return;
    const th = thresholdFor(floor);
    if (!hearing) {
      preroll.push(data);
      while (preroll.length * chunkMs > PREROLL_MS) preroll.shift();
      if (level > th) {
        aboveRun++;
        if (aboveRun >= 2) { hearing = true; startedAt = now - aboveRun * chunkMs; lastVoiceAt = now; chunks = [...preroll]; preroll = []; setState('hearing'); }
      } else {
        aboveRun = 0;
        floor = floor * 0.95 + level * 0.05; // learn background noise (car engine, AC...)
      }
      return;
    }
    chunks.push(data);
    if (level > th * 0.8) lastVoiceAt = now;
    const spoke = lastVoiceAt - startedAt;
    if (now - lastVoiceAt >= pauseMs || now - startedAt >= maxMs) {
      hearing = false; aboveRun = 0;
      const collected = chunks; chunks = [];
      if (spoke < minSpeechMs) { setState('listening'); return; } // a cough or a click
      finish(collected, spoke);
    }
  }

  async function finish(collected, ms) {
    active = false;
    setState('processing');
    let n = 0; for (const c of collected) n += c.length;
    const all = new Float32Array(n); let o = 0; for (const c of collected) { all.set(c, o); o += c.length; }
    const wav = encodeWav(downsample(all, rate, 16000), 16000);
    const fn = onceHandler || onUtterance; onceHandler = null;
    try { await fn({ wav, base64: await blobToBase64(wav), ms }); }
    catch (e) { console.error(e); }
  }

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      rate = ctx.sampleRate;
      src = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(2048, 1, 1);
      proc.onaudioprocess = onAudio;
      const mute = ctx.createGain(); mute.gain.value = 0;
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      running = true;
      document.addEventListener('visibilitychange', onVis);
      acquireWakeLock();
    },
    // Listen for the next utterance. A short guard time skips the tail of our own speech.
    resume(guardMs = 300) { if (!running) return; hearing = false; aboveRun = 0; chunks = []; preroll = []; ignoreUntil = performance.now() + guardMs; active = true; setState('listening'); },
    pause() { active = false; hearing = false; chunks = []; onceHandler = null; setState('paused'); },
    // Capture just the next utterance with a different handler (e.g. a pronunciation repeat).
    listenOnce(handler, guardMs = 250) { onceHandler = handler; this.resume(guardMs); },
    setPause(ms) { pauseMs = ms; },
    get isRunning() { return running; },
    async stop() {
      running = false; active = false;
      document.removeEventListener('visibilitychange', onVis);
      try { proc && proc.disconnect(); src && src.disconnect(); } catch {}
      try { stream && stream.getTracks().forEach((t) => t.stop()); } catch {}
      try { ctx && (await ctx.close()); } catch {}
      try { wakeLock && (await wakeLock.release()); } catch {}
      setState('idle');
    },
  };
}

// Fallback for providers without audio understanding: browser speech recognition, one utterance at a time.
export function createSpeechRecLoop({ onState = () => {}, onText, lang = 'en-US' }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  let running = false, active = false, rec = null, wakeLock = null;
  function listenOnce() {
    if (!running || !active) return;
    rec = new SR(); rec.lang = lang; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
    let text = '';
    rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript + ' '; };
    rec.onerror = () => {};
    rec.onend = async () => {
      if (!running || !active) return;
      text = text.trim();
      if (!text) { setTimeout(listenOnce, 150); return; } // silence: keep listening
      active = false; onState('processing');
      try { await onText(text); } catch (e) { console.error(e); }
    };
    try { rec.start(); onState('listening'); } catch { setTimeout(listenOnce, 400); }
  }
  return {
    async start() { running = true; try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {} },
    resume() { if (!running) return; active = true; listenOnce(); },
    pause() { active = false; try { rec && rec.abort(); } catch {} onState('paused'); },
    setPause() {},
    get isRunning() { return running; },
    async stop() { running = false; active = false; try { rec && rec.abort(); } catch {} try { wakeLock && (await wakeLock.release()); } catch {} onState('idle'); },
  };
}

// Split long text into sentences so mobile speech engines do not cut it off.
export function sentences(text) {
  return String(text).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*\s*/g)?.map((s) => s.trim()).filter(Boolean) || [];
}
