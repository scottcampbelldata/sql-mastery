import { useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface-2)', color: 'var(--ink-strong)', fontSize: '0.9rem', borderRadius: 'var(--r-md)' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--brand)' },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--ink-faint)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-dim)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--brand-soft) !important' }
}, { dark: true });

export function SqlEditor({ value, onChange, onSubmit, placeholder, minHeight = '140px', ariaLabel = 'SQL editor' }) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const extensions = useMemo(() => [
    sql(),
    Prec.highest(keymap.of([{
      key: 'Mod-Enter',
      run: () => {
        onSubmitRef.current?.();
        return true;
      }
    }])),
    EditorView.contentAttributes.of({ 'aria-label': ariaLabel })
  ], [ariaLabel]);
  return (
    <div className="sql-editor-frame">
      <CodeMirror
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={minHeight}
        theme={theme}
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: true, highlightActiveLine: true }}
      />
    </div>
  );
}
