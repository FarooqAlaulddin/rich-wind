import { useRef, useEffect, useCallback } from 'preact/hooks';
import { TopBar } from '../components/TopBar';
import { EditorPane } from '../components/EditorPane';
import { PreviewPane } from '../components/PreviewPane';
import { Splitter } from '../components/Splitter';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useCompile } from '../hooks/useCompile';
import { useAutoCompile } from '../hooks/useAutoCompile';
import { useSplitter } from '../hooks/useSplitter';
import { usePaneResize } from '../hooks/usePaneResize';
import { loadMonaco, registerSuggestProviders, clearSuggestCache } from '../hooks/useMonaco';
import { useThemeMode } from '../hooks/useThemeMode';
import { SAMPLE_HTML, SAMPLE_CLASSES, SAMPLE_CSS } from '../data/sample-data';

const STORAGE_KEY = 'rw-editor-state';

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveToDisk(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function Playground() {
  const saved = loadSaved();
  const [html, setHtml] = useLocalStorage('__pg_html', saved?.html ?? SAMPLE_HTML);
  const [classesInput, setClassesInput] = useLocalStorage('__pg_classes', saved?.classes ?? SAMPLE_CLASSES);
  const [customCss, setCustomCss] = useLocalStorage('__pg_customCss', saved?.customCss ?? SAMPLE_CSS);
  const [bundle, setBundle] = useLocalStorage('__pg_bundle', saved?.bundle ?? 'full');
  const [autoCompileEnabled, setAutoCompileEnabled] = useLocalStorage('rw-auto-compile', true);
  const [compact, setCompact] = useLocalStorage('rw-compact', false);
  const [layout, setLayout] = useLocalStorage('rw-layout', 'split');
  const { isDark, setDarkEnabled } = useThemeMode();

  const gridRef = useRef(null);
  const splitter = useSplitter(gridRef);
  const editorResize = usePaneResize('rw-editor-height');
  const previewResize = usePaneResize('rw-preview-height');

  const { status, css, classes, stats, preview, cacheBadge, loading, doCompile } = useCompile();

  // Refs for auto-compile to read current values
  const htmlRef = useRef(html);
  const classesRef = useRef(classesInput);
  const customCssRef = useRef(customCss);
  const bundleRef = useRef(bundle);
  htmlRef.current = html;
  classesRef.current = classesInput;
  customCssRef.current = customCss;
  bundleRef.current = bundle;

  const handleCompile = useCallback((intent = 'compile') => {
    doCompile({
      projectId: 'demo',
      pageId: 'playground',
      html: htmlRef.current,
      classesInput: classesRef.current,
      customCss: customCssRef.current,
      bundle: bundleRef.current,
      intent,
    });
    clearSuggestCache();
  }, [doCompile]);

  const { schedule } = useAutoCompile({
    enabled: autoCompileEnabled,
    getValues: () => ({
      html: htmlRef.current,
      classes: classesRef.current,
      bundle: bundleRef.current,
    }),
    onCompile: () => handleCompile('compile'),
  });

  // Save editor state on change
  useEffect(() => {
    const timer = setTimeout(() => {
      saveToDisk({ html, classes: classesInput, customCss, bundle });
    }, 600);
    return () => clearTimeout(timer);
  }, [html, classesInput, customCss, bundle]);

  // Trigger auto-compile on input change
  const onHtmlChange = useCallback((v) => { setHtml(v); schedule(); }, [setHtml, schedule]);
  const onClassesChange = useCallback((v) => { setClassesInput(v); schedule(); }, [setClassesInput, schedule]);
  const onCustomCssChange = useCallback((v) => { setCustomCss(v); }, [setCustomCss]);
  const onBundleChange = useCallback((v) => { setBundle(v); schedule(); }, [setBundle, schedule]);

  useEffect(() => {
    document.body.classList.toggle('compact-mode', compact);
  }, [compact]);

  // Layout mode
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.classList.remove('layout-editor', 'layout-output', 'layout-collapsed');
    if (layout === 'editor') grid.classList.add('layout-editor');
    else if (layout === 'output') grid.classList.add('layout-output');
    else if (layout === 'collapsed') grid.classList.add('layout-collapsed');

    // Scroll mode
    const isStacked = window.matchMedia?.('(max-width: 1100px)').matches;
    const hasResize = document.body.classList.contains('pane-resized');
    document.body.classList.toggle('allow-scroll', isStacked || hasResize || layout !== 'split');
  }, [layout]);

  // Restore pane sizes
  useEffect(() => {
    editorResize.restoreHeight();
    previewResize.restoreHeight();
  }, []);

  // Initial compile on mount
  useEffect(() => {
    handleCompile('compile');
  }, []);

  // Register Monaco suggest providers
  useEffect(() => {
    loadMonaco().then((monaco) => {
      registerSuggestProviders(
        monaco,
        () => 'demo',
        () => classesRef.current,
      );
    });
  }, []);

  const handleReset = useCallback(() => {
    setHtml(SAMPLE_HTML);
    setClassesInput(SAMPLE_CLASSES);
    setCustomCss(SAMPLE_CSS);
    setBundle('full');
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, [setHtml, setClassesInput, setCustomCss, setBundle]);

  return (
    <main class="play-shell">
      <TopBar
        autoCompile={autoCompileEnabled}
        onAutoCompileChange={setAutoCompileEnabled}
        compact={compact}
        onCompactChange={setCompact}
        dark={isDark}
        onDarkChange={setDarkEnabled}
        layout={layout}
        onLayoutChange={setLayout}
      />
      <section class="play-body">
        <div ref={gridRef} class="studio-grid">
          <EditorPane
            html={html}
            classes={classesInput}
            customCss={customCss}
            bundle={bundle}
            onHtmlChange={onHtmlChange}
            onClassesChange={onClassesChange}
            onCustomCssChange={onCustomCssChange}
            onBundleChange={onBundleChange}
            onCompile={() => handleCompile('compile')}
            onCache={() => handleCompile('cache')}
            onProject={() => handleCompile('project')}
            onReset={handleReset}
            status={status}
            loading={loading}
            paneResizeProps={editorResize}
          />
          <Splitter onPointerDown={splitter.onPointerDown} />
          <PreviewPane
            preview={preview}
            css={css}
            cacheBadge={cacheBadge}
            classes={classes}
            stats={stats}
            paneResizeProps={previewResize}
          />
        </div>
      </section>
    </main>
  );
}
