import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../state/AuthContext', () => ({ useAuth: () => ({ user: null, status: 'anon', signOut: vi.fn() }) }));
vi.mock('./GoogleSignIn', () => ({ GoogleSignIn: () => <div>sign in</div> }));

import { AccountMenu } from './AccountMenu';

describe('AccountMenu', () => {
  it('offers a Reset everything action even when signed out', () => {
    render(<AccountMenu />);
    expect(screen.getByRole('button', { name: /reset everything/i })).toBeInTheDocument();
  });
});
