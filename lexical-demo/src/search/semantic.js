// Embedding fallback for browsers without Gemini Nano. Candidates only: it
// never produces a primary result and never runs for direction, negation or
// undo words. The model and runtime load lazily from a CDN on first use.
//
// Measured offline: bge-small-en-v1.5 q8 gives 12/20 top-1 and 14/20 top-2.
// MIN_SCORE below is provisional and has not been measured.

import { recipePhrases } from './recipes';
import { DIRECTION_LABELS, NEG_VERBS, UNDO_PHRASES, TOO_WORDS, wordsOf } from './phrase';

export const MODEL = 'Xenova/bge-small-en-v1.5';
export const RUNTIME_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm';
export const MIN_SCORE = 0.5;
export const TOP = 2;
const NEG_NOUN_WORDS = new Set(['no', 'not', 'without', 'less', 'more', 'un', 'non']);

let state = 'idle'; // idle | loading | ready | failed
let loading = null;
let extractor = null;
let index = null; // [{ phrase, id, vec }]
const memo = new Map();

export function semanticStatus() { return state; }

/** True when the words carry direction, negation or undo meaning, which embeddings get wrong. */
export function blockedWords(words) {
  const ws = Array.isArray(words) ? words : wordsOf(String(words || ''));
  const joined = ws.join(' ');
  if (UNDO_PHRASES.has(joined)) return true;
  return ws.some((w) => !!DIRECTION_LABELS[w] || NEG_VERBS.has(w) || !!TOO_WORDS[w] || NEG_NOUN_WORDS.has(w));
}

export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vectors are normalised
}

/** Ranks `index` by similarity to `vec`; one entry per recipe id, best first. */
export function rank(vec, idx, { top = TOP, min = MIN_SCORE } = {}) {
  const best = new Map();
  for (const e of idx) {
    const s = cosine(vec, e.vec);
    const cur = best.get(e.id);
    if (!cur || s > cur.score) best.set(e.id, { id: e.id, phrase: e.phrase, score: s });
  }
  return [...best.values()].filter((x) => x.score >= min).sort((a, b) => b.score - a.score).slice(0, top);
}

async function embed(text) {
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

/** Loads the runtime and embeds every curated phrase once. Safe to call repeatedly. */
export function loadSemantic() {
  if (state === 'ready') return Promise.resolve(true);
  if (state === 'failed') return Promise.resolve(false);
  if (loading) return loading;
  state = 'loading';
  loading = (async () => {
    try {
      const mod = await import(/* @vite-ignore */ RUNTIME_URL);
      const device = typeof navigator !== 'undefined' && navigator.gpu ? 'webgpu' : 'wasm';
      try {
        extractor = await mod.pipeline('feature-extraction', MODEL, { dtype: 'q8', device });
      } catch (e) {
        if (device === 'wasm') throw e;
        extractor = await mod.pipeline('feature-extraction', MODEL, { dtype: 'q8', device: 'wasm' });
      }
      const list = recipePhrases();
      const outs = await extractor(list.map((p) => p.phrase), { pooling: 'mean', normalize: true });
      const dim = outs.dims[1];
      index = list.map((p, i) => ({ ...p, vec: Array.from(outs.data.slice(i * dim, (i + 1) * dim)) }));
      state = 'ready';
      return true;
    } catch {
      state = 'failed';
      return false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/**
 * Up to two nearest curated recipes for an unresolved phrase:
 * [{ id, phrase, score }]. Resolves [] when blocked, not ready, or below cutoff.
 */
export async function nearest(query, { signal } = {}) {
  const ws = wordsOf(String(query || ''));
  if (!ws.length || blockedWords(ws)) return [];
  const key = ws.join(' ');
  if (memo.has(key)) return memo.get(key);
  if (!(await loadSemantic()) || signal?.aborted) return [];
  const vec = await embed(key);
  if (signal?.aborted) return [];
  const res = rank(vec, index);
  memo.set(key, res);
  return res;
}

export function resetSemanticForTests() { state = 'idle'; loading = null; extractor = null; index = null; memo.clear(); }
