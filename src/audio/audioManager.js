/**
 * Fully synthesised sound design (Web Audio API) — no recordings, so nothing
 * to license. Contains:
 *  - an original, gentle music-box & pad piece (generative, never repeats exactly)
 *  - soft winter wind
 *  - Christmas bells, sleigh bells and magical effects
 *
 * Nothing plays until init() is called from a user gesture. Every method is a
 * safe no-op if Web Audio is unavailable, so the site works without sound.
 */

const STORAGE_KEY = 'cw-sound';
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// D major voicings — [bass, ...pad, ...arp tones]
const PROGRESSION = [
  { bass: 38, pad: [50, 57, 62], arp: [66, 69, 73, 76, 78] }, // Dmaj9
  { bass: 35, pad: [47, 54, 62], arp: [66, 69, 73, 74, 78] }, // Bm9
  { bass: 31, pad: [43, 50, 59], arp: [62, 66, 69, 71, 74] }, // Gmaj7
  { bass: 33, pad: [45, 52, 62], arp: [64, 66, 71, 74, 76] }, // A6sus
  { bass: 30, pad: [42, 49, 57], arp: [64, 69, 73, 76, 81] }, // F#m7
  { bass: 35, pad: [47, 54, 62], arp: [62, 66, 69, 74, 78] }, // Bm7
  { bass: 28, pad: [40, 47, 59], arp: [62, 66, 67, 71, 74] }, // Em9
  { bass: 33, pad: [45, 52, 61], arp: [62, 64, 67, 73, 76] }, // A7sus
];
const PENTA = [74, 76, 78, 81, 83, 86, 88, 90, 93];

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.ready = false;
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    this.muted = stored === 'off';
    this.musicOn = true;
    this._timer = null;
    this._listeners = new Set();
  }

  get supported() {
    return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  _emit() {
    for (const fn of this._listeners) fn(this);
  }

  /** Must be called from a user gesture. */
  async init() {
    if (this.ready || !this.supported) return this.ready;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.4;
      comp.connect(ctx.destination);

      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(comp);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._impulse(3.8, 2.6);
      this.reverbGain = ctx.createGain();
      this.reverbGain.gain.value = 0.55;
      this.reverb.connect(this.reverbGain).connect(this.master);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.9 : 0;
      this.musicBus.connect(this.master);
      this.musicSend = ctx.createGain();
      this.musicSend.gain.value = 0.6;
      this.musicBus.connect(this.musicSend).connect(this.reverb);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.5;
      this.sfxBus.connect(sfxSend).connect(this.reverb);

      this.ambBus = ctx.createGain();
      this.ambBus.gain.value = 0.85;
      this.ambBus.connect(this.master);

      this.noise = this._noiseBuffer(4);
      this._startWind();
      this._startMusic();
      this.ready = true;
      this._applyMute(1.6);

      this._onVis = () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend();
        else this.ctx.resume();
      };
      document.addEventListener('visibilitychange', this._onVis);
    } catch (err) {
      console.warn('[audio] unavailable:', err);
      this.ready = false;
    }
    this._emit();
    return this.ready;
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem(STORAGE_KEY, m ? 'off' : 'on');
    } catch {
      /* ignore */
    }
    this._applyMute(0.6);
    this._emit();
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.ready) this._ramp(this.musicBus.gain, on ? 0.9 : 0, 1.2);
    this._emit();
  }

  /** Temporarily duck music (e.g. during the finale). */
  duck(amount = 0.4, time = 1.5) {
    if (!this.ready) return;
    this._ramp(this.musicBus.gain, this.musicOn ? amount : 0, time);
  }
  unduck(time = 2) {
    if (!this.ready) return;
    this._ramp(this.musicBus.gain, this.musicOn ? 0.9 : 0, time);
  }

  _applyMute(time) {
    if (!this.ctx) return;
    this._ramp(this.master.gain, this.muted ? 0 : 0.8, time);
  }

  _ramp(param, value, time) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + time);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // slightly pinkish noise
      const w = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * w;
      d[i] = w * 0.5 + last * 3;
    }
    return buf;
  }

  /* ------------------------------------------------------------------ wind */
  _startWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(bp.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const ampLfo = ctx.createOscillator();
    ampLfo.frequency.value = 0.045;
    const ampGain = ctx.createGain();
    ampGain.gain.value = 0.03;
    ampLfo.connect(ampGain).connect(g.gain);
    src.connect(bp).connect(g).connect(this.ambBus);
    src.start();
    lfo.start();
    ampLfo.start();
  }

  /* ------------------------------------------------------------------ music */
  _startMusic() {
    const ctx = this.ctx;
    const bpm = 68;
    this.beat = 60 / bpm;
    this.bar = 0;
    this.nextBarTime = ctx.currentTime + 0.4;
    const tick = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (this.nextBarTime < this.ctx.currentTime + 0.6) {
        this._scheduleBar(this.bar, this.nextBarTime);
        this.nextBarTime += this.beat * 4;
        this.bar++;
      }
    };
    this._timer = setInterval(tick, 120);
    tick();
  }

  _scheduleBar(bar, t0) {
    const chord = PROGRESSION[bar % PROGRESSION.length];
    const beat = this.beat;
    const section = Math.floor(bar / 8) % 4; // gentle evolution over time
    // pad + bass
    for (const n of chord.pad) this._pad(midi(n), t0, beat * 4.2, 0.022);
    this._bass(midi(chord.bass), t0, beat * 4, 0.05);
    // music-box arpeggio: 8 eighth notes with a few rests
    const pattern = [0, 2, 1, 3, 4, 3, 2, 1];
    for (let i = 0; i < 8; i++) {
      if (section === 0 && i % 2 === 1) continue; // sparse at first
      if (Math.random() < 0.12 && i > 0) continue;
      const n = chord.arp[pattern[i] % chord.arp.length];
      const t = t0 + i * beat * 0.5 + (Math.random() - 0.5) * 0.012;
      this._musicBox(midi(n), t, 0.045 * (i === 0 ? 1.2 : 0.85 + Math.random() * 0.25), this.musicBus);
    }
    // occasional high celesta answer
    if (section >= 2 && bar % 2 === 1) {
      const n = PENTA[(Math.random() * PENTA.length) | 0];
      this._musicBox(midi(n), t0 + beat * (2 + Math.round(Math.random() * 2) * 0.5), 0.03, this.musicBus, 2.6);
    }
  }

  _pad(freq, t, dur, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.4);
    g.gain.setValueAtTime(vol, t + dur - 1.0);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.Q.value = 0.3;
    lp.connect(g).connect(this.musicBus);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 1.3);
    }
  }

  _bass(freq, t, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.8);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 1);
  }

  /** FM "music box / celesta" tone. */
  _musicBox(freq, t, vol, bus, decay = 1.9) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    car.type = 'sine';
    mod.type = 'sine';
    car.frequency.value = freq;
    mod.frequency.value = freq * 3.5;
    modGain.gain.setValueAtTime(freq * 1.6, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + 0.5);
    mod.connect(modGain).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0003, t + decay);
    car.connect(g).connect(bus);
    car.start(t);
    mod.start(t);
    car.stop(t + decay + 0.05);
    mod.stop(t + decay + 0.05);
  }

  /** Church-bell style tone with inharmonic partials. */
  _bell(freq, t, vol = 0.12, decay = 3.5) {
    const ctx = this.ctx;
    const partials = [
      [0.5, 0.35],
      [1, 1],
      [1.19, 0.4],
      [1.5, 0.35],
      [2.0, 0.5],
      [2.74, 0.25],
      [3.76, 0.12],
      [5.4, 0.06],
    ];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0004, t + decay);
    g.connect(this.sfxBus);
    for (const [ratio, amp] of partials) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * ratio;
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(amp, t);
      pg.gain.exponentialRampToValueAtTime(0.001, t + decay / (ratio * 0.6 + 0.6));
      o.connect(pg).connect(g);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  }

  _noiseBurst(t, { dur = 0.08, freq = 7000, q = 4, vol = 0.05, type = 'bandpass' } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 3);
    src.stop(t + dur + 0.05);
    return { f, g };
  }

  _whoosh(t, dur = 1.2, vol = 0.07, from = 300, to = 2200) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
    f.frequency.exponentialRampToValueAtTime(from * 1.2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Public effect triggers. */
  play(name) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const box = (n, dt, v = 0.06, d = 1.4) => this._musicBox(midi(n), t + dt, v, this.sfxBus, d);
    switch (name) {
      case 'bell':
        this._bell(midi(74), t, 0.1, 4.5);
        this._bell(midi(81), t + 0.9, 0.06, 4);
        break;
      case 'sleigh':
        for (let i = 0; i < 14; i++) {
          const tt = t + i * 0.085 + (i % 2) * 0.02;
          this._noiseBurst(tt, { dur: 0.09, freq: 6500 + Math.random() * 3000, q: 6, vol: 0.05 * (1 - i / 16) });
          box(98 + (i % 3) * 2, i * 0.085, 0.012, 0.25);
        }
        break;
      case 'sparkle':
        [86, 90, 93, 95, 98, 102].forEach((n, i) => box(n, i * 0.05, 0.035, 0.9));
        break;
      case 'hover':
        box(98, 0, 0.012, 0.4);
        break;
      case 'magic':
        this._whoosh(t, 0.9, 0.035, 900, 4000);
        [81, 85, 88, 93, 97].forEach((n, i) => box(n, 0.15 + i * 0.07, 0.04, 1.6));
        break;
      case 'locked':
        box(69, 0, 0.06, 0.5);
        box(65, 0.16, 0.05, 0.6);
        this._noiseBurst(t, { dur: 0.12, freq: 900, q: 2, vol: 0.03 });
        break;
      case 'untie':
        this._whoosh(t, 0.7, 0.04, 1200, 5000);
        [90, 93, 97].forEach((n, i) => box(n, i * 0.06, 0.03, 0.8));
        break;
      case 'open':
        this._whoosh(t, 1.1, 0.05, 400, 3000);
        this._bell(midi(86), t + 0.2, 0.06, 3);
        [74, 78, 81, 86, 90, 93].forEach((n, i) => box(n, 0.25 + i * 0.06, 0.045, 2));
        break;
      case 'unlock':
        [62, 66, 69, 74, 78, 81, 86].forEach((n, i) => box(n, i * 0.11, 0.06, 2.4));
        this._bell(midi(62), t + 0.8, 0.09, 5);
        this._pad(midi(50), t, 3, 0.03);
        this._pad(midi(57), t, 3, 0.03);
        break;
      case 'shooting':
        this._whoosh(t, 1.6, 0.05, 2000, 7000);
        [93, 98, 102, 105].forEach((n, i) => box(n, 0.3 + i * 0.09, 0.03, 1.5));
        break;
      case 'firework': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.7);
        o.connect(g).connect(this.sfxBus);
        o.start(t);
        o.stop(t + 0.8);
        for (let i = 0; i < 18; i++) {
          this._noiseBurst(t + 0.15 + Math.random() * 0.9, { dur: 0.03, freq: 3000 + Math.random() * 5000, q: 1, vol: 0.03 });
        }
        break;
      }
      case 'wish':
        [69, 74, 78, 81, 86, 90, 93, 98].forEach((n, i) => box(n, i * 0.09, 0.045, 2.2));
        this._whoosh(t + 0.3, 2.2, 0.04, 500, 5000);
        break;
      case 'shake':
        for (let i = 0; i < 6; i++) this._noiseBurst(t + i * 0.07, { dur: 0.1, freq: 2500 + i * 400, q: 1.5, vol: 0.035 });
        [86, 90, 93].forEach((n, i) => box(n, 0.2 + i * 0.08, 0.03, 1.2));
        break;
      case 'whoosh':
        this._whoosh(t, 1.4, 0.06, 250, 1800);
        break;
      case 'click':
        box(93, 0, 0.025, 0.4);
        break;
      default:
        break;
    }
  }

  dispose() {
    clearInterval(this._timer);
    if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
    this.ctx?.close();
    this.ctx = null;
    this.ready = false;
  }
}
