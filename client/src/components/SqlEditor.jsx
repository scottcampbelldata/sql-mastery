import { useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL, schemaCompletionSource } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
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

// A flat completion of every table + column name in the schema, so typing a bare
// prefix (e.g. "na") suggests "name" even without a table qualifier. No keywords.
function flatIdentifierSource(schema) {
  const words = new Set();
  for (const table of Object.keys(schema)) {
    words.add(table);
    for (const col of schema[table] || []) words.add(col);
  }
  const options = [...words].map((w) => ({ label: w, type: schema[w] ? 'type' : 'property' }));
  return (context) => {
    const word = context.matchBefore(/\w+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return { from: word.from, options, validFor: /^\w*$/ };
  };
}

export function SqlEditor({ value, onChange, onSubmit, placeholder, minHeight = '140px', ariaLabel = 'SQL editor', schema }) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const extensions = useMemo(() => [
    sql({ dialect: PostgreSQL, schema: schema || undefined, upperCaseKeywords: false }),
    Prec.highest(keymap.of([{
      key: 'Mod-Enter',
      run: () => {
        onSubmitRef.current?.();
        return true;
      }
    }])),
    EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
    // With a schema, complete ONLY the real tables/columns — the context-aware source
    // (tables after FROM, columns after `t.`) plus a flat name source for bare typing.
    // No wall of SQL keywords.
    autocompletion(schema
      ? { override: [schemaCompletionSource({ dialect: PostgreSQL, schema }), flatIdentifierSource(schema)] }
      : {})
  ], [ariaLabel, schema]);
  return (
    <div className="sql-editor-frame">
      <CodeMirror
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={minHeight}
        theme={theme}
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false, highlightActiveLine: true }}
      />
    </div>
  );
}
