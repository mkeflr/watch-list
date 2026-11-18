import { useState } from 'react';
import { db } from '../lib/supabase';
import { session } from '../lib/session';

export default function PasscodeGate({ onUnlock }: { onUnlock: () => void }) {
  const [name, setName] = useState(session.name);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (await db.checkPasscode(code)) {
        session.passcode = code;
        session.name = name.trim();
        onUnlock();
      } else {
        setErr('That passcode is not right.');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <img src="icon.svg" alt="" width={56} height={56} />
        <h1>Watchlist</h1>
        <p className="muted">Enter the shared passcode to view and edit the list.</p>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" autoComplete="nickname" required maxLength={40} />
        </label>
        <label>
          Passcode
          <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" required />
        </label>
        {err && <p className="error">{err}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
