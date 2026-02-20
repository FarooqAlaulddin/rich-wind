import { useState, useCallback, useRef, useEffect } from 'react';
import { compile as apiCompile } from '../api';

const PROJECT_ID = 'lexical-demo';
const STORAGE_KEY = 'rw-lexical-demo-v2';

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

const DEFAULT_CONTENT = {
  home: makeEditorState([
    heading('h1', 'text-4xl font-bold text-blue-600', [textNode('Welcome to Rich Wind')]),
    para('bg-gray-100 p-6 rounded-xl', [
      textNode('This is a '),
      spanNode('live-styled', 'text-emerald-600 font-semibold'),
      textNode(' rich text editor. Edit text here, apply Tailwind classes, and see styles render directly in the editor.'),
    ]),
    para('', [textNode('Try selecting text and adding inline classes, or click a block to style it with the inspector panel.')]),
  ]),
  about: makeEditorState([
    heading('h2', 'text-3xl font-semibold text-emerald-700', [textNode('About This Project')]),
    para('border-l-4 border-emerald-500 pl-4', [
      textNode('Rich Wind compiles Tailwind CSS on demand. Each page gets its own '),
      spanNode('optimized bundle', 'text-emerald-600 font-medium'),
      textNode(' containing only the utilities it actually uses.'),
    ]),
    para('bg-emerald-50 p-4 rounded-lg', [textNode('Switch between pages to see how bundle sizes change based on the classes used on each page.')]),
  ]),
  contact: makeEditorState([
    heading('h2', 'text-3xl font-bold text-purple-600', [textNode('Get in Touch')]),
    para('bg-purple-50 p-6 rounded-lg', [
      textNode('This demo showcases '),
      spanNode('multi-page bundle splitting', 'text-purple-700 font-semibold'),
      textNode('. Each page compiles to separate base, theme, and utility bundles.'),
    ]),
    para('text-lg text-purple-900', [textNode('Check the BUNDLES panel to see how shared and per-page CSS is split efficiently.')]),
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

// --- Hook ---

export function useMultiPageCompile() {
  // Initialize from localStorage or defaults
  const saved = useRef(loadState()).current;
  const initialPages = saved?.pages || DEFAULT_PAGES;
  const initialActivePage = saved?.activePage && initialPages[saved.activePage] ? saved.activePage : 'home';
  const initialPageOrder = saved?.pageOrder || Object.keys(initialPages);

  const [pages, setPages] = useState(initialPages);
  const [pageOrder, setPageOrder] = useState(initialPageOrder);
  const [activePage, setActivePage] = useState(initialActivePage);
  const [fullCss, setFullCss] = useState('');
  const [html, setHtml] = useState(initialPages[initialActivePage]?.html || '');
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);

  const editorRef = useRef(null);
  const pagesRef = useRef(pages);
  const activePageRef = useRef(activePage);
  const pageOrderRef = useRef(pageOrder);
  pagesRef.current = pages;
  activePageRef.current = activePage;
  pageOrderRef.current = pageOrder;

  // Start counter from highest existing page number to avoid ID collisions
  const pageCounterRef = useRef((() => {
    let max = Object.keys(initialPages).length;
    for (const key of Object.keys(initialPages)) {
      const m = key.match(/^page-(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max;
  })());

  // Compute the initial editor state for the active page (stable ref, used once)
  const initialEditorState = useRef(
    initialPages[initialActivePage]?.editorStateJSON
      ? JSON.stringify(initialPages[initialActivePage].editorStateJSON)
      : null
  ).current;

  const setEditor = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  // Save editor state to localStorage before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
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

  // Persist to localStorage on changes
  useEffect(() => {
    debouncedSave(pages, activePage, pageOrder);
  }, [pages, activePage, pageOrder]);

  const doCompile = useCallback(async ({ html: newHtml, classes }) => {
    // Read current page from ref (not closure) — critical for switchPage timing
    const page = activePageRef.current;

    setHtml(newHtml);

    // Capture editor state for persistence
    const editor = editorRef.current;
    const editorStateJSON = editor ? editor.getEditorState().toJSON() : null;

    setPages(prev => ({
      ...prev,
      [page]: { ...prev[page], html: newHtml, classes, editorStateJSON },
    }));

    if (!classes || classes.length === 0) {
      setFullCss('');
      setCached(false);
      setPages(prev => ({
        ...prev,
        [page]: { ...prev[page], cssSize: 0 },
      }));
      return;
    }

    setLoading(true);
    try {
      const fullData = await apiCompile({
        projectId: PROJECT_ID,
        pageId: page,
        html: newHtml,
        classes,
        bundle: 'full',
      });
      const css = fullData.css || '';
      setFullCss(css);
      setCached(!!fullData.cached);
      setPages(prev => ({
        ...prev,
        [page]: { ...prev[page], cssSize: css.length },
      }));
    } catch (err) {
      console.error('Compile error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const switchPage = useCallback((pageId, editor) => {
    if (pageId === activePage || !editor) return;

    // Save current editor state
    const currentState = editor.getEditorState().toJSON();
    setPages(prev => ({
      ...prev,
      [activePage]: { ...prev[activePage], editorStateJSON: currentState },
    }));

    // Read target page content before any state updates
    const targetPage = pages[pageId];
    const savedState = targetPage?.editorStateJSON;
    const defaultContent = DEFAULT_CONTENT[pageId];
    setHtml(targetPage?.html || '');

    // Update ref BEFORE editor.setEditorState() — the editor change fires
    // TailwindClassPlugin synchronously, which calls doCompile. doCompile reads
    // activePageRef to know which page to compile for.
    activePageRef.current = pageId;

    // Restore editor content (side effect — must be outside state setter)
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
    setCached(false);
  }, [activePage, pages]);

  const addPage = useCallback((editor) => {
    if (!editor) return;
    pageCounterRef.current += 1;
    const id = `page-${pageCounterRef.current}`;
    const label = `Page ${pageCounterRef.current}`;

    // Save current editor state before switching
    const currentState = editor.getEditorState().toJSON();
    setPages(prev => ({
      ...prev,
      [activePageRef.current]: { ...prev[activePageRef.current], editorStateJSON: currentState },
      [id]: makePage(label),
    }));
    setPageOrder(prev => [...prev, id]);

    // Update ref BEFORE editor.setEditorState() — same reason as switchPage
    activePageRef.current = id;
    setActivePage(id);

    // Set empty content
    const emptyState = editor.parseEditorState(JSON.stringify(makeEditorState([
      para('', [textNode('Start typing...')]),
    ])));
    editor.setEditorState(emptyState);

    setFullCss('');
    setHtml('');
    setCached(false);
  }, []);

  const deletePage = useCallback((pageId, editor) => {
    if (!editor) return;
    if (pageOrder.length <= 1) return;

    const remaining = pageOrder.filter(id => id !== pageId);

    // If deleting active page, restore first remaining page's content
    if (pageId === activePage) {
      const newActive = remaining[0];
      const target = pages[newActive];
      const savedState = target?.editorStateJSON;
      const defaultContent = DEFAULT_CONTENT[newActive];

      if (savedState) {
        editor.setEditorState(editor.parseEditorState(savedState));
      } else if (defaultContent) {
        editor.setEditorState(editor.parseEditorState(JSON.stringify(defaultContent)));
      }

      setActivePage(newActive);
      setHtml(target?.html || '');
      setCached(false);
    }

    setPages(prev => {
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
    setPageOrder(remaining);

    // Clear server-side class tracking for deleted page
    apiCompile({ projectId: PROJECT_ID, pageId, html: '', classes: ['hidden'], bundle: 'utilities' }).catch(() => {});
  }, [activePage, pageOrder, pages]);

  const resetDemo = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('rw-lexical-demo'); // clear old key too
    window.location.reload();
  }, []);

  return {
    projectId: PROJECT_ID,
    fullCss, html, loading, cached,
    activePage, pages, pageOrder,
    initialEditorState, setEditor,
    switchPage, doCompile, addPage, deletePage, resetDemo,
  };
}
