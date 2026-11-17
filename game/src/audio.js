// Every sound is synthesised with WebAudio: no audio files, no network, and the
// whole soundscape costs one small noise buffer. Created lazily on the first user
// gesture, so a browser never blocks on it.
export function createAudio() {
  let context = null;
  let noise = null;
  let master = null;

  function ensure() {
    if (context) return context;
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return null;
    context = new AC();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
    const length = context.sampleRate;
    noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return context;
  }

  function burst(when, duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + duration + 0.05);
  }

  function tone(when, freq, duration, gainValue, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, when);
    if (slideTo > 0) oscillator.frequency.exponentialRampToValueAtTime(slideTo, when + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.05);
  }

  function now() {
    return ensure() ? context.currentTime : 0;
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    shot(kind) {
      if (!ensure()) return;
      const t = now();
      if (kind === 'rifle') {
        burst(t, 0.12, 900, 0.9);
        tone(t, 160, 0.1, 0.5, 'square', 60);
      } else if (kind === 'smg') {
        burst(t, 0.09, 1400, 0.7);
        tone(t, 200, 0.07, 0.35, 'square', 90);
      } else {
        burst(t, 0.14, 700, 0.8);
        tone(t, 130, 0.12, 0.5, 'square', 50);
      }
    },
    dry() {
      if (!ensure()) return;
      tone(now(), 1400, 0.03, 0.25, 'square');
    },
    reload() {
      if (!ensure()) return;
      const t = now();
      tone(t, 900, 0.04, 0.3, 'square');
      tone(t + 0.35, 700, 0.04, 0.3, 'square');
      tone(t + 0.8, 1100, 0.05, 0.35, 'square');
    },
    hit(head) {
      if (!ensure()) return;
      tone(now(), head ? 2200 : 1500, 0.06, 0.4, 'sine');
    },
    hurt() {
      if (!ensure()) return;
      tone(now(), 110, 0.15, 0.5, 'sawtooth', 70);
    },
    step() {
      if (!ensure()) return;
      burst(now(), 0.05, 400, 0.12);
    },
    grenadePin() {
      if (!ensure()) return;
      tone(now(), 1800, 0.04, 0.3, 'square');
    },
    explosion() {
      if (!ensure()) return;
      const t = now();
      burst(t, 0.9, 300, 1.4);
      tone(t, 90, 0.8, 0.9, 'sine', 35);
    },
    plantBeep(final) {
      if (!ensure()) return;
      tone(now(), final ? 1600 : 1100, final ? 0.25 : 0.08, 0.35, 'square');
    },
    bombBeep() {
      if (!ensure()) return;
      tone(now(), 1300, 0.07, 0.3, 'square');
    },
    buy() {
      if (!ensure()) return;
      const t = now();
      tone(t, 880, 0.08, 0.3, 'sine');
      tone(t + 0.09, 1320, 0.12, 0.3, 'sine');
    },
    roundWin() {
      if (!ensure()) return;
      const t = now();
      tone(t, 523, 0.14, 0.35, 'sine');
      tone(t + 0.14, 659, 0.14, 0.35, 'sine');
      tone(t + 0.28, 784, 0.22, 0.4, 'sine');
    },
    roundLose() {
      if (!ensure()) return;
      const t = now();
      tone(t, 392, 0.18, 0.35, 'sine');
      tone(t + 0.18, 311, 0.28, 0.35, 'sine');
    },
  };
}
