import { useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL, schemaCompletionSource } from '@codemirror/lang-sql';
import { autocompletion, closeCompletion } from '@codemirror/autocomplete';
import { EditorView, keymap, Decoration, ViewPlugin } from '@codemirror/view';
import { Prec, EditorSelection, RangeSetBuilder } from '@codemirror/state';
import type { Extension, EditorState } from '@codemirror/state';
import type { DbSchemaMap } from '../types';

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface-2)', color: 'var(--ink-strong)', fontSize: '0.9rem', borderRadius: 'var(--r-md)' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--brand)' },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--ink-faint)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-dim)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--brand-soft) !important' },
  // Fill-in-the-blank fields: the ____ runs in starter SQL. Styled so they read as
  // clickable slots; a single click selects the whole run so you can type over it.
  '.cm-blank': { backgroundColor: 'var(--brand-soft)', color: 'var(--brand)', borderRadius: '3px', cursor: 'text' }
}, { dark: true });

// A blank is a run of two or more underscores (the starter SQL uses ____). Real
// identifiers like planet_id / unit_price only ever have single underscores, so a
// run of 2+ never collides with actual column or table names.
const BLANK_RE = /_{2,}/g;

interface Blank {
  from: number;
  to: number;
}

function findBlanks(state: EditorState): Blank[] {
  const blanks: Blank[] = [];
  const text = state.doc.toString();
  BLANK_RE.lastIndex = 0;
  let match;
  while ((match = BLANK_RE.exec(text)) !== null) {
    blanks.push({ from: match.index, to: match.index + match[0].length });
  }
  return blanks;
}

// Select the next (Tab) or previous (Shift-Tab) blank relative to the cursor.
// Returns false when there is no blank in that direction so Tab keeps its normal
// behaviour (e.g. moving focus out of the editor) once every blank is filled.
function moveToBlank(view: EditorView, forward: boolean): boolean {
  const blanks = findBlanks(view.state);
  if (!blanks.length) return false;
  const sel = view.state.selection.main;
  const target = forward
    ? blanks.find((b) => b.from >= sel.to)
    : [...blanks].reverse().find((b) => b.to <= sel.from);
  if (!target) return false;
  view.dispatch({ selection: EditorSelection.range(target.from, target.to), scrollIntoView: true });
  return true;
}

const blankMark = Decoration.mark({ class: 'cm-blank' });

// Highlight every blank so learners can see the slots to fill.
const blankHighlighter = ViewPlugin.fromClass(class {
  decorations: ReturnType<RangeSetBuilder<Decoration>['finish']>;
  constructor(view: EditorView) { this.decorations = this.build(view.state); }
  update(u: { docChanged: boolean; state: EditorState }) { if (u.docChanged) this.decorations = this.build(u.state); }
  build(state: EditorState) {
    const builder = new RangeSetBuilder<Decoration>();
    for (const b of findBlanks(state)) builder.add(b.from, b.to, blankMark);
    return builder.finish();
  }
}, { decorations: (v) => v.decorations });

// A single click anywhere inside a blank selects the whole run, so the next
// keystroke replaces it. No backspacing required.
const blankClick = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    if (event.button !== 0) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const blank = findBlanks(view.state).find((b) => pos >= b.from && pos <= b.to);
    if (!blank) return false;
    view.dispatch({ selection: EditorSelection.range(blank.from, blank.to) });
    view.focus();
    event.preventDefault();
    return true;
  }
});

const blankFields = [blankHighlighter, blankClick];

// A flat completion of every table + column name in the schema, so typing a bare
// prefix (e.g. "na") suggests "name" even without a table qualifier. No keywords.
function flatIdentifierSource(schema: DbSchemaMap) {
  const words = new Set<string>();
  for (const table of Object.keys(schema)) {
    words.add(table);
    for (const col of schema[table] || []) words.add(col);
  }
  const options = [...words].map((w) => ({ label: w, type: schema[w] ? 'type' : 'property' }));
  return (context: any) => {
    const word = context.matchBefore(/\w+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return { from: word.from, options, validFor: /^\w*$/ };
  };
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  minHeight?: string;
  ariaLabel?: string;
  schema?: DbSchemaMap | null;
}

export function SqlEditor({ value, onChange, onSubmit, placeholder, minHeight = '140px', ariaLabel = 'SQL editor', schema }: Props) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const extensions = useMemo<Extension[]>(() => [
    sql({ dialect: PostgreSQL, schema: schema || undefined, upperCaseKeywords: false }),
    // Soft-wrap long lines instead of scrolling horizontally: a starter query or a
    // long expression stays fully visible and reads top to bottom.
    EditorView.lineWrapping,
    ...blankFields,
    Prec.highest(keymap.of([
      {
        key: 'Mod-Enter',
        run: (view) => {
          // Dismiss any open autocomplete popup so it doesn't linger over the
          // editor after the query runs.
          closeCompletion(view);
          onSubmitRef.current?.();
          return true;
        }
      },
      { key: 'Tab', run: (view) => moveToBlank(view, true) },
      { key: 'Shift-Tab', run: (view) => moveToBlank(view, false) }
    ])),
    EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
    // With a schema, complete ONLY the real tables/columns: the context-aware source
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
        onCreateEditor={(view) => {
          // Pre-select the first blank so the learner can type immediately.
          const blanks = findBlanks(view.state);
          if (blanks.length) {
            view.dispatch({ selection: EditorSelection.range(blanks[0].from, blanks[0].to) });
          }
        }}
      />
    </div>
  );
}
