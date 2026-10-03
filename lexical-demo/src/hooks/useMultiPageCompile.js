import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  compile as apiCompile,
  getPageCss,
  getProjectCss,
  fetchPromotedCss,
  fetchPromotedStats,
} from '../api';

const PROJECT_ID = 'lexical-demo';
const STORAGE_KEY = 'rw-lexical-demo-v4';
const SHARED_REFRESH_DELAY_MS = 550;
const EMPTY_RESULT = { classes: [], rejected: [], cached: false, ms: null, freshMs: null, at: 0 };

// --- Default page content builders ---

function makeEditorState(children) {
  return {
    root: {
      children,
      direction: 'ltr', format: '', indent: 0, type: 'root', version: 1,
    },
  };
}

function textNode(text) {
  return { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '' };
}

function spanNode(text, classes) {
  return { type: 'tailwind-span', text, tailwindClasses: classes, format: 0, detail: 0, mode: 'normal', style: '' };
}

function heading(tag, classes, children) {
  return { type: 'styled-heading', tag, tailwindClasses: classes, children, direction: 'ltr', format: '', indent: 0, version: 1 };
}

function para(classes, children) {
  return { type: 'styled-paragraph', tailwindClasses: classes, children, direction: 'ltr', format: '', indent: 0, version: 1 };
}

// The three sample pages summarise Rich Wind itself, and every class on them
// is compiled live by it. The nav, chip, headings and footer repeat on every
// page, so those classes are shared across the project; each page also has
// utilities of its own (gradient headline, numbered steps, code block).
const DARK = '[.theme-dark_&]:';
const SHARED = {
  nav: `flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-slate-200 pb-3 text-sm text-slate-500 ${DARK}border-slate-700 ${DARK}text-slate-400`,
  brand: `mr-auto text-base font-extrabold tracking-tight text-slate-900 ${DARK}text-white`,
  link: `cursor-pointer hover:text-indigo-600 ${DARK}hover:text-indigo-300`,
  chip: 'mt-8 w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ring-1',
  title: `font-extrabold leading-tight tracking-tight text-slate-900 ${DARK}text-white`,
  body: `max-w-prose text-lg leading-relaxed text-slate-600 ${DARK}text-slate-300`,
  footer: `mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400 ${DARK}border-slate-700`,
};

function nav(current) {
  return para(SHARED.nav, [
    spanNode('Rich Wind', SHARED.brand),
    ...['Overview', 'How it works', 'Use it'].map((label) => spanNode(
      label,
      label === current ? `font-semibold text-indigo-600 ${DARK}text-indigo-300` : SHARED.link,
    )),
  ]);
}

const footer = () => para(SHARED.footer, [textNode('Every class on these pages was compiled by Rich Wind while the page loaded. Click any line to see its classes and the CSS they became.')]);

const card = (title, text) => [
  spanNode(title, `rounded-t-2xl bg-white px-5 pt-5 font-bold text-slate-900 ${DARK}bg-slate-800 ${DARK}text-white`),
  spanNode(text, `rounded-b-2xl bg-white px-5 pt-1 pb-5 text-sm leading-6 text-slate-600 shadow-sm ${DARK}bg-slate-800 ${DARK}text-slate-300`),
];

const step = (n, title, text) => para(`mt-5 flex items-start gap-4`, [
  spanNode(String(n), 'grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-cyan-500 to-blue-600 font-bold text-white shadow-md shadow-cyan-500/30'),
  spanNode(title, `w-32 shrink-0 pt-1.5 font-bold text-slate-900 ${DARK}text-white`),
  spanNode(text, `pt-1.5 leading-relaxed text-slate-600 ${DARK}text-slate-300`),
]);

const pill = (text, color) => spanNode(text, `rounded-md px-2.5 py-1 ${color}`);
const op = (text) => spanNode(text, 'text-slate-400');

const code = (text, extra = '') => spanNode(text, `whitespace-pre ${extra}`);

const endpoint = (route, what) => [
  spanNode(route, `font-mono font-semibold text-emerald-700 ${DARK}text-emerald-300`),
  spanNode(what, `text-slate-600 ${DARK}text-slate-300`),
];

const DEFAULT_CONTENT = {
  home: makeEditorState([
    nav('Overview'),
    para(`${SHARED.chip} bg-indigo-50 text-indigo-700 ring-indigo-200 ${DARK}bg-indigo-950 ${DARK}text-indigo-200 ${DARK}ring-indigo-800`, [textNode('Runtime Tailwind CSS compiler')]),
    heading('h1', `mt-4 text-4xl md:text-6xl ${SHARED.title}`, [
      textNode('Tailwind for markup that '),
      spanNode('did not exist', 'bg-linear-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent'),
      textNode(' at build time'),
    ]),
    para(`mt-4 ${SHARED.body}`, [
      textNode('Send HTML or class names, get compiled CSS back. No build step and no stylesheet shipped ahead of time. Made for '),
      spanNode('AI-written UI', `font-semibold text-violet-600 ${DARK}text-violet-300`),
      textNode(', CMS pages, editors and previews.'),
    ]),
    para('mt-6 flex flex-wrap gap-3', [
      spanNode('See how it works', 'cursor-pointer rounded-full bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:bg-indigo-700'),
      spanNode('Read the API', `cursor-pointer rounded-full px-5 py-2.5 font-semibold text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-50 ${DARK}text-indigo-200 ${DARK}ring-indigo-700 ${DARK}hover:bg-indigo-950`),
    ]),
    para(`mt-10 grid grid-flow-col grid-rows-[auto_1fr] gap-x-4 rounded-3xl bg-linear-to-br from-indigo-50 via-white to-fuchsia-50 p-4 ring-1 ring-slate-200 ${DARK}from-slate-900 ${DARK}via-slate-900 ${DARK}to-indigo-950 ${DARK}ring-slate-700`, [
      ...card('No build step', 'Classes compile the moment a page asks for them, in milliseconds.'),
      ...card('Shared bundles', 'Base and theme load once. Each page carries only its own utilities.'),
      ...card('Honest output', 'Unknown classes come back in rejected[], never guessed.'),
    ]),
    footer(),
  ]),
  about: makeEditorState([
    nav('How it works'),
    para(`${SHARED.chip} bg-cyan-50 text-cyan-700 ring-cyan-200 ${DARK}bg-cyan-950 ${DARK}text-cyan-200 ${DARK}ring-cyan-800`, [textNode('One request')]),
    heading('h2', `mt-4 text-4xl ${SHARED.title}`, [textNode('From class names to CSS')]),
    para(`mt-4 ${SHARED.body}`, [textNode('Rich Wind runs the real Tailwind v4 engine on only the classes a page uses, then splits the result so pages can share what they have in common.')]),
    step(1, 'Send', 'Your app posts the page HTML, or just its class list, to POST /api/compile.'),
    step(2, 'Compile', 'Tailwind compiles exactly those classes. The output is split into base, theme and utilities.'),
    step(3, 'Share', 'Pages in a project share base and theme. With auto-promote, classes used on enough pages move into a shared bundle.'),
    para(`mt-8 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-4 font-mono text-xs ring-1 ring-slate-200 ${DARK}bg-slate-900 ${DARK}ring-slate-700`, [
      pill('base', `bg-slate-200 text-slate-800 ${DARK}bg-slate-700 ${DARK}text-slate-100`),
      op('+'),
      pill('theme', `bg-cyan-100 text-cyan-900 ${DARK}bg-cyan-900 ${DARK}text-cyan-100`),
      op('+'),
      pill('promoted', `bg-violet-100 text-violet-900 ${DARK}bg-violet-900 ${DARK}text-violet-100`),
      op('+'),
      pill('page utilities', `bg-amber-100 text-amber-900 ${DARK}bg-amber-900 ${DARK}text-amber-100`),
      op('='),
      spanNode('the CSS this page needs', `font-semibold text-slate-900 ${DARK}text-white`),
    ]),
    para(`mt-6 rounded-xl border-l-4 border-rose-400 bg-rose-50 p-4 text-sm leading-6 text-rose-900 ${DARK}bg-rose-950 ${DARK}text-rose-100`, [
      textNode('A typo such as '),
      spanNode('text-blu-500', 'rounded bg-rose-100 px-1 font-mono text-rose-700 line-through decoration-rose-400'),
      textNode(' compiles to nothing, so it is reported back in rejected[] instead of failing silently.'),
    ]),
    footer(),
  ]),
  contact: makeEditorState([
    nav('Use it'),
    para(`${SHARED.chip} bg-emerald-50 text-emerald-700 ring-emerald-200 ${DARK}bg-emerald-950 ${DARK}text-emerald-200 ${DARK}ring-emerald-800`, [textNode('Library first')]),
    heading('h2', `mt-4 text-4xl ${SHARED.title}`, [textNode('Mount it, or call it directly')]),
    para(`mt-4 ${SHARED.body}`, [textNode('Rich Wind is a Node library (Node 22 or later). Mount its handler on your server, or call core.compile from your own code.')]),
    para('mt-6 grid gap-0.5 overflow-x-auto rounded-2xl bg-slate-950 p-5 font-mono text-sm leading-6 text-slate-100 shadow-2xl shadow-slate-900/30 ring-1 ring-white/10', [
      code('import { createCore } from "@thinkly/rich-wind";', 'text-sky-300'),
      code('const core = await createCore();'),
      code(''),
      code('const { css, rejected } = await core.compile({'),
      code('  projectId: "my-app",', 'text-emerald-300'),
      code('  html: \'<p class="p-4 text-red-500">Hi</p>\',', 'text-emerald-300'),
      code('});'),
    ]),
    para(`mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm`, [
      ...endpoint('POST /api/compile', 'Compile CSS from HTML or class names'),
      ...endpoint('GET /api/css', 'Cached CSS for one page'),
      ...endpoint('GET /api/projects/:id/css', 'Combined CSS for a whole project'),
      ...endpoint('POST /api/suggest', 'Class name autocomplete'),
    ]),
    para('mt-8 w-fit cursor-pointer rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-700 active:scale-95', [textNode('Try it: type a class in the panel')]),
    footer(),
  ]),
};

function makePage(label) {
  return { label, editorStateJSON: null, html: '', classes: [], cssSize: 0 };
}

const DEFAULT_PAGES = {
  home: makePage('Overview'),
  about: makePage('How it works'),
  contact: makePage('Use it'),
};

// --- localStorage helpers ---

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.pages) return null;
    return parsed;
  } catch { return null; }
}

function saveState(pages, activePage, pageOrder) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pages, activePage, pageOrder }));
  } catch { /* quota exceeded — ignore */ }
}

let saveTimer = null;
function debouncedSave(pages, activePage, pageOrder) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(pages, activePage, pageOrder), 500);
}

function describeError(err) {
  const message = String(err?.message || err || '');
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the Rich Wind core. Is it running?';
  }
  if (/429|rate limit/i.test(message)) {
    return 'Rate limited by the core. Pause for a moment and keep typing.';
  }
  return message || 'Compile failed.';
}

// --- Hook ---

export function useMultiPageCompile() {
  const saved = useRef(loadState()).current;
  const initialPages = saved?.pages || DEFAULT_PAGES;
  const initialActivePage = saved?.activePage && initialPages[saved.activePage] ? saved.activePage : 'home';
  const initialPageOrder = saved?.pageOrder || Object.keys(initialPages);

  const [pages, setPages] = useState(initialPages);
  const [pageOrder, setPageOrder] = useState(initialPageOrder);
  const [activePage, setActivePage] = useState(initialActivePage);
  const [html, setHtml] = useState(initialPages[initialActivePage]?.html || '');
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);

  const [baseCss, setBaseCss] = useState('');
  const [themeCss, setThemeCss] = useState('');
  const [utilitiesCss, setUtilitiesCss] = useState('');
  const [sharedSizes, setSharedSizes] = useState({ base: 0, theme: 0 });
  const [promotedClasses, setPromotedClasses] = useState([]);
  const [promoteStats, setPromoteStats] = useState({ tracked: 0, promoted: 0, threshold: 0 });
  const [lastResult, setLastResult] = useState(EMPTY_RESULT);
  const [error, setError] = useState(null);

  const editorRef = useRef(null);
  const pagesRef = useRef(pages);
  const activePageRef = useRef(activePage);
  const pageOrderRef = useRef(pageOrder);
  const promotedSetRef = useRef(new Set());
  const refreshTimerRef = useRef(null);
  const suppressPersistRef = useRef(false);

  pagesRef.current = pages;
  activePageRef.current = activePage;
  pageOrderRef.current = pageOrder;

  const pageCounterRef = useRef((() => {
    let max = Object.keys(initialPages).length;
    for (const key of Object.keys(initialPages)) {
      const m = key.match(/^page-(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max;
  })());

  const initialEditorState = useRef(
    initialPages[initialActivePage]?.editorStateJSON
      ? JSON.stringify(initialPages[initialActivePage].editorStateJSON)
      : JSON.stringify(
        DEFAULT_CONTENT[initialActivePage] ||
        makeEditorState([para('', [textNode('Start typing...')])])
      )
  ).current;

  const setEditor = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const compileUtilitiesSnapshot = useCallback(async (pageId, htmlSnapshot, classesSnapshot) => {
    const classList = Array.isArray(classesSnapshot) ? classesSnapshot : [];
    let css = '';
    let fromCache = false;
    let compiled = [];
    let rejected = [];
    const started = performance.now();

    try {
      const utilitiesData = await apiCompile({
        projectId: PROJECT_ID,
        pageId,
        html: htmlSnapshot || '',
        classes: classList,
        bundle: 'utilities',
      });
      css = utilitiesData.css || '';
      fromCache = Boolean(utilitiesData.cached);
      compiled = Array.isArray(utilitiesData.classes) ? utilitiesData.classes : [];
      rejected = Array.isArray(utilitiesData.rejected) ? utilitiesData.rejected : [];
    } catch (err) {
      const message = String(err?.message || '');
      if (!message.includes('No valid classes')) {
        throw err;
      }
      // Every explicit class was rejected: the core returns an error, not CSS.
      rejected = classList.slice();
    }
    const ms = Math.round(performance.now() - started);

    if (classList.length > 0 && classList.every((cls) => promotedSetRef.current.has(cls))) {
      css = '';
    }

    setPages(prev => prev[pageId]
      ? { ...prev, [pageId]: { ...prev[pageId], cssSize: css.length } }
      : prev);

    if (activePageRef.current === pageId) {
      setUtilitiesCss(css);
      setCached(fromCache);
      setLastResult(prev => ({
        classes: compiled,
        rejected,
        cached: fromCache,
        ms,
        // Keep the last uncached compile time visible; cache hits follow quickly.
        freshMs: fromCache ? prev.freshMs : ms,
        at: Date.now(),
      }));
      setError(null);
    }

    return css;
  }, []);

  const refreshSharedBundles = useCallback(async () => {
    const pageId = activePageRef.current || 'default';
    try {
      const previousPromotedKey = Array.from(promotedSetRef.current).sort().join('|');
      const [baseResult, themeResult, statsResult] = await Promise.allSettled([
        getPageCss({ projectId: PROJECT_ID, pageId, bundle: 'base' }),
        getProjectCss({ projectId: PROJECT_ID, bundle: 'theme' }),
        fetchPromotedStats(),
      ]);

      const base = baseResult.status === 'fulfilled' ? (baseResult.value.css || '') : '';
      const theme = themeResult.status === 'fulfilled' ? (themeResult.value.css || '') : '';
      const stats = statsResult.status === 'fulfilled' ? statsResult.value : {};
      const promotedList = Array.isArray(stats?.[PROJECT_ID]?.promoted)
        ? stats[PROJECT_ID].promoted
        : [];
      const promotedCssText = promotedList.length > 0
        ? (await fetchPromotedCss(PROJECT_ID)) || ''
        : '';
      const mergedBaseCss = [base, promotedCssText].filter(Boolean).join('\n\n');

      promotedSetRef.current = new Set(promotedList);
      setPromotedClasses(promotedList);
      setPromoteStats({
        tracked: Number(stats?.[PROJECT_ID]?.trackedClasses) || 0,
        promoted: promotedList.length,
        threshold: Number(stats?.[PROJECT_ID]?.threshold) || 0,
      });
      setBaseCss(mergedBaseCss);
      setThemeCss(theme);
      setSharedSizes({
        base: mergedBaseCss.length,
        theme: theme.length,
      });
      const nextPromotedKey = promotedList.slice().sort().join('|');
      return { promotedChanged: previousPromotedKey !== nextPromotedKey };
    } catch (err) {
      console.error('Shared bundle refresh error:', err);
      return { promotedChanged: false };
    }
  }, []);

  const scheduleSharedRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(async () => {
      refreshTimerRef.current = null;
      // Compile first, then fetch the shared bundles: the project theme only
      // gains the variables of new classes once the core has seen them, so a
      // theme fetched before this compile can miss them until the next edit.
      const pageId = activePageRef.current;
      const page = pagesRef.current?.[pageId];
      if (pageId && page) {
        await compileUtilitiesSnapshot(pageId, page.html, page.classes).catch(() => {});
      }
      const { promotedChanged } = await refreshSharedBundles();
      if (promotedChanged) {
        const ids = pageOrderRef.current || [];
        const snapshotPages = pagesRef.current || {};
        await Promise.all(
          ids.map((id) => {
            const p = snapshotPages[id];
            if (!p) return Promise.resolve();
            return compileUtilitiesSnapshot(id, p.html, p.classes).catch(() => {});
          })
        );
      }
    }, SHARED_REFRESH_DELAY_MS);
  }, [compileUtilitiesSnapshot, refreshSharedBundles]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (suppressPersistRef.current) return;
      const editor = editorRef.current;
      if (!editor) return;
      const currentState = editor.getEditorState().toJSON();
      const currentPages = { ...pagesRef.current };
      const page = activePageRef.current;
      if (currentPages[page]) {
        currentPages[page] = { ...currentPages[page], editorStateJSON: currentState };
      }
      saveState(currentPages, page, pageOrderRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (suppressPersistRef.current) return;
    debouncedSave(pages, activePage, pageOrder);
  }, [pages, activePage, pageOrder]);

  useEffect(() => {
    void refreshSharedBundles();
    const pageId = activePageRef.current;
    const page = pagesRef.current?.[pageId];
    if (pageId && page) {
      void compileUtilitiesSnapshot(pageId, page.html, page.classes);
    }
    scheduleSharedRefresh();
  }, [compileUtilitiesSnapshot, refreshSharedBundles, scheduleSharedRefresh]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const doCompile = useCallback(async ({ html: newHtml, classes }) => {
    const page = activePageRef.current;
    const classList = Array.isArray(classes) ? classes : [];

    setHtml(newHtml);

    const editor = editorRef.current;
    const editorStateJSON = editor ? editor.getEditorState().toJSON() : null;

    setPages(prev => ({
      ...prev,
      [page]: { ...prev[page], html: newHtml, classes: classList, editorStateJSON },
    }));

    setLoading(true);
    try {
      await compileUtilitiesSnapshot(page, newHtml, classList);
      await refreshSharedBundles();
      scheduleSharedRefresh();
    } catch (err) {
      console.error('Compile error:', err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [compileUtilitiesSnapshot, refreshSharedBundles, scheduleSharedRefresh]);

  const switchPage = useCallback((pageId, editor) => {
    if (pageId === activePage || !editor) return;

    const currentState = editor.getEditorState().toJSON();
    setPages(prev => ({
      ...prev,
      [activePage]: { ...prev[activePage], editorStateJSON: currentState },
    }));

    const targetPage = pages[pageId];
    const savedState = targetPage?.editorStateJSON;
    const defaultContent = DEFAULT_CONTENT[pageId];
    setHtml(targetPage?.html || '');

    activePageRef.current = pageId;

    if (savedState) {
      const parsed = editor.parseEditorState(savedState);
      editor.setEditorState(parsed);
    } else if (defaultContent) {
      const parsed = editor.parseEditorState(JSON.stringify(defaultContent));
      editor.setEditorState(parsed);
    } else {
      const emptyState = editor.parseEditorState(JSON.stringify(makeEditorState([
        para('', [textNode('Start typing...')]),
      ])));
      editor.setEditorState(emptyState);
    }

    setActivePage(pageId);
    setUtilitiesCss('');
    setCached(false);

    void refreshSharedBundles();
    void compileUtilitiesSnapshot(pageId, targetPage?.html, targetPage?.classes);
    scheduleSharedRefresh();
  }, [activePage, compileUtilitiesSnapshot, pages, refreshSharedBundles, scheduleSharedRefresh]);

  const addPage = useCallback((editor) => {
    if (!editor) return;
    pageCounterRef.current += 1;
    const id = `page-${pageCounterRef.current}`;
    const label = `Page ${pageCounterRef.current}`;

    const currentState = editor.getEditorState().toJSON();
    setPages(prev => ({
      ...prev,
      [activePageRef.current]: { ...prev[activePageRef.current], editorStateJSON: currentState },
      [id]: makePage(label),
    }));
    setPageOrder(prev => [...prev, id]);

    activePageRef.current = id;
    setActivePage(id);

    const emptyState = editor.parseEditorState(JSON.stringify(makeEditorState([
      para('', [textNode('Start typing...')]),
    ])));
    editor.setEditorState(emptyState);

    setHtml('');
    setUtilitiesCss('');
    setCached(false);

    void refreshSharedBundles();
    scheduleSharedRefresh();
  }, [refreshSharedBundles, scheduleSharedRefresh]);

  const deletePage = useCallback((pageId, editor) => {
    if (!editor) return;
    if (pageOrder.length <= 1) return;

    const remaining = pageOrder.filter(id => id !== pageId);

    if (pageId === activePage) {
      const newActive = remaining[0];
      const target = pages[newActive];
      const savedState = target?.editorStateJSON;
      const defaultContent = DEFAULT_CONTENT[newActive];

      activePageRef.current = newActive;

      if (savedState) {
        editor.setEditorState(editor.parseEditorState(savedState));
      } else if (defaultContent) {
        editor.setEditorState(editor.parseEditorState(JSON.stringify(defaultContent)));
      }

      setActivePage(newActive);
      setHtml(target?.html || '');
      setUtilitiesCss('');
      setCached(false);

      void compileUtilitiesSnapshot(newActive, target?.html, target?.classes);
    }

    setPages(prev => {
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
    setPageOrder(remaining);

    // Clear server-side tracking for deleted page classes.
    apiCompile({ projectId: PROJECT_ID, pageId, html: '', classes: [], bundle: 'utilities' }).catch(() => {});

    void refreshSharedBundles();
    scheduleSharedRefresh();
  }, [activePage, compileUtilitiesSnapshot, pageOrder, pages, refreshSharedBundles, scheduleSharedRefresh]);

  const resetDemo = useCallback(() => {
    suppressPersistRef.current = true;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('rw-lexical-demo');
    localStorage.removeItem('rw-lexical-demo-v2');
    localStorage.removeItem('rw-lexical-demo-v3');
    window.location.reload();
  }, []);

  const fullCss = useMemo(() => {
    return [baseCss, themeCss, utilitiesCss]
      .filter(Boolean)
      .join('\n\n');
  }, [baseCss, themeCss, utilitiesCss]);

  return {
    projectId: PROJECT_ID,
    baseCss,
    themeCss,
    utilitiesCss,
    fullCss,
    sharedSizes,
    promotedClasses,
    promoteStats,
    lastResult,
    error,
    html,
    loading,
    cached,
    activePage,
    pages,
    pageOrder,
    initialEditorState,
    setEditor,
    switchPage,
    doCompile,
    addPage,
    deletePage,
    resetDemo,
  };
}
