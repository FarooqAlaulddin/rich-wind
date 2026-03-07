import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'rw-lexical-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readSystemDark() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

function applyTheme(isDark) {
  if (typeof document === 'undefined') return;
  const scheme = isDark ? 'dark' : 'light';
  document.documentElement.classList.toggle('theme-dark', isDark);
  document.documentElement.style.setProperty('color-scheme', scheme);
}

export function useThemeMode() {
  const [preference, setPreference] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });
  const [systemDark, setSystemDark] = useState(readSystemDark);

  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY);
    if (!mq) return;
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDark = preference === 'dark' || (preference === null && systemDark);

  useEffect(() => { applyTheme(isDark); }, [isDark]);

  const toggle = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    setPreference(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, [isDark]);

  return { isDark, toggle };
}
