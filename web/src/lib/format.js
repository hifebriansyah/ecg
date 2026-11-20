import { locale, t } from './i18n.jsx';

// Display helpers. Times come from the API as ms since 1970 (UTC) and are shown in WIB (Asia/Jakarta).
const TZ = 'Asia/Jakarta';
// Formatters are created lazily and cached per language, so dates follow the current language.
const cache = new Map();
const fmtr = (name, opts) => {
  const key = `${locale()}|${name}`;
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(locale(), opts));
  return cache.get(key);
};
const dateFmt = () => fmtr('date', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = () => fmtr('time', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const hmFmt = () => fmtr('hm', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const longDateFmt = () => fmtr('long', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });

export const fmtDate = (ms) => (ms ? dateFmt().format(ms) : '—');
export const fmtTime = (ms) => (ms ? `${timeFmt().format(ms).replace(/\./g, ':')} WIB` : '—');
export const fmtHM = (ms) => (ms ? `${hmFmt().format(ms).replace(/\./g, ':')} WIB` : '—');
export const fmtDateTime = (ms) => (ms ? `${fmtDate(ms)}, ${hmFmt().format(ms).replace(/\./g, ':')} WIB` : '—');
export const fmtBirth = (ymd) => (ymd ? longDateFmt().format(new Date(`${ymd}T00:00:00Z`)) : '—');

// "18j 42m"
export function fmtDuration(ms) {
  if (ms == null) return '—';
  const m = Math.max(0, Math.round(ms / 60000));
  return t('{h}j {m}m', { h: Math.floor(m / 60), m: m % 60 });
}

// For <input type="datetime-local">: ms -> "2026-11-17T08:30" in WIB, and back.
export function toLocalInput(ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(ms).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}
export const fromLocalInput = (value) => (value ? Date.parse(`${value}:00+07:00`) : null);

// "dr. Andi Pratama, Sp.JP (K)" -> "AP"; "Ns. Siti Sarah, S.Kep" -> "SS"
export function initials(name = '') {
  const words = String(name).split(',')[0].split(/\s+/).filter((w) => w && !/\.$/.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
}

export const sexLabel = (s) => (s === 'M' ? t('Laki-laki') : s === 'F' ? t('Perempuan') : '—');
export const sexShort = (s) => (s === 'M' ? t('L') : s === 'F' ? t('P') : '?');

export const DOCTOR_STATUS = { active: 'Aktif', leave: 'Cuti', inactive: 'Nonaktif' };
export const SIMPLE_STATUS = { active: 'Aktif', inactive: 'Nonaktif' };
export const SHIFTS = { morning: 'Pagi (07:00 - 14:30)', afternoon: 'Siang (14:00 - 21:00)', night: 'Malam (20:30 - 07:30)' };
export const SESSION_STATUS = { running: 'Sedang Berjalan', completed: 'Selesai' };

// Rhythm/BPM -> colour of the ECG line (teal normal, cyan slow, amber fast/abnormal).
export function rhythmTone(bpm, rhythm = '') {
  const r = rhythm.toLowerCase();
  if (bpm == null) return 'idle';
  if (bpm > 100 || /elevat|takikard|tachy|af|fibril|vt|pvc/.test(r)) return 'warn';
  if (bpm < 60 || /brady/.test(r)) return 'slow';
  return 'ok';
}
export const TONE_COLOR = { ok: '#2ee6c5', slow: '#38d2f0', warn: '#f5b934', idle: '#6e797b' };
