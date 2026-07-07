import { useAuth } from '../state/AuthContext';
import { GoogleSignIn } from './GoogleSignIn';

export function AccountMenu() {
  const { user, status, signOut } = useAuth();
  if (status === 'loading') return null;
  if (!user) {
    return (
      <div className="sync-box">
        <span className="sync-label">Save progress across devices</span>
        <GoogleSignIn />
      </div>
    );
  }
  return (
    <div className="sync-box">
      <span className="sync-status">Signed in as {user.name || user.email}</span>
      <button type="button" className="sync-link" onClick={signOut}>Sign out</button>
    </div>
  );
}
