import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { route, warm, availability, status, resetForTests, cacheSize, CACHE_MAX, cacheSet } from '../lexical-demo/src/ai/nano.js';
import { ROUTER_IDS, ROUTER_SCHEMA } from '../lexical-demo/src/ai/prompt.js';
import { ROUTER_RECIPE } from '../lexical-demo/src/search/recipes.js';

function mockLM({ avail = 'available', reply = '{"intent":"mood_calm"}', delay = 0, createFails = false } = {}) {
  const prompts = [];
  const mk = () => ({
    prompt: vi.fn((text, o) => new Promise((res, rej) => {
      prompts.push({ text, o });
      const t = setTimeout(() => res(typeof reply === 'function' ? reply() : reply), delay);
      o?.signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('abort')); });
    })),
    clone: vi.fn(async () => mk()),
    destroy: vi.fn(),
  });
  globalThis.LanguageModel = {
    availability: vi.fn(async () => avail),
    create: vi.fn(async () => { if (createFails) throw new Error('no'); return mk(); }),
    prompts,
  };
  return globalThis.LanguageModel;
}

beforeEach(() => resetForTests());
afterEach(() => { delete globalThis.LanguageModel; vi.useRealTimers(); });

describe('router ids', () => {
  it('schema enum is the 22 ids plus none, all mapped to recipes', () => {
    expect(ROUTER_IDS.length).toBe(22);
    expect(ROUTER_SCHEMA.properties.intent.enum.length).toBe(23);
    expect(Object.keys(ROUTER_RECIPE).sort()).toEqual([...ROUTER_IDS].sort());
  });
});

describe('route', () => {
  it('available: returns the id and passes the enum constraint', async () => {
    const LM = mockLM();
    const r = await route('zen vibes');
    expect(r).toEqual({ id: 'mood_calm' });
    expect(LM.prompts[0].o.responseConstraint).toBe(ROUTER_SCHEMA);
    expect(status()).toBe('ready');
  });
  it('caches repeated queries and creates the session once', async () => {
    const LM = mockLM();
    await route('zen vibes');
    const again = await route('Zen Vibes');
    expect(again.cached).toBe(true);
    await route('other words');
    expect(LM.create).toHaveBeenCalledTimes(1);
  });
  it('downloadable: no session without consent, one with it', async () => {
    const LM = mockLM({ avail: 'downloadable' });
    expect(await availability()).toBe('downloadable');
    expect(await route('x')).toEqual({ error: 'unavailable' });
    expect(LM.create).not.toHaveBeenCalled();
    resetForTests();
    expect(await warm({ allowDownload: true })).toBeTruthy();
    expect(LM.create).toHaveBeenCalledTimes(1);
  });
  it('unavailable and missing API', async () => {
    mockLM({ avail: 'unavailable' });
    expect(await route('x')).toEqual({ error: 'unavailable' });
    expect(status()).toBe('unavailable');
    resetForTests(); delete globalThis.LanguageModel;
    expect(await availability()).toBe('unavailable');
    expect(await route('y')).toEqual({ error: 'unavailable' });
  });
  it('create failure marks unavailable for the page', async () => {
    const LM = mockLM({ createFails: true });
    expect(await route('x')).toEqual({ error: 'unavailable' });
    expect(await route('y')).toEqual({ error: 'unavailable' });
    expect(LM.create).toHaveBeenCalledTimes(1);
  });
  it('timeout after 3 s', async () => {
    mockLM({ delay: 10000 });
    vi.useFakeTimers();
    const p = route('slow');
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toEqual({ error: 'timeout' });
  });
  it('malformed JSON and unknown ids become none', async () => {
    mockLM({ reply: 'not json' });
    expect(await route('a')).toEqual({ id: null });
    mockLM({ reply: '{"intent":"mood_invented"}' });
    resetForTests();
    expect(await route('b')).toEqual({ id: null });
  });
  it('"none" answer', async () => {
    mockLM({ reply: '{"intent":"none"}' });
    expect(await route('capital of France')).toEqual({ id: null });
  });
  it('abort signal cancels', async () => {
    mockLM({ delay: 1000 });
    const ctl = new AbortController();
    const p = route('abortable', { signal: ctl.signal });
    await new Promise((r) => setTimeout(r, 20));
    ctl.abort();
    expect(await p).toEqual({ error: 'aborted' });
  });
  it('LRU is bounded', () => {
    for (let i = 0; i < CACHE_MAX + 20; i++) cacheSet('k' + i, null);
    expect(cacheSize()).toBe(CACHE_MAX);
  });
});
