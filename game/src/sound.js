// Sound, synthesized live with WebAudio: no audio files, no network, nothing
// to load. Every effect is a few oscillators or a burst of filtered noise,
// built on the first user gesture (browsers block audio before one). M mutes.
export function createSound() {
  let context = null;
  let muted = false;
  let shootTick = 0;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    } catch {
      context = null;
    }
    return context;
  }
  function tone(freqStart, freqEnd, duration, type, volume, when) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      const start = ctx.currentTime + (when || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, start);
      if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch { /* Audio is decoration: never break the game for a sound. */ }
  }
  function noise(duration, volume, filterFreq) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      const start = ctx.currentTime;
      const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(start);
    } catch { /* See tone(). */ }
  }
  return {
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() { muted = !muted; return muted; },
    isMuted() { return muted; },
    click() { tone(660, 660, 0.07, 'sine', 0.12); },
    place() { tone(440, 880, 0.12, 'triangle', 0.16); },
    upgrade() { tone(523, 1047, 0.18, 'triangle', 0.16); },
    shoot(now) {
      if (now - shootTick < 120) return;
      shootTick = now;
      tone(880, 660, 0.05, 'square', 0.04);
    },
    kill() { tone(520, 180, 0.12, 'sine', 0.14); noise(0.08, 0.06, 1200); },
    coin() { tone(1047, 1319, 0.08, 'sine', 0.08); },
    leak() { tone(160, 40, 0.5, 'sine', 0.28); noise(0.4, 0.2, 500); },
    waveClear() {
      tone(523, 523, 0.14, 'sine', 0.16);
      tone(659, 659, 0.14, 'sine', 0.16, 0.12);
      tone(784, 784, 0.22, 'sine', 0.18, 0.24);
    },
    win() {
      tone(523, 523, 0.16, 'triangle', 0.16);
      tone(659, 659, 0.16, 'triangle', 0.16, 0.14);
      tone(784, 784, 0.16, 'triangle', 0.16, 0.28);
      tone(1047, 1047, 0.4, 'triangle', 0.18, 0.42);
    },
    lose() { tone(320, 60, 0.8, 'sawtooth', 0.2); },
  };
}
