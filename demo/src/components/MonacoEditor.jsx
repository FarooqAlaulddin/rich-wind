import { useRef, useEffect } from 'preact/hooks';
import { useMonacoEditor } from '../hooks/useMonaco';

export function MonacoEditor({ language, value, onChange, visible }) {
  const containerRef = useRef(null);
  const { layout } = useMonacoEditor(containerRef, { language, value, onChange });

  useEffect(() => {
    if (visible) layout();
  }, [visible, layout]);

  return <div ref={containerRef} class="editor-shell" style={{ width: '100%', height: '100%' }} />;
}
