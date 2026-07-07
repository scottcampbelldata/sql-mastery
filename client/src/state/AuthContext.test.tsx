import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import * as apiModule from '../lib/api';

function Probe() {
  const { user, status } = useAuth();
  return <div>{status}:{user ? user.email : 'anon'}</div>;
}

beforeEach(() => { localStorage.clear(); });

describe('AuthContext', () => {
  it('restores a session from a stored token', async () => {
    localStorage.setItem('sqlm:auth-token:v1', 'tok');
    vi.spyOn(apiModule.api, 'me').mockResolvedValue({ user: { sub: 'g', email: 'a@b.com', name: 'A' } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('ready:a@b.com')).toBeInTheDocument());
  });

  it('clears a bad token on 401', async () => {
    localStorage.setItem('sqlm:auth-token:v1', 'bad');
    vi.spyOn(apiModule.api, 'me').mockRejectedValue(new Error('401'));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('ready:anon')).toBeInTheDocument());
    expect(localStorage.getItem('sqlm:auth-token:v1')).toBe(null);
  });
});
