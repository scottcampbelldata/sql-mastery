import { useEffect, useRef } from 'react';
import { useAuth } from '../state/AuthContext';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function loadGsi(): Promise<void> {
  if (window.google) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const s = document.createElement('script');
    s.src = GSI_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
}

export function GoogleSignIn() {
  const { signIn } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGsi().then(() => {
      if (cancelled || !window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (r) => { signIn(r.credential).catch(() => { /* surfaced by the menu */ }); }
      });
      window.google.accounts.id.renderButton(ref.current, { type: 'standard', theme: 'outline', size: 'medium', text: 'continue_with' });
    }).catch(() => { /* leave the fallback text */ });
    return () => { cancelled = true; };
  }, [signIn]);

  if (!CLIENT_ID) return <span className="sync-status">Sign-in is not configured.</span>;
  return <div ref={ref} aria-label="Sign in with Google" />;
}
