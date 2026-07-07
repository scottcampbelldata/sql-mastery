import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api, setAuthToken } from '../lib/api';
import { syncNow, pushIfChanged } from '../lib/sync';

const TOKEN_KEY = 'sqlm:auth-token:v1';

export interface AuthUser { sub: string; email: string; name: string; }
interface AuthValue {
  user: AuthUser | null;
  status: 'loading' | 'ready';
  signIn: (idToken: string) => Promise<void>;
  signOut: () => void;
}

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeToken(token: string | null): void {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

const Ctx = createContext<AuthValue | null>(null);
export const useAuth = (): AuthValue => useContext(Ctx) as AuthValue;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    let alive = true;
    const token = readToken();
    if (!token) { setStatus('ready'); return; }
    setAuthToken(token);
    api.me()
      .then((r) => { if (alive) { setUser(r.user); setStatus('ready'); } })
      .catch(() => { if (alive) { writeToken(null); setAuthToken(null); setStatus('ready'); } });
    return () => { alive = false; };
  }, []);

  // While signed in, push local progress periodically and when the tab hides.
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => { pushIfChanged(); }, 15000);
    const onHide = () => { if (document.hidden) pushIfChanged(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', () => pushIfChanged());
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onHide); };
  }, [user]);

  const signIn = useCallback(async (idToken: string) => {
    const res = await api.auth.google(idToken);
    writeToken(res.token);
    setAuthToken(res.token);
    setUser(res.user);
    await syncNow();
  }, []);

  const signOut = useCallback(() => {
    writeToken(null);
    setAuthToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, status, signIn, signOut }}>{children}</Ctx.Provider>;
}
