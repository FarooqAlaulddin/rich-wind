import { useEffect, useState, useCallback } from 'preact/hooks';
import { useLocalStorage } from './useLocalStorage';

const STORAGE_KEY = 'rw-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readSystemDark() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(DARK_QUERY).matches;
}

function applyThemeToDocument(isDark) {
  if (typeof document === 'undefined') return;

  const colorScheme = isDark ? 'dark' : 'light';
  document.documentElement?.classList.toggle('theme-dark', isDark);
  document.documentElement?.style.setProperty('color-scheme', colorScheme);

  if (document.body) {
    document.body.classList.toggle('theme-dark', isDark);
    document.body.style.setProperty('color-scheme', colorScheme);
  }
}

export function useThemeMode() {
  const [theme, setTheme] = useLocalStorage(STORAGE_KEY, null);
  const [systemDark, setSystemDark] = useState(readSystemDark);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(DARK_QUERY);
    const handleChange = (event) => setSystemDark(event.matches);

    setSystemDark(media.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  const mode = theme === 'dark' || theme === 'light' ? theme : null;
  const isDark = mode === 'dark' || (mode === null && systemDark);

  useEffect(() => {
    applyThemeToDocument(isDark);
  }, [isDark]);

  const setDarkEnabled = useCallback((enabled) => {
    setTheme(enabled ? 'dark' : 'light');
  }, [setTheme]);

  const setMode = useCallback((nextMode) => {
    if (nextMode === null || nextMode === 'system') {
      setTheme(null);
      return;
    }
    if (nextMode === 'dark' || nextMode === 'light') {
      setTheme(nextMode);
    }
  }, [setTheme]);

  return {
    isDark,
    mode,
    usingSystem: mode === null,
    setDarkEnabled,
    setMode
  };
}
