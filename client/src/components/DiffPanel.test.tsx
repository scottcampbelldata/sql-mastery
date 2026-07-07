import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffPanel } from './DiffPanel';

describe('DiffPanel', () => {
  it('shows both column lists on a column mismatch', () => {
    render(<DiffPanel diff={{ reason: 'columns', yourColumns: ['a'], expectedColumns: ['a', 'revenue'], yourRowCount: 5, expectedRowCount: 5, orderOnly: false, extraRows: 0, missingRows: 0 }} />);
    expect(screen.getByText(/output columns differ/i)).toBeInTheDocument();
    expect(screen.getByText(/revenue/)).toBeInTheDocument();
  });
  it('shows the row-count delta with extra and missing', () => {
    render(<DiffPanel diff={{ reason: 'row-count', yourRowCount: 12, expectedRowCount: 10, orderOnly: false, extraRows: 3, missingRows: 1 }} />);
    expect(screen.getByText(/12 rows, expected 10/i)).toBeInTheDocument();
    expect(screen.getByText(/3 extra/i)).toBeInTheDocument();
  });
  it('calls out an order-only difference', () => {
    render(<DiffPanel diff={{ reason: 'row-values', yourRowCount: 5, expectedRowCount: 5, orderOnly: true, extraRows: 0, missingRows: 0 }} />);
    expect(screen.getByText(/right rows, wrong order/i)).toBeInTheDocument();
  });
});
