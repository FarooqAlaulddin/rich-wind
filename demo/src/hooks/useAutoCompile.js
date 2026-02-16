import { useRef, useEffect, useCallback } from 'preact/hooks';

export function useAutoCompile({ enabled, getValues, onCompile, delay = 500 }) {
  const lastRef = useRef('');
  const timerRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onCompileRef = useRef(onCompile);
  onCompileRef.current = onCompile;
  const getValuesRef = useRef(getValues);
  getValuesRef.current = getValues;

  const schedule = useCallback(() => {
    if (!enabledRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const vals = getValuesRef.current();
      const key = JSON.stringify(vals);
      if (key !== lastRef.current) {
        lastRef.current = key;
        onCompileRef.current(vals);
      }
    }, delay);
  }, [delay]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return { schedule };
}
