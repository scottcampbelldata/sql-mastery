import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from './DataTable';

describe('DataTable', () => {
  it('renders NULL cells distinctly and caps rows with a notice', () => {
    const columns = ['a'];
    const rows = Array.from({ length: 120 }, (_, i) => ({ a: i === 0 ? null : i }));
    render(<DataTable columns={columns} rows={rows} maxRows={100} />);
    expect(screen.getByText('NULL')).toHaveClass('cell-null');
    expect(screen.getByText(/first 100 of 120/i)).toBeInTheDocument();
  });
  it('renders an explicit zero-rows state', () => {
    render(<DataTable columns={['a']} rows={[]} />);
    expect(screen.getByText(/0 rows/i)).toBeInTheDocument();
  });
});
