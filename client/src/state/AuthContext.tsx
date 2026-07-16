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
      .then(async (r) => {
        if (!alive) return;
        setUser(r.user);
        setStatus('ready');
        // Pull this account's progress on load; if it brings anything newer than what is in
        // this browser, reload so the pulled state shows immediately (the learning state is
        // read once at mount and would otherwise sit stale until a manual refresh).
        try { if (await syncNow()) window.location.reload(); } catch { /* offline is fine */ }
      })
      .catch(() => { if (alive) { writeToken(null); setAuthToken(null); setStatus('ready'); } });
    return () => { alive = false; };
  }, []);

  // While signed in, push local progress periodically and when the tab hides.
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => { pushIfChanged(); }, 15000);
    const onHide = () => { if (document.hidden) pushIfChanged(); };
    const onPageHide = () => { pushIfChanged(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [user]);

  // And pull when the tab comes back into focus (throttled), so switching devices
  // converges without anyone hunting for a Sync button: the leaving device pushes on
  // hide, the arriving device pulls on focus.
  useEffect(() => {
    if (!user) return;
    let lastPull = 0;
    const pull = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastPull < 60000) return;
      lastPull = now;
      void syncNow();
    };
    window.addEventListener('focus', pull);
    document.addEventListener('visibilitychange', pull);
    return () => {
      window.removeEventListener('focus', pull);
      document.removeEventListener('visibilitychange', pull);
    };
  }, [user]);

  const signIn = useCallback(async (idToken: string) => {
    const res = await api.auth.google(idToken);
    writeToken(res.token);
    setAuthToken(res.token);
    setUser(res.user);
    // Merge this browser's progress with the account, then reload if the account brought in
    // anything newer so the just-signed-in device lands on the synced spot.
    const changed = await syncNow();
    if (changed) window.location.reload();
  }, []);

  const signOut = useCallback(() => {
    writeToken(null);
    setAuthToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, status, signIn, signOut }}>{children}</Ctx.Provider>;
}
