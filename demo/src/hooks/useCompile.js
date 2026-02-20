import { useState, useCallback } from 'preact/hooks';
import { compile as apiCompile, fetchCachedCss, fetchProjectCss } from '../api';
import { formatBytes } from '../format';

function getUserId() {
  const KEY = 'rw-uid';
  let uid;
  try { uid = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (!uid) {
    uid = crypto.randomUUID?.()?.replace(/-/g, '').slice(0, 8)
      || Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(KEY, uid); } catch { /* ignore */ }
  }
  return uid;
}

export function useCompile() {
  const [status, setStatus] = useState({ tone: '', message: 'Ready' });
  const [css, setCss] = useState('');
  const [classes, setClasses] = useState([]);
  const [stats, setStats] = useState({ classCount: '--', cssSize: '--', hash: '--', runLabel: 'Awaiting compile' });
  const [preview, setPreview] = useState(null);
  const [cacheBadge, setCacheBadge] = useState('Awaiting compile');
  const [loading, setLoading] = useState(false);

  const doCompile = useCallback(async ({ projectId, pageId, html, classesInput, customCss, bundle, intent }) => {
    const uid = getUserId();
    const fullProjectId = uid ? `${uid}_${projectId}` : projectId;
    const nowLabel = `Last run ${new Date().toLocaleTimeString()}`;

    if (!projectId) {
      setStatus({ tone: 'bg-rose-200 text-rose-900', message: 'Project ID required' });
      return;
    }

    setLoading(true);

    try {
      if (intent === 'cache') {
        const cachedCss = await fetchCachedCss({ projectId: fullProjectId, pageId, bundle });
        setStatus({ tone: 'bg-emerald-200 text-emerald-900', message: 'Cache hit' });
        setCacheBadge('Cache hit');
        setCss(cachedCss);
        setPreview({ html, css: cachedCss, customCss });
        setStats({ classCount: '--', cssSize: formatBytes(cachedCss.length), hash: '--', runLabel: nowLabel });
      } else if (intent === 'project') {
        const projCss = await fetchProjectCss({ projectId: fullProjectId, bundle });
        setStatus({ tone: 'bg-sky-200 text-sky-900', message: 'Project CSS ready' });
        setCacheBadge('Project CSS');
        setCss(projCss);
        setPreview({ html, css: projCss, customCss });
        setStats({ classCount: '--', cssSize: formatBytes(projCss.length), hash: '--', runLabel: nowLabel });
      } else {
        const data = await apiCompile({
          projectId: fullProjectId,
          pageId,
          html,
          classes: classesInput,
          bundle,
        });
        const compiledCss = data.css || '';
        setStatus({
          tone: data.cached ? 'bg-emerald-200 text-emerald-900' : 'bg-sky-200 text-sky-900',
          message: data.cached ? 'Cache hit' : 'Compiled',
        });
        setCacheBadge(data.cached ? 'cache hit' : 'fresh compile');
        setCss(compiledCss);
        setClasses(data.classes || []);
        setPreview({ html, css: compiledCss, customCss });
        setStats({
          classCount: data.classes?.length ?? '--',
          cssSize: formatBytes(compiledCss.length),
          hash: data.hash ? `${data.hash.slice(0, 16)}...` : '--',
          runLabel: nowLabel,
        });
      }
    } catch (err) {
      setStatus({ tone: 'bg-rose-200 text-rose-900', message: err?.message || 'Something went wrong.' });
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, css, classes, stats, preview, cacheBadge, loading, doCompile };
}
