import { useEffect, useRef, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { serializeEditor } from '../serialize';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';

export default function TailwindClassPlugin({ onContentChange }) {
  const [editor] = useLexicalComposerContext();
  const debouncedChange = useDebouncedCallback(onContentChange, 400);
  const prevRef = useRef({ html: '', classKey: '' });

  const emitSerializedChange = useCallback((editorState, immediate = false) => {
    editorState.read(() => {
      const root = $getRoot();
      const { html, classes } = serializeEditor(root);
      // Skip if content hasn't actually changed (avoids re-compile when CSS injection causes Lexical update)
      const classKey = classes.join(',');
      if (html === prevRef.current.html && classKey === prevRef.current.classKey) return;
      prevRef.current = { html, classKey };
      if (immediate) {
        onContentChange({ html, classes });
      } else {
        debouncedChange({ html, classes });
      }
    });
  }, [debouncedChange, onContentChange]);

  useEffect(() => {
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      emitSerializedChange(editorState);
    });

    // Ensure initial page content is compiled immediately on mount.
    emitSerializedChange(editor.getEditorState(), true);
    return unregister;
  }, [editor, emitSerializedChange]);

  return null;
}
