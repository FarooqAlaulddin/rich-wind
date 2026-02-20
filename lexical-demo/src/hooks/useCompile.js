import { useState, useCallback } from 'react';
import { compile as apiCompile } from '../api';

export function useCompile() {
  const [css, setCss] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);

  const doCompile = useCallback(async ({ html: newHtml, classes }) => {
    setHtml(newHtml);
    if (!classes || classes.length === 0) {
      setCss('');
      setCached(false);
      return;
    }

    setLoading(true);
    try {
      const data = await apiCompile({
        projectId: 'lexical-demo',
        pageId: 'editor',
        html: newHtml,
        classes,
      });
      setCss(data.css || '');
      setCached(!!data.cached);
    } catch (err) {
      console.error('Compile error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { css, html, loading, cached, doCompile };
}
