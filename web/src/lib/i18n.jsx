import { useAuth } from './auth.jsx';
import EN from '../i18n/en.js';

// Two languages: 'id' (the source strings, default) and 'en'. The key of every string IS its Indonesian text;
// the English text lives in src/i18n/en*.js. A missing English entry falls back to the Indonesian text.
//   t('Simpan')                       -> "Save" in English
//   t('Sisa {time}', { time: '2 j' }) -> "{time} left" with the value filled in
// Strings kept in module-level constants must hold the Indonesian key and be passed through t() when rendered,
// because t() reads the current language each time it is called.
const STORE = 'ecg.lang';
let current = 'id';
try { current = localStorage.getItem(STORE) === 'en' ? 'en' : 'id'; } catch { /* storage blocked */ }

export const getLang = () => current;
export const locale = () => (current === 'en' ? 'en-GB' : 'id-ID');

export function setLang(lang) {
  current = lang === 'en' ? 'en' : 'id';
  try { localStorage.setItem(STORE, current); } catch { /* storage blocked */ }
}

export function t(text, vars) {
  let s = (current === 'en' && EN[text]) || text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// Wrap the app: follows the signed-in user's saved language and re-mounts the tree when it changes,
// so every t() call renders again. Signed-out screens use the choice kept in this browser.
export function LangGate({ children }) {
  const { user } = useAuth();
  if (user && user.language && user.language !== current) setLang(user.language);
  return <div key={current} className="contents">{children}</div>;
}
