// Synthetic ECG for the Konfigurasi > Simulator page: same beat model as tools/seed_demo.py (P, Q, R, S, T as Gaussians, in µV),
// continuous across chunks, 250 Hz. Scenarios follow the testing guide: normal sinus, sinus tachycardia, AFib, electrode off.
export const HZ = 250;
const WAVES = [[-0.20, 0.025, 150], [-0.035, 0.010, -120], [0.0, 0.011, 1150], [0.035, 0.012, -280], [0.26, 0.045, 320]];

// Indonesian keys: pass through t() when rendered.
export const SCENARIOS = {
  normal: { label: 'Normal Sinus Rhythm', hint: '60–80 BPM, grafik bersih, status normal', bpm: [60, 80, 72] },
  tachy: { label: 'Sinus Tachycardia', hint: '100–120+ BPM, irama teratur (tidak boleh alarm AFib palsu)', bpm: [90, 150, 110] },
  afib: { label: 'Atrial Fibrillation (AFib)', hint: 'Interval R-R acak, tanpa gelombang P', bpm: [80, 160, 120] },
  leadoff: { label: 'Elektroda Terlepas (Lead-Off)', hint: 'Sinyal datar (flatline)', bpm: [0, 0, 0] },
};

// Gaussian noise (Box-Muller)
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

export function createGenerator(scenario, bpm) {
  let i = 0; // next sample index (time = i / HZ)
  const beats = []; // beat centres (s)
  let nextBeat = 0.4;
  const rrFor = () => {
    const rr = 60 / bpm;
    return scenario === 'afib' ? rr * (0.55 + 0.9 * Math.random()) : rr * (1 + 0.02 * gauss());
  };
  const phase = [Math.random() * 6.28, Math.random() * 6.28];
  return {
    // n samples (as integers, µV); returns { samples, bpm } where bpm is what a device would report
    next(n) {
      const t0 = i / HZ; const t1 = (i + n) / HZ;
      if (scenario !== 'leadoff') while (nextBeat < t1 + 1) { beats.push(nextBeat); nextBeat += rrFor(); }
      while (beats.length && beats[0] < t0 - 1) beats.shift();
      const out = new Array(n);
      for (let k = 0; k < n; k++) {
        const t = (i + k) / HZ;
        let v;
        if (scenario === 'leadoff') v = gauss() * 3;
        else {
          v = 35 * Math.sin(2 * Math.PI * 0.25 * t) + gauss() * 8;
          for (const b of beats) {
            const d = t - b;
            if (d < -0.35 || d > 0.55) continue;
            for (const [mu, s, a] of WAVES) { if (scenario === 'afib' && mu === -0.20) continue; v += a * Math.exp(-((d - mu) ** 2) / (2 * s * s)); }
          }
          if (scenario === 'afib') v += 40 * Math.sin(2 * Math.PI * 6 * t + phase[0]) + 25 * Math.sin(2 * Math.PI * 8.7 * t + phase[1]);
        }
        out[k] = Math.round(v);
      }
      i += n;
      return { samples: out, bpm: scenario === 'leadoff' ? 0 : Math.round(bpm + (scenario === 'afib' ? 6 * gauss() : gauss())) };
    },
  };
}
