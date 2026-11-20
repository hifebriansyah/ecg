// Display filters for the ECG viewer ("Penghalus"). Zero-phase (every filter runs forward and backward), so the QRS keeps its position and
// shape in time. All modes remove the 50 Hz mains hum (notch) and the baseline drift (high-pass 0.5 Hz), then cut high-frequency noise:
//   f40  standard diagnostic band 0.5-40 Hz     f25  smoother     f15  smoothest (rounds off sharp QRS peaks a little)
// This only changes what is drawn; the stored recording is untouched.
export const FILTERS = {
  off: { label: 'Mati (mentah)', lp: 0 },
  f40: { label: '0.5–40 Hz (standar)', lp: 40 },
  f25: { label: '0.5–25 Hz (halus)', lp: 25 },
  f15: { label: '0.5–15 Hz (sangat halus)', lp: 15 },
};

// RBJ audio-EQ-cookbook biquads
function biquad(type, f0, fs, q) {
  const w0 = (2 * Math.PI * f0) / fs; const c = Math.cos(w0); const al = Math.sin(w0) / (2 * q);
  let b0; let b1; let b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = 1; b1 = -2 * c; b2 = 1; } // notch
  const a0 = 1 + al;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 };
}
function pass(x, bq) { // transposed direct form II, one direction
  const y = new Float64Array(x.length); let z1 = 0; let z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const out = bq.b0 * x[i] + z1;
    z1 = bq.b1 * x[i] - bq.a1 * out + z2; z2 = bq.b2 * x[i] - bq.a2 * out; y[i] = out;
  }
  return y;
}
const reverse = (a) => { const r = new Float64Array(a.length); for (let i = 0; i < a.length; i++) r[i] = a[a.length - 1 - i]; return r; };
const zeroPhase = (x, bq) => reverse(pass(reverse(pass(x, bq)), bq));

export function filterSamples(samples, hz, mode) {
  const f = FILTERS[mode];
  if (!f || !f.lp || samples.length < 8) return samples;
  // pad both ends by mirroring (odd reflection) so the filters do not ring at the edges
  const pad = Math.min(samples.length - 1, Math.round(hz * 2));
  const n = samples.length; const x = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) { x[i] = 2 * samples[0] - samples[pad - i]; x[n + pad + i] = 2 * samples[n - 1] - samples[n - 2 - i]; }
  for (let i = 0; i < n; i++) x[pad + i] = samples[i];
  let y = zeroPhase(x, biquad('notch', 50, hz, 25));
  y = zeroPhase(y, biquad('hp', 0.5, hz, 0.707));
  y = zeroPhase(y, biquad('lp', Math.min(f.lp, hz / 2 - 1), hz, 0.707));
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(y[pad + i]);
  return out;
}

// Filter chunks as continuous runs (a chunk boundary is not an edge), then cut the result back into the same chunks.
export function filterChunks(chunks, hz, mode) {
  if (!FILTERS[mode] || !FILTERS[mode].lp || !chunks.length) return chunks;
  const dt = 1000 / hz; const sorted = [...chunks].sort((a, b) => a.started_at - b.started_at);
  const runs = []; let run = [];
  for (const c of sorted) {
    const prev = run[run.length - 1];
    if (prev && Math.abs(c.started_at - (prev.started_at + prev.samples.length * dt)) > 2 * dt) { runs.push(run); run = []; }
    run.push(c);
  }
  runs.push(run);
  const out = [];
  for (const r of runs) {
    const all = []; for (const c of r) for (const v of c.samples) all.push(v);
    const filtered = filterSamples(all, hz, mode);
    let k = 0;
    for (const c of r) { out.push({ started_at: c.started_at, samples: filtered.slice(k, k + c.samples.length) }); k += c.samples.length; }
  }
  return out;
}
