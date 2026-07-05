import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface-2)', color: 'var(--ink-strong)', fontSize: '0.9rem', borderRadius: 'var(--r-md)' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--brand)' },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--ink-faint)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-dim)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--brand-soft) !important' }
}, { dark: true });

export function SqlEditor({ value, onChange, onSubmit, placeholder, minHeight = '140px' }) {
  const submitKeymap = EditorView.domEventHandlers({
    keydown: (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        onSubmit?.();
        return true;
      }
      return false;
    }
  });
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <CodeMirror
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={minHeight}
        theme={theme}
        extensions={[sql(), submitKeymap]}
        basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: true, highlightActiveLine: true }}
      />
    </div>
  );
}
