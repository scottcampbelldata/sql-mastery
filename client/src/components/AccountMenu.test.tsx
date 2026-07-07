import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../state/AuthContext', () => ({ useAuth: () => ({ user: null, status: 'anon', signOut: vi.fn() }) }));
vi.mock('./GoogleSignIn', () => ({ GoogleSignIn: () => <div>sign in</div> }));

import { AccountMenu } from './AccountMenu';

describe('AccountMenu', () => {
  it('does not render a global reset button (reset is per-lesson only)', () => {
    render(<AccountMenu />);
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
  });
});
