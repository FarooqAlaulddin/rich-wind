import { useState, useCallback } from 'preact/hooks';

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const set = useCallback((next) => {
    setValue((prev) => {
      const val = typeof next === 'function' ? next(prev) : next;
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch { /* ignore */ }
      return val;
    });
  }, [key]);

  const remove = useCallback(() => {
    setValue(initialValue);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }, [key, initialValue]);

  return [value, set, remove];
}
