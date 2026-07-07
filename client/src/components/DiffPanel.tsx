import type { SqlDiff } from '../types';

const plural = (n: number): string => (n === 1 ? '' : 's');
const cols = (list?: string[]): string => `[${(list || []).join(', ')}]`;

function detail(diff: SqlDiff): string {
  const parts: string[] = [];
  if (diff.extraRows) parts.push(`${diff.extraRows} extra row${plural(diff.extraRows)}`);
  if (diff.missingRows) parts.push(`${diff.missingRows} missing row${plural(diff.missingRows)}`);
  return parts.length ? `${parts.join(', ')}.` : '';
}

function lines(diff: SqlDiff): string[] {
  if (diff.reason === 'columns') {
    return [`Output columns differ.`, `Yours: ${cols(diff.yourColumns)}`, `Expected: ${cols(diff.expectedColumns)}`];
  }
  const count = `You returned ${diff.yourRowCount} row${plural(diff.yourRowCount)}, expected ${diff.expectedRowCount}.`;
  if (diff.reason === 'row-count') {
    const d = detail(diff);
    return d ? [count, d] : [count];
  }
  if (diff.orderOnly) return ['Right rows, wrong order. Add or fix your ORDER BY.'];
  const d = detail(diff);
  return d ? ['Same shape, but some rows differ.', d] : ['Same shape, but some values differ.'];
}

export function DiffPanel({ diff }: { diff: SqlDiff }) {
  return (
    <div className="diff-panel" role="note">
      <span className="diff-panel-label">How your result differs</span>
      <ul className="diff-panel-list">
        {lines(diff).map((line, i) => <li key={i}>{line}</li>)}
      </ul>
    </div>
  );
}
