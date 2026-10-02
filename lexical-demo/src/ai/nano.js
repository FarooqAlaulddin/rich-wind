// Gemini Nano (window.LanguageModel) as an intent router. One warmed singleton
// session, cloned per request. Everything degrades to "unavailable" silently.

import { ROUTER_IDS, ROUTER_SCHEMA, ROUTER_SYSTEM, ROUTER_SHOTS, routerPrompt,
  VARIATION_SYSTEM, variationPrompt, variationSchema } from './prompt';

export const ROUTER_TIMEOUT = 3000;
export const VARIATION_TIMEOUT = 5000;
export const CACHE_MAX = 150;

const LANG = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

let state = 'idle'; // idle | warming | ready | unavailable
let base = null;
let creating = null;
const listeners = new Set();

const cache = new Map();
export function cacheGet(k) {
  if (!cache.has(k)) return undefined;
  const v = cache.get(k);
  cache.delete(k); cache.set(k, v);
  return v;
}
export function cacheSet(k, v) {
  cache.delete(k); cache.set(k, v);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}
export function cacheSize() { return cache.size; }

function set(next) {
  if (state === next) return;
  state = next;
  listeners.forEach((f) => f(state));
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function status() { return state; }
const api = () => (typeof globalThis !== 'undefined' ? globalThis.LanguageModel : undefined);

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' */
export async function availability() {
  const LM = api();
  if (!LM || typeof LM.availability !== 'function') return 'unavailable';
  try { return (await LM.availability(LANG)) || 'unavailable'; } catch { return 'unavailable'; }
}

/** Creates the singleton once. A rejection marks the AI unavailable for this page load. */
export function warm({ allowDownload = false } = {}) {
  if (base) return Promise.resolve(base);
  if (state === 'unavailable') return Promise.resolve(null);
  if (creating) return creating;
  set('warming');
  creating = (async () => {
    try {
      const av = await availability();
      if (av === 'unavailable' || (av !== 'available' && !allowDownload)) {
        set(av === 'unavailable' ? 'unavailable' : 'idle');
        return null;
      }
      const s = await api().create({
        ...LANG,
        temperature: 0.2,
        topK: 8,
        initialPrompts: [{ role: 'system', content: ROUTER_SYSTEM }, ...ROUTER_SHOTS],
      });
      base = s;
      set('ready');
      return s;
    } catch {
      set('unavailable');
      return null;
    } finally {
      creating = null;
    }
  })();
  return creating;
}

export function destroy() {
  try { base?.destroy?.(); } catch { /* ignore */ }
  base = null; creating = null; state = 'idle';
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', destroy);

export function resetForTests() { destroy(); cache.clear(); listeners.clear(); }

function withTimeout(run, ms, signal) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => { rej(new Error('timeout')); ctl.abort(); }, ms); });
  return Promise.race([run(ctl.signal), timeout]).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  });
}

/**
 * Routes a phrase to a router id. Resolves { id } (a member of ROUTER_IDS),
 * { id: null } for "none" or any malformed answer, or { error } on timeout,
 * abort or unavailability. Never throws.
 */
export async function route(query, { signal, key } = {}) {
  const q = String(query || '').trim();
  if (!q) return { id: null };
  const ck = key || q.toLowerCase();
  const hit = cacheGet(ck);
  if (hit !== undefined) return { id: hit, cached: true };
  const s = await warm();
  if (!s) return { error: 'unavailable' };
  let session;
  try {
    session = await s.clone();
    const text = await withTimeout(
      (sig) => session.prompt(routerPrompt(q), { responseConstraint: ROUTER_SCHEMA, signal: sig }),
      ROUTER_TIMEOUT, signal);
    let id = null;
    try {
      const v = JSON.parse(text);
      if (v && ROUTER_IDS.includes(v.intent)) id = v.intent;
    } catch { /* malformed -> none */ }
    cacheSet(ck, id);
    return { id };
  } catch (e) {
    return { error: e && e.message === 'timeout' ? 'timeout' : 'aborted' };
  } finally {
    try { session?.destroy?.(); } catch { /* ignore */ }
  }
}

/** Raw variations (flagged off by default). Resolves { variations } or { error }. */
export async function variations(query, { classes = [], allowed = [], signal } = {}) {
  const s = await warm();
  if (!s) return { error: 'unavailable' };
  let session;
  try {
    session = await s.clone();
    const text = await withTimeout(
      (sig) => session.prompt(
        `${VARIATION_SYSTEM}\n${variationPrompt(query, classes, allowed)}`,
        { responseConstraint: variationSchema(allowed, classes), signal: sig }),
      VARIATION_TIMEOUT, signal);
    const v = JSON.parse(text);
    return { variations: Array.isArray(v?.variations) ? v.variations : [] };
  } catch (e) {
    return { error: e && e.message === 'timeout' ? 'timeout' : 'aborted' };
  } finally {
    try { session?.destroy?.(); } catch { /* ignore */ }
  }
}
