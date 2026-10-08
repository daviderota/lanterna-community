/* Lanterna · sound-effect cells ("sussurri").
   Shared by the game (lanterna/) and the editor (lanterna-editor/ keeps an identical copy).
   Each letter is an invisible floor cell: when Scintilla walks on it or right next to it, its sound plays once per level.
   Whispers.play(audioContext, destinationNode, letter) synthesizes the sound with Web Audio (noise through vowel formants). */
(function (root) {
  'use strict';
  // letter -> [name in the editor, short description]
  const KINDS = {
    W: ['Sussurro', 'Un respiro soffiato, "hhaaah", vicino all\'orecchio.'],
    Z: ['Sssh', 'Un sibilo, come qualcuno che ti zittisce nel buio. Il più discreto.'],
    P: ['Parola sussurrata', 'Due sillabe senza voce, "hha… hhii", come un nome detto piano.'],
    A: ['Respiro alle spalle', 'Un\'inspirazione breve e un soffio che passa da sinistra a destra.'],
    D: ['Sussurro lontano', 'Cupo e ovattato, con un\'eco lunga: arriva dal fondo del corridoio.'],
    N: ['Coro di sussurri', 'Tre voci soffiate che si accavallano da punti diversi. Da usare poco.'],
  };
  const LETTERS = Object.keys(KINDS).join('');

  function play(a, dest, kind) {
    if (!a || !dest || !KINDS[kind]) return;
    const t0 = a.currentTime + 0.02;
    const echo = (time, fb, mix, lpf = 1800) => {
      const dry = a.createGain(), wet = a.createGain(), d = a.createDelay(2), f = a.createGain(), lp = a.createBiquadFilter();
      d.delayTime.value = time; f.gain.value = fb; wet.gain.value = mix; lp.type = 'lowpass'; lp.frequency.value = lpf;
      dry.connect(dest); dry.connect(d); d.connect(lp).connect(f).connect(d); lp.connect(wet).connect(dest);
      return dry;
    };
    const pan = (out, from, to, t, dur) => {
      if (!a.createStereoPanner) return out;
      const p = a.createStereoPanner(); p.pan.setValueAtTime(from, t); p.pan.linearRampToValueAtTime(to, t + dur);
      p.connect(out); return p;
    };
    const env = (g, t, att, hold, rel, v) => {
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + att);
      g.gain.setValueAtTime(v, t + att + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + att + hold + rel);
    };
    const lfo = (param, rate, depth, t, dur) => {
      const o = a.createOscillator(), g = a.createGain(); o.frequency.value = rate; g.gain.value = depth;
      o.connect(g).connect(param); o.start(t); o.stop(t + dur + 0.1);
    };
    const noise = dur => {
      const n = a.createBufferSource(), buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      n.buffer = buf; return n;
    };
    // one breathy voice: noise through two vowel formants that follow steps [[time, f1, f2], ...]
    const breath = (out, t, steps, att, hold, rel, peak, q1 = 6, q2 = 8, hpf = 400) => {
      const dur = att + hold + rel, n = noise(dur + 0.1), g = a.createGain(), hp = a.createBiquadFilter();
      const f1 = a.createBiquadFilter(), f2 = a.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = hpf;
      f1.type = 'bandpass'; f1.Q.value = q1; f2.type = 'bandpass'; f2.Q.value = q2;
      steps.forEach(([s, a1, a2], i) => {
        const fn = i ? 'linearRampToValueAtTime' : 'setValueAtTime';
        f1.frequency[fn](a1, t + s); f2.frequency[fn](a2, t + s);
      });
      env(g, t, att, hold, rel, peak);
      n.connect(hp); hp.connect(f1); hp.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
      n.start(t); n.stop(t + dur + 0.05);
      return g;
    };

    if (kind === 'W') {          // the first whisper: "hhaaah"
      const g = breath(echo(0.12, 0.2, 0.25), t0, [[0, 500, 1600], [0.5, 800, 1200], [1.3, 650, 1050]], 0.25, 0.5, 0.6, 0.22);
      lfo(g.gain, 7, 0.05, t0, 1.4);
    } else if (kind === 'Z') {   // "sssh": a high hiss with a band sweeping down
      const n = noise(1.4), hp = a.createBiquadFilter(), bp = a.createBiquadFilter(), g = a.createGain();
      hp.type = 'highpass'; hp.frequency.value = 1800;
      bp.type = 'bandpass'; bp.Q.value = 2.5; bp.frequency.setValueAtTime(3200, t0); bp.frequency.linearRampToValueAtTime(2500, t0 + 0.6); bp.frequency.linearRampToValueAtTime(2200, t0 + 1.3);
      env(g, t0, 0.35, 0.35, 0.55, 0.2);
      lfo(g.gain, 5, 0.04, t0, 1.3);
      n.connect(hp).connect(bp).connect(g).connect(echo(0.1, 0.15, 0.2, 5000));
      n.start(t0); n.stop(t0 + 1.35);
    } else if (kind === 'P') {   // two voiceless syllables: "hha ... hhii"
      const out = echo(0.14, 0.25, 0.28);
      breath(out, t0, [[0, 650, 1300], [0.25, 850, 1250]], 0.12, 0.22, 0.28, 0.22);
      breath(out, t0 + 0.72, [[0, 420, 2000], [0.2, 320, 2400], [0.7, 300, 2300]], 0.1, 0.3, 0.45, 0.17, 7, 10);
    } else if (kind === 'A') {   // a quiet inhale, then an exhale that crosses from left to right
      const out = echo(0.1, 0.2, 0.2), t1 = t0 + 0.65;
      breath(pan(out, -0.6, -0.4, t0, 0.6), t0, [[0, 450, 1100], [0.5, 600, 1500]], 0.35, 0.05, 0.15, 0.08, 4, 5, 700);
      const g = breath(pan(out, -0.8, 0.8, t1, 1.1), t1, [[0, 750, 1250], [0.5, 650, 1100], [1.1, 520, 950]], 0.08, 0.35, 0.7, 0.24, 5, 6);
      lfo(g.gain, 6, 0.04, t1, 1.1);
    } else if (kind === 'D') {   // far away: darker, muffled, long echo
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(echo(0.32, 0.5, 0.55, 900));
      const g = breath(lp, t0, [[0, 420, 900], [0.6, 620, 1000], [1.4, 480, 820]], 0.45, 0.45, 0.6, 0.2, 5, 6, 250);
      lfo(g.gain, 4.5, 0.05, t0, 1.5);
    } else if (kind === 'N') {   // chorus: three overlapping voices, left, right, centre
      const out = echo(0.18, 0.3, 0.3);
      const voices = [
        [0.00, -0.7, [[0, 600, 1500], [0.5, 800, 1200], [1.1, 620, 1050]], 0.16],
        [0.35,  0.7, [[0, 380, 2100], [0.4, 330, 2400], [1.0, 450, 1900]], 0.13],
        [0.70,  0.0, [[0, 520, 900],  [0.5, 700, 1150], [1.2, 480, 850]], 0.15],
      ];
      for (const [d, p, steps, peak] of voices) {
        const g = breath(pan(out, p, p * 0.6, t0 + d, 1.3), t0 + d, steps, 0.2, 0.45, 0.6, peak);
        lfo(g.gain, 5 + d * 4, 0.035, t0 + d, 1.3);
      }
    }
  }

  const Whispers = { KINDS, LETTERS, play };
  if (typeof module !== 'undefined' && module.exports) module.exports = Whispers;
  else root.Whispers = Whispers;
})(typeof window !== 'undefined' ? window : this);
