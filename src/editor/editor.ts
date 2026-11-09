// CodeMirror 6 Python editor, themed with the same CSS variables as the
// Shiki-highlighted static code so both look alike in light and dark mode.

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const highlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--tok-keyword)' },
  { tag: [t.operator, t.compareOperator, t.arithmeticOperator, t.logicOperator, t.updateOperator], color: 'var(--tok-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--tok-string)' },
  { tag: [t.escape, t.special(t.brace)], color: 'var(--tok-constant)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--tok-comment)', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--tok-constant)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], color: 'var(--tok-function)' },
  { tag: [t.definition(t.className), t.className, t.typeName], color: 'var(--tok-type)' },
  { tag: [t.self, t.special(t.variableName)], color: 'var(--tok-constant)' },
  { tag: [t.propertyName], color: 'var(--tok-property)' },
  { tag: [t.meta, t.annotation], color: 'var(--tok-function)' },
  { tag: t.invalid, color: 'var(--tok-invalid)' },
]);

const theme = EditorView.theme({
  '&': { color: 'var(--code-text)', backgroundColor: 'transparent', fontSize: 'var(--code-size)' },
  '&.cm-focused': { outline: 'none' },
  // No ligatures: learners should see `->` and `!=`, not glyphs they can't type.
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', fontVariantLigatures: 'none' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--caret)' },
  '.cm-line': { padding: '0 16px 0 6px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-faint)', border: 'none', paddingLeft: '6px' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '2.2ch', padding: '0 6px 0 4px' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-muted)' },
  '.cm-cursor': { borderLeftColor: 'var(--caret)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-matchingBracket': { backgroundColor: 'var(--bracket-match)', outline: 'none' },
  '.cm-error-line': { backgroundColor: 'var(--err-line)' },
  '.cm-tooltip': { border: '1px solid var(--border)', backgroundColor: 'var(--bg-elev)', borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent-soft)', color: 'var(--text)' },
  '.cm-completionIcon': { opacity: '0.6' },
});

// Highlight the line a traceback points at; cleared on the next edit.
const setErrorLine = StateEffect.define<number | null>();
const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = tr.docChanged ? Decoration.none : value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setErrorLine)) continue;
      const line = effect.value;
      next =
        line && line >= 1 && line <= tr.state.doc.lines
          ? Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(tr.state.doc.line(line).from)])
          : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  onChange?: (value: string) => void;
  /** Mod-Enter. */
  onRun?: () => void;
  readOnly?: boolean;
  label?: string;
}

export interface EditorHandle {
  readonly view: EditorView;
  getValue(): string;
  setValue(value: string): void;
  setErrorLine(line: number | null): void;
  focus(): void;
  destroy(): void;
}

export function createEditor(options: EditorOptions): EditorHandle {
  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ activateOnTyping: true }),
    highlightActiveLine(),
    python(),
    indentUnit.of('    '),
    EditorState.tabSize.of(4),
    syntaxHighlighting(highlightStyle),
    theme,
    errorLineField,
    keymap.of([
      {
        key: 'Mod-Enter',
        preventDefault: true,
        run: () => {
          options.onRun?.();
          return true;
        },
      },
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.contentAttributes.of({ 'aria-label': options.label ?? 'Python code editor', spellcheck: 'false' }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange?.(update.state.doc.toString());
    }),
  ];
  if (options.readOnly) extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));

  const view = new EditorView({ parent: options.parent, state: EditorState.create({ doc: options.doc, extensions }) });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    },
    setErrorLine(line) {
      view.dispatch({ effects: setErrorLine.of(line) });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
