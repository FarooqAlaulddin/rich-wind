import { useCallback, useEffect, useRef, useState } from 'react';
import { availability, route, warm, status as nanoStatus, subscribe, variations as nanoVariations } from '../ai/nano';
import { nearest, loadSemantic } from '../search/semantic';
import { ROUTER_RECIPE, RECIPE_BY_ID, resolveRecipes } from '../search/recipes';
import { parseIntensity, wordsOf, stripFiller } from '../search/phrase';
import { repairAll } from '../ai/repair';
import { repairContext } from '../ai/context';
import { previewDeclsOf } from './useClassPreview';

export const PAUSE_MS = 450;

function flagVariations() {
  try { return window.localStorage.getItem('rw-ai-variations') === '1'; } catch { return false; }
}

const keyOf = (tokens, removed) => `${[...tokens].sort().join(' ')}|${[...(removed || [])].sort().join(' ')}`;

function itemFor(recipeId, how, ctx, why) {
  const r = RECIPE_BY_ID.get(recipeId);
  if (!r) return null;
  const res = resolveRecipes([r], ctx);
  if (!res || (!res.tokens.length && !(res.removed || []).length)) return null;
  const first = res.tokens[0] || `-${res.removed[0]}`;
  return {
    cls: first, base: res.tokens[0] || '', prefix: ctx.prefix || '', key: `ai:${how}:${recipeId}`,
    label: res.title, title: res.title, bundle: res.tokens, removed: res.removed || [],
    css: why || null, hint: `heard as: ${res.title}`, source: 'ai', how, score: 0, pop: 0, color: null,
    delta: keyOf(res.tokens, res.removed),
  };
}

/**
 * The "Ideas" row: Gemini Nano routes an unresolved phrase to a curated
 * recipe; without Nano, embeddings suggest the two nearest. Never applies
 * anything. Runs only on a pause or Enter, and only when search found nothing.
 *
 * -> { state: 'off' | 'download' | 'warming' | 'thinking' | 'ready' | 'none', items, enable, askNow, warmUp }
 */
export default function useIdeas({ enabled, query, unresolved, target, prefix }) {
  const [view, setView] = useState({ state: 'off', items: [] });
  const [nano, setNano] = useState(nanoStatus());
  const [avail, setAvail] = useState(null);
  const [nudge, setNudge] = useState(0);
  const explicit = useRef(false);
  const rid = useRef(0);
  const ctl = useRef(null);

  useEffect(() => subscribe(setNano), []);

  // Availability is cheap; ask once the shelf is in use.
  useEffect(() => {
    if (!enabled || avail) return;
    let live = true;
    availability().then((a) => { if (live) setAvail(a); });
    return () => { live = false; };
  }, [enabled, avail]);

  const warmUp = useCallback(() => {
    if (avail === 'available') warm();
    else if (avail === 'unavailable') loadSemantic();
  }, [avail]);

  const enable = useCallback(async () => {
    setView({ state: 'warming', items: [] });
    const s = await warm({ allowDownload: true });
    setAvail(s ? 'available' : 'unavailable');
  }, []);

  const askNow = useCallback(() => { explicit.current = true; setNudge((n) => n + 1); }, []);

  const q = query.trim();
  const classKey = target.classes.join(' ');

  useEffect(() => {
    ctl.current?.abort();
    const mine = ++rid.current;
    if (!enabled || !q || !unresolved || avail === null) {
      setView({ state: 'off', items: [] });
      return undefined;
    }
    if (avail === 'downloadable' || avail === 'downloading') {
      setView({ state: 'download', items: [] });
      return undefined;
    }
    const words = stripFiller(wordsOf(q));
    const { level, hedged } = parseIntensity(words);
    const ctx = { classes: target.classes, prefix, level: level || 1, hedged, kind: target.kind };
    const wasExplicit = explicit.current;
    // Ideas for the previous phrase must not stay clickable while the new one is pending.
    setView((v) => (v.items.length ? { state: 'off', items: [] } : v));
    const timer = setTimeout(async () => {
      explicit.current = false;
      const ac = new AbortController();
      ctl.current = ac;
      const stale = () => mine !== rid.current || ac.signal.aborted;
      const done = (items) => {
        if (stale()) return;
        setView(items.length ? { state: 'ready', items } : { state: wasExplicit ? 'none' : 'off', items: [] });
      };
      if (avail === 'available') {
        setView({ state: nanoStatus() === 'ready' ? 'thinking' : 'warming', items: [] });
        const r = await route(q, { signal: ac.signal, key: `${q.toLowerCase()}|${target.tag}|${classKey}|${prefix}` });
        if (stale()) return;
        const rec = r.id ? ROUTER_RECIPE[r.id] : null;
        const main = rec ? itemFor(rec, 'nano', ctx) : null;
        const items = main ? [main] : [];
        if (main && flagVariations()) {
          setView({ state: 'ready', items: [main] });
          const allowed = [...new Set([...main.bundle, ...target.classes])];
          const v = await nanoVariations(q, { classes: target.classes, allowed, signal: ac.signal });
          if (stale()) return;
          const rc = repairContext({ classes: target.classes, drawable: (t) => !!previewDeclsOf(t, target.classes) });
          for (const x of repairAll(v.variations || [], rc, [main.delta])) {
            items.push({
              cls: x.add[0] || `-${x.remove[0]}`, base: x.add[0] || '', prefix, key: `ai:var:${x.key}`, label: x.label || 'Variation',
              title: x.label || 'Variation', bundle: x.add, removed: x.remove, css: x.why ? `AI: ${x.why}` : null,
              hint: 'AI variation', source: 'ai', how: 'variation', score: 0, pop: 0, color: null, delta: x.key,
            });
          }
        }
        done(items);
      } else {
        setView({ state: 'thinking', items: [] });
        const near = await nearest(q, { signal: ac.signal });
        const seen = new Set();
        const items = [];
        for (const n of near) {
          const it = itemFor(n.id, 'semantic', ctx);
          if (it && !seen.has(it.delta)) { seen.add(it.delta); items.push({ ...it, hint: `closest match: ${n.phrase}` }); }
        }
        done(items);
      }
    }, explicit.current ? 0 : PAUSE_MS);
    return () => { clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, q, unresolved, avail, target.id, classKey, prefix, nudge]);

  useEffect(() => () => ctl.current?.abort(), []);

  return { ...view, nano, enable, askNow, warmUp };
}
