import { useState } from 'react';
import { Button } from './ui.jsx';
import { getSyncCode, enableSync, clearSyncCode } from '../lib/sync.js';

// Generate a readable random code (no ambiguous chars).
function randomCode() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  try {
    const arr = new Uint32Array(10);
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < arr.length; i += 1) out += chars[arr[i] % chars.length];
  } catch {
    for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function SyncControl() {
  const active = getSyncCode();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (active) {
    return (
      <div className="sync-box">
        <span className="sync-status">Sync on · <code>{active.slice(0, 3)}•••</code></span>
        <button type="button" className="sync-link" onClick={() => { clearSyncCode(); window.location.reload(); }}>
          Turn off
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="sync-link" onClick={() => { setCode(randomCode()); setOpen(true); }}>
        ⇄ Sync devices
      </button>
    );
  }

  async function turnOn() {
    const value = code.trim();
    if (value.length < 6) return;
    setBusy(true);
    await enableSync(value); // pulls + merges, then reloads
  }

  return (
    <div className="sync-box">
      <label className="sync-label">Enter the same code on every device</label>
      <input
        className="sync-input"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        spellCheck={false}
        autoComplete="off"
        autoFocus
        aria-label="Sync code"
      />
      <div className="sync-actions">
        <Button variant="primary" onClick={turnOn} disabled={busy || code.trim().length < 6}>
          {busy ? 'Syncing…' : 'Turn on'}
        </Button>
        <button type="button" className="sync-link" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
