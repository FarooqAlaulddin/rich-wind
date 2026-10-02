import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStyleTarget } from '../hooks/useStyleTarget';
import { useClassPreview, previewDeclsOf } from '../hooks/useClassPreview';
import { useRoving } from '../hooks/useRoving';
import { editTargetClasses, loadEditorState } from '../editorActions';
import { addClass, removeClass, removeGroup } from '../classEdit';
import { splitToken, normalizePrefix } from '../classCatalog';
import { hold } from '../stylePreview';
import { captureStyle } from '../animateStyle';
import { search, readVariants } from '../classSearch';
import { resolveReference } from '../search/reference';
import { loadFullCatalog, onCatalogChange } from '../search/catalogStore';
import { canonicalOrder, stackPrefix, toggleVariant, prefixToIds, previewNote, stripVariantWords } from '../search/variants';
import { propById, cycleProp } from '../search/palette';
import { spaceStem } from '../shelf/strips';
import { INTENT_TABS, describeClassIntent, prepareQuery, disambiguate, routeResult } from '../shelf/intents';
import { pendingRows } from '../pendingRows';
import VariantBar from './VariantBar';
import IntentSurface from './IntentSurface';
import CandidateStrip from './CandidateStrip';
import IdeasRow from './IdeasRow';
import ElementRows from './ElementRows';
import Landing from './Landing';
import useIdeas from '../hooks/useIdeas';
import { wordsOf, parseClause } from '../search/phrase';

const isDark = () => document.documentElement.classList.contains('theme-dark');
const tokenOf = (cls) => {
  const { prefix, base } = splitToken(cls);
  return normalizePrefix(prefix) + base;
};

/** "Did you mean": a vague word with no intent open is asked about, never guessed. */
function Ambiguity({ ask, onPick }) {
  const roving = useRoving();
  return (
    <div className="shelf-ambig" role="group" aria-label={`What should ${ask.word} change`} {...roving}>
      <span className="shelf-ambig-q">did you mean:</span>
      {ask.options.map((o) => (
        <button key={o.label} type="button" data-nav data-row="ambig" className="pchip" onClick={() => onPick(o.query)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TabRow({ intent, onPick }) {
  const roving = useRoving();
  return (
    <div className="shelf-tabs" role="tablist" aria-label="What to change" {...roving}>
      {INTENT_TABS.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-nav
          data-row="tabs"
          {...(t.id === intent ? { 'data-current': '' } : {})}
          className={`shelf-tab${t.id === intent ? ' is-on' : ''}`}
          aria-selected={t.id === intent}
          title={`${t.label} (${i + 1})`}
          onClick={() => onPick(t.id === intent ? null : t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The right-hand panel. Top: Make it (the query, scope, cards, a Browse
 * disclosure, Suggestions). Middle: the selected element and the CSS Rich Wind
 * compiled for each of its classes, or the landing explainer. It never floats
 * and never covers the page. Variant scope and the query survive a change of
 * target; only previews are cleared.
 */
export default function StylePanel({ editor, used, css, rejected = [], promoted = [], loading = false }) {
  const target = useStyleTarget(editor);
  const { preview, clear } = useClassPreview(target, editor);

  const [root, setRoot] = useState(() => (editor ? editor.getRootElement() : null));
  const [query, setQuery] = useState('');
  const [intent, setIntent] = useState(null);
  const [browse, setBrowse] = useState(false);
  const [scopeIds, setScopeIds] = useState([]);
  const [space, setSpace] = useState({ kind: 'padding', side: '' });
  const [colorProp, setColorProp] = useState('text');
  const [family, setFamily] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [note, setNote] = useState(null);
  const [scrub, setScrub] = useState(null);
  const [pending, setPending] = useState([]);
  const [awaiting, setAwaiting] = useState([]);
  const [focusReq, setFocusReq] = useState(null);
  const [catalog, setCatalog] = useState(0);
  const [lastMove, setLastMove] = useState(null);
  const rejectedSet = useMemo(() => new Set(rejected), [rejected]);
  const promotedSet = useMemo(() => new Set(promoted), [promoted]);
  const hasTarget = target.kind !== 'none';

  const rootRef = useRef(null);
  const fieldRef = useRef(null);
  const surfaceRef = useRef(null);
  const routeKey = useRef('');
  const previewing = useRef(false);
  const live = useRef({});
  const elRef = useRef({ cur: null, prev: null });

  useEffect(() => {
    if (!editor) return undefined;
    return editor.registerRootListener(setRoot);
  }, [editor]);

  useEffect(() => {
    loadFullCatalog();
    return onCatalogChange(() => setCatalog((n) => n + 1));
  }, []);

  // The element styled before this one, for "copy that" / "same as the last one".
  useEffect(() => {
    const el = target.getEl();
    if (el && el !== elRef.current.cur) elRef.current = { cur: el, prev: elRef.current.cur && elRef.current.cur.isConnected ? elRef.current.cur : null };
  }, [target.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new target clears previews only. The query and variant scope stay.
  useEffect(() => {
    clear();
    previewing.current = false;
    setNote(null);
    setScrub(null);
    setPending([]);
    setAwaiting([]);
    setLastMove(null);
  }, [target.id, clear]);

  // ---------- Scope and search ----------

  const typedIds = useMemo(() => readVariants(query).ids.filter((id) => !scopeIds.includes(id)), [query, scopeIds]);
  const effective = useMemo(() => canonicalOrder([...scopeIds, ...typedIds]), [scopeIds, typedIds]);
  const wire = normalizePrefix(stackPrefix(effective));

  const prepared = useMemo(() => prepareQuery(query, { intent, kind: space.kind }), [query, intent, space.kind]);
  const result = useMemo(
    () => (query.trim()
      ? search(prepared, {
        used, classes: target.classes, variantIds: scopeIds, limit: 40, tag: target.tag, kind: target.kind, lastMove: lastMove && lastMove.id === target.id ? lastMove : null,
      })
      : null),
    // `catalog` re-runs the search when the full catalog replaces the seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prepared, used, target.classes, target.tag, target.kind, scopeIds, catalog, lastMove],
  );

  // "like the heading above": resolved against the page, so it lives here and not in search().
  const reference = useMemo(() => {
    if (!result || !result.reference || !root) return null;
    return resolveReference(result.reference, { root, el: target.getEl(), classes: target.classes, last: elRef.current.prev });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, root, target.classes]);

  const candidates = useMemo(() => {
    if (!result) return [];
    let items = result.items;
    if (intent === 'color') {
      const pre = propById(colorProp)?.prefix;
      if (pre) items = [...items.filter((i) => i.base.startsWith(pre)), ...items.filter((i) => !i.base.startsWith(pre))];
    }
    if (reference && reference.tokens) {
      const item = {
        cls: reference.tokens[0] || `-${reference.removed[0]}`, key: 'reference', base: reference.tokens[0] || '', prefix: wire, label: reference.title, css: reference.hint,
        color: null, hint: reference.hint, source: 'reference', score: 5500, pop: 0, bundle: reference.tokens, removed: reference.removed, title: reference.title,
      };
      items = [item, ...items];
    }
    return items.slice(0, 8);
  }, [result, intent, colorProp, reference, wire]);

  const ask = useMemo(() => disambiguate(query, intent), [query, intent]);

  // Suggestions (rules, or the local model): only when the deterministic search found nothing.
  const unresolved = !!result && result.items.length === 0 && !ask && !(reference && (reference.tokens || reference.message));
  const ideas = useIdeas({ enabled: true, query, unresolved, target, prefix: wire });

  // Category words and colors switch the intent, once per typed destination.
  const route = useMemo(() => routeResult(result), [result]);
  useEffect(() => {
    if (!route) {
      routeKey.current = '';
      return;
    }
    if (route.key === routeKey.current) return;
    routeKey.current = route.key;
    setIntent(route.intent);
    if (route.intent === 'color') {
      setColorProp(route.prop || 'text');
      setFamily(route.family || null);
    }
    if (route.kind) setSpace((s) => ({ kind: route.kind, side: spaceStem(route.kind, s.side) === null ? '' : s.side }));
  }, [route]);
  useEffect(() => { if (!query) setFamily(null); }, [query]);
  // Browse opens by itself when a typed word picks an intent.
  useEffect(() => { if (intent) setBrowse(true); }, [intent]);

  // ---------- Preview and apply ----------

  const onPreview = useCallback((tokens, info, removed) => {
    const ok = preview(tokens);
    previewing.current = ok;
    setNote(ok ? null : previewNote(effective, { dark: isDark(), width: window.innerWidth }));
    setScrub(info && info.to ? { from: info.from, to: info.to } : null);
    setPending(hasTarget ? pendingRows(live.current.target.classes, tokens, removed || []) : []);
  }, [preview, effective, hasTarget]);

  const onLeave = useCallback(() => {
    clear();
    previewing.current = false;
    setNote(null);
    setScrub(null);
    setPending([]);
  }, [clear]);

  const apply = useCallback((tokens, drop = [], removed = [], meta = {}) => {
    if (!hasTarget) {
      setNote('Click text in the page first, then apply.');
      return;
    }
    const list = tokens.map(tokenOf);
    // Each token carries its own scope; a group drop applies in every scope the tokens use.
    const prefixes = [...new Set(list.map((t) => splitToken(t).prefix))];
    const decls = previewDeclsOf(list, target.classes);
    const inPanel = !!rootRef.current && rootRef.current.contains(document.activeElement);
    const id = target.id;
    let moved = null;
    // Taken before the hover preview is cleared, so the change eases from what was on screen.
    const from = captureStyle(target.getEl());
    clear({ instant: true });
    previewing.current = false;
    setPending([]);
    editTargetClasses(
      editor,
      target.spec,
      (cur) => {
        let next = cur.filter((c) => !removed.includes(c));
        for (const g of drop) for (const p of prefixes) next = removeGroup(next, p, g);
        next = list.reduce(addClass, next);
        moved = { id, added: next.filter((c) => !cur.includes(c)), removed: cur.filter((c) => !next.includes(c)), query: meta.query || '' };
        return next;
      },
      (key) => {
        if (decls && key) hold(editor.getElementByKey(key), decls, list[list.length - 1]);
        if (moved && (moved.added.length || moved.removed.length)) {
          setAwaiting(moved.added);
          // An undo is not a move to undo again (it would ping-pong); "again" keeps the query it repeated.
          if (meta.undo === 'back' || meta.undo === 'too') setLastMove(null);
          else if (meta.undo === 'again') setLastMove((prev) => (prev && prev.id === id ? { ...moved, query: prev.query } : moved));
          else setLastMove(moved);
        }
        // The editor takes focus back when its selection is rewritten; keep the control being used.
        if (list.length && inPanel && rootRef.current && !rootRef.current.contains(document.activeElement)) {
          const again = rootRef.current.querySelector(`[data-cls="${splitToken(list[list.length - 1]).base.replace(/["\\]/g, '\\$&')}"]`);
          if (again) again.focus({ preventScroll: true });
        }
      },
      { from },
    );
    setQuery('');
    setNote(null);
    setScrub(null);
  }, [editor, hasTarget, target.spec, target.classes, target.id, clear]);

  // A card or Enter applies a whole bundle (a recipe, an undo, a reference) or one class.
  const applyItem = useCallback((it) => {
    const c = parseClause(wordsOf(live.current.query));
    apply(it.bundle || [it.cls], [], it.removed || [], { query: live.current.query, undo: c.kind === 'undo' ? c.which : null });
  }, [apply]);

  const remove = useCallback((cls) => {
    clear();
    editTargetClasses(editor, target.spec, (list) => removeClass(list, cls));
  }, [editor, target.spec, clear]);

  const openChip = useCallback((cls) => {
    const { prefix, base } = splitToken(cls);
    const d = describeClassIntent(base);
    setScopeIds(prefixToIds(prefix));
    setIntent(d.intent);
    if (d.intent === 'color') setColorProp(d.prop);
    if (d.intent === 'space') setSpace({ kind: d.kind, side: d.side });
    if (d.intent === 'anything') setQuery(d.query || '');
    setFocusReq({ cls: base, n: Date.now() });
  }, []);

  useEffect(() => {
    if (!focusReq || !surfaceRef.current) return;
    const el = surfaceRef.current.querySelector(`[data-cls="${focusReq.cls.replace(/["\\]/g, '\\$&')}"]`);
    if (el) el.focus();
  }, [focusReq]);

  const toggleScope = useCallback((id) => {
    if (typedIds.includes(id)) setQuery((q) => stripVariantWords(q, id));
    else setScopeIds((ids) => toggleVariant(ids, id));
    clear();
    setPending([]);
  }, [typedIds, clear]);

  const flashed = useCallback((hit) => setAwaiting((a) => a.filter((c) => !hit.includes(c))), []);

  const loadExample = useCallback((ex) => loadEditorState(editor, ex.state), [editor]);
  const tryPhrase = useCallback((p) => {
    setQuery(p);
    fieldRef.current?.focus();
  }, []);

  live.current = { target, query, moreOpen };

  // Cmd/Ctrl+K focuses the field from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        fieldRef.current?.focus();
        fieldRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // ---------- Keyboard ----------

  const onPanelKeyDown = (e) => {
    if (e.target === fieldRef.current || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (/^[1-7]$/.test(e.key)) {
      e.preventDefault();
      setIntent(INTENT_TABS[Number(e.key) - 1].id);
    } else if ((e.key === '[' || e.key === ']') && intent === 'color') {
      e.preventDefault();
      setColorProp((p) => cycleProp(p, e.key === ']' ? 1 : -1));
    } else if (e.key.length === 1 && e.key !== ' ' && !/^[[\]]$/.test(e.key)) {
      e.preventDefault();
      setQuery((q) => q + e.key);
      fieldRef.current?.focus();
    }
  };

  const onFieldKeyDown = (e) => {
    if (e.key === 'Escape') {
      // Esc clears the query first, then leaves the field. Never reaches the page selection.
      e.stopPropagation();
      if (moreOpen) setMoreOpen(false);
      else if (previewing.current || query) {
        onLeave();
        setQuery('');
      } else e.currentTarget.blur();
    } else if (e.key === 'Enter') {
      const first = intent === 'anything' ? result?.items[0] : candidates[0];
      if (first) {
        e.preventDefault();
        applyItem(first);
      } else if (unresolved) {
        ideas.askNow();
      }
    } else if (e.key === 'ArrowDown') {
      const next = rootRef.current?.querySelector('.shelf-cards [data-nav]') || rootRef.current?.querySelector('.shelf-ideas [data-nav]') || rootRef.current?.querySelector('.shelf-surface [data-nav]');
      if (next) {
        e.preventDefault();
        next.focus();
      }
    }
  };

  const showCards = intent !== 'anything' && candidates.length > 0;
  const status = note
    || (scrub ? `${scrub.from || 'none'} -> ${scrub.to}` : null)
    || (hasTarget ? 'Hover a value to preview it on the page. Click to apply.' : 'Click text in the page to style it.');
  const previewOf = (it) => onPreview(it.bundle || [it.cls], null, it.removed);

  return (
    <div ref={rootRef} className="panel-inner" onKeyDown={onPanelKeyDown}>
      <section className="panel-block make-it" aria-label="Make it">
        <div className="shelf-field">
          <label className="shelf-label" htmlFor="shelf-make-it">Make it</label>
          <input
            id="shelf-make-it"
            ref={fieldRef}
            className="shelf-input"
            type="text"
            value={query}
            placeholder="bigger, background blue, hover red, p-8"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={ideas.warmUp}
            onKeyDown={onFieldKeyDown}
          />
          <kbd className="shelf-kbd" title="Focus this field">Ctrl K</kbd>
        </div>

        <VariantBar
          scope={effective}
          typed={typedIds}
          onToggle={toggleScope}
          onBase={() => { setScopeIds([]); setQuery((q) => typedIds.reduce(stripVariantWords, q)); }}
          moreOpen={moreOpen}
          onMore={setMoreOpen}
        />

        {/* One line that is always there, so hover text never moves the controls under the pointer. */}
        <div className={`shelf-status${note ? ' is-warn' : scrub ? ' is-scrub' : ''}`} role="status" title={status}>{status}</div>
        {result?.ambiguity && <div className="shelf-note" role="status">{result.ambiguity.note}</div>}
        {ask && <Ambiguity ask={ask} onPick={setQuery} />}
        {showCards && (
          <CandidateStrip items={candidates} onPick={applyItem} onPreview={previewOf} onLeave={onLeave} />
        )}
        {result && result.items.length === 0 && !ask && !(reference && reference.tokens) && (reference?.message || result.hints[0]) && (
          <div className="shelf-note">{reference?.message || result.hints[0]}</div>
        )}

        <div className="browse">
          <button
            type="button"
            className="browse-toggle"
            aria-expanded={browse}
            onClick={() => { if (browse) setIntent(null); setBrowse(!browse); }}
          >
            <span className="browse-caret" aria-hidden="true">{browse ? '-' : '+'}</span> Browse
          </button>
          {browse && (
            <div className="browse-body">
              <TabRow intent={intent} onPick={setIntent} />
              <IntentSurface
                intent={intent}
                classes={target.classes}
                wire={wire}
                space={space}
                onSpace={setSpace}
                colorProp={colorProp}
                onColorProp={setColorProp}
                family={family}
                onFamily={setFamily}
                query={query}
                results={result}
                onApply={apply}
                onPreview={onPreview}
                onLeave={onLeave}
                surfaceRef={surfaceRef}
              />
            </div>
          )}
        </div>

        <IdeasRow
          state={ideas.state}
          items={ideas.items}
          onPick={applyItem}
          onPreview={previewOf}
          onLeave={onLeave}
          onEnable={ideas.enable}
        />
      </section>

      {hasTarget ? (
        <ElementRows
          target={target}
          css={css}
          rejected={rejectedSet}
          promoted={promotedSet}
          loading={loading}
          pending={pending}
          awaiting={awaiting}
          onFlashed={flashed}
          onOpen={openChip}
          onRemove={remove}
        />
      ) : (
        <Landing css={css} used={used} onTry={tryPhrase} onExample={loadExample} />
      )}
    </div>
  );
}
