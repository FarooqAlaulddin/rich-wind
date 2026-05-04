import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  compile as apiCompile,
  getPageCss,
  getProjectCss,
  fetchPromotedCss,
  fetchPromotedStats,
} from '../api';

const PROJECT_ID = 'lexical-demo';
const STORAGE_KEY = 'rw-lexical-demo-v2';
const SHARED_REFRESH_DELAY_MS = 550;

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

const SAMPLE_CLASSES = {
  homeHeading: 'text-4xl font-bold text-blue-600 [.theme-dark_&]:text-blue-400',
  homeCard: 'bg-gray-100 text-slate-800 p-6 rounded-xl [.theme-dark_&]:bg-slate-800 [.theme-dark_&]:text-slate-100',
  homeAccent: 'text-emerald-600 font-semibold [.theme-dark_&]:text-emerald-300',
  aboutHeading: 'text-3xl font-semibold text-emerald-700 [.theme-dark_&]:text-emerald-300',
  aboutLead: 'border-l-4 border-emerald-500 pl-4 [.theme-dark_&]:text-slate-100',
  aboutAccent: 'text-emerald-600 font-medium [.theme-dark_&]:text-emerald-300',
  aboutCard: 'bg-emerald-50 text-emerald-950 p-4 rounded-lg [.theme-dark_&]:bg-emerald-950 [.theme-dark_&]:text-emerald-100',
  contactHeading: 'text-3xl font-bold text-purple-600 [.theme-dark_&]:text-purple-300',
  contactCard: 'bg-purple-50 text-purple-950 p-6 rounded-lg [.theme-dark_&]:bg-purple-950 [.theme-dark_&]:text-purple-100',
  contactAccent: 'text-purple-700 font-semibold [.theme-dark_&]:text-purple-300',
  contactNote: 'text-lg text-purple-900 [.theme-dark_&]:text-purple-100',
};

const CLASS_MIGRATIONS = new Map([
  ['text-4xl font-bold text-blue-600', SAMPLE_CLASSES.homeHeading],
  ['bg-gray-100 p-6 rounded-xl', SAMPLE_CLASSES.homeCard],
  ['text-emerald-600 font-semibold', SAMPLE_CLASSES.homeAccent],
  ['text-3xl font-semibold text-emerald-700', SAMPLE_CLASSES.aboutHeading],
  ['border-l-4 border-emerald-500 pl-4', SAMPLE_CLASSES.aboutLead],
  ['text-emerald-600 font-medium', SAMPLE_CLASSES.aboutAccent],
  ['bg-emerald-50 p-4 rounded-lg', SAMPLE_CLASSES.aboutCard],
  ['text-3xl font-bold text-purple-600', SAMPLE_CLASSES.contactHeading],
  ['bg-purple-50 p-6 rounded-lg', SAMPLE_CLASSES.contactCard],
  ['text-purple-700 font-semibold', SAMPLE_CLASSES.contactAccent],
  ['text-lg text-purple-900', SAMPLE_CLASSES.contactNote],
]);

const DEFAULT_CONTENT = {
  home: makeEditorState([
    heading('h1', SAMPLE_CLASSES.homeHeading, [textNode('Welcome to Rich Wind')]),
    para(SAMPLE_CLASSES.homeCard, [
      textNode('This is a '),
      spanNode('live-styled', SAMPLE_CLASSES.homeAccent),
      textNode(' rich text editor. Edit text here, apply Tailwind classes, and see styles render directly in the editor.'),
    ]),
    para('', [textNode('Try selecting text and adding inline classes, or click a block to style it with the inspector panel.')]),
  ]),
  about: makeEditorState([
    heading('h2', SAMPLE_CLASSES.aboutHeading, [textNode('About This Project')]),
    para(SAMPLE_CLASSES.aboutLead, [
      textNode('Rich Wind compiles Tailwind CSS on demand. Shared base/theme load once, while each page keeps only '),
      spanNode('its own utilities', SAMPLE_CLASSES.aboutAccent),
      textNode('.'),
    ]),
    para(SAMPLE_CLASSES.aboutCard, [textNode('When classes cross the threshold, auto-promote moves them into a shared bundle.')]),
  ]),
  contact: makeEditorState([
    heading('h2', SAMPLE_CLASSES.contactHeading, [textNode('Get in Touch')]),
    para(SAMPLE_CLASSES.contactCard, [
      textNode('This demo uses layered CSS: '),
      spanNode('base + theme + promoted + page utilities', SAMPLE_CLASSES.contactAccent),
      textNode('.'),
    ]),
    para(SAMPLE_CLASSES.contactNote, [textNode('Open BUNDLES to inspect shared vs per-page output.')]),
  ]),
};

function makePage(label) {
  return { label, editorStateJSON: null, html: '', classes: [], cssSize: 0 };
}

const DEFAULT_PAGES = {
  home: makePage('Home'),
  about: makePage('About'),
  contact: makePage('Contact'),
};

// --- localStorage helpers ---

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.pages) return null;
    migrateStoredSampleClasses(parsed);
    return parsed;
  } catch { return null; }
}

function migrateStoredSampleClasses(state) {
  const migrateNode = (node) => {
    if (!node || typeof node !== 'object') return false;
    let changed = false;
    if (typeof node.tailwindClasses === 'string' && CLASS_MIGRATIONS.has(node.tailwindClasses)) {
      node.tailwindClasses = CLASS_MIGRATIONS.get(node.tailwindClasses);
      changed = true;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (migrateNode(child)) changed = true;
      }
    }
    return changed;
  };

  let changed = false;
  for (const page of Object.values(state.pages || {})) {
    if (migrateNode(page?.editorStateJSON?.root)) changed = true;
  }

  if (changed) {
    saveState(state.pages, state.activePage, state.pageOrder);
  }
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
    } catch (err) {
      const message = String(err?.message || '');
      if (!message.includes('No valid classes')) {
        throw err;
      }
    }

    if (classList.length > 0 && classList.every((cls) => promotedSetRef.current.has(cls))) {
      css = '';
    }

    setPages(prev => prev[pageId]
      ? { ...prev, [pageId]: { ...prev[pageId], cssSize: css.length } }
      : prev);

    if (activePageRef.current === pageId) {
      setUtilitiesCss(css);
      setCached(fromCache);
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
      const { promotedChanged } = await refreshSharedBundles();
      if (promotedChanged) {
        const ids = pageOrderRef.current || [];
        const snapshotPages = pagesRef.current || {};
        await Promise.all(
          ids.map((id) => {
            const page = snapshotPages[id];
            if (!page) return Promise.resolve();
            return compileUtilitiesSnapshot(id, page.html, page.classes).catch(() => {});
          })
        );
      } else {
        const pageId = activePageRef.current;
        const page = pagesRef.current?.[pageId];
        if (pageId && page) {
          await compileUtilitiesSnapshot(pageId, page.html, page.classes).catch(() => {});
        }
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
