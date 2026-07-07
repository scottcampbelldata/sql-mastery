import { useAuth } from '../state/AuthContext';
import { GoogleSignIn } from './GoogleSignIn';
import { resetAllProgress } from '../lib/progress';

function resetEverything() {
  if (window.confirm('Reset EVERYTHING on this device? This wipes your learning path, checkpoints, interview problem bank progress, and every lesson checkmark. It cannot be undone.')) {
    resetAllProgress();
    window.location.href = '/';
  }
}

export function AccountMenu() {
  const { user, status, signOut } = useAuth();
  if (status === 'loading') return null;
  return (
    <div className="sync-box">
      {!user ? (
        <>
          <span className="sync-label">Save progress across devices</span>
          <GoogleSignIn />
        </>
      ) : (
        <>
          <span className="sync-status">Signed in as {user.name || user.email}</span>
          <button type="button" className="sync-link" onClick={signOut}>Sign out</button>
        </>
      )}
      <button type="button" className="sync-link danger" onClick={resetEverything}>Reset everything</button>
    </div>
  );
}
