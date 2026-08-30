'use client';

// Registration: username, email, explicit consent to receive email. The verify
// link arrives by email in production; in dev (no mail key) it renders on screen.

import { useState } from 'react';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ sent: boolean; devLink?: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, consent }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? 'Registration failed.');
      else setDone({ sent: d.sent, devLink: d.devLink });
    } catch {
      setError('Registration failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pt-14 max-w-md mx-auto">
      <div className="label mb-2">Access / Registration</div>
      <h1 className="headline text-3xl mb-2">Join HoopsAi</h1>
      <p className="text-muted text-[13px] mb-6">
        Free account: upload your own models, use the Knowledge Hub, and chat with Shimi during games.
      </p>

      {!done && (
        <div className="panel p-5 space-y-4">
          <div>
            <label htmlFor="reg-username" className="label mb-1.5 block">Username</label>
            <input
              id="reg-username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && username && email && consent && submit()}
              placeholder="courtside_ed"
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="reg-email" className="label mb-1.5 block">Email</label>
            <input
              id="reg-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && username && email && consent && submit()}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer text-[12px] text-muted leading-relaxed">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--green)]" />
            <span>I approve receiving email from HoopsAi: the verification email now, and product updates later. Reply to any email to stop them.</span>
          </label>
          {error && <div className="text-red text-[12px]">{error}</div>}
          <button className="btn btn-green w-full" onClick={submit} disabled={busy || !username || !email || !consent}>
            {busy ? 'Registering...' : 'Register →'}
          </button>
        </div>
      )}

      {done && (
        <div className="panel p-5">
          <div className="label mb-2" style={{ color: 'var(--green)' }}>✓ Almost there</div>
          {done.sent ? (
            <p className="text-[13px] leading-relaxed">
              We sent a verification link to <b>{email}</b>. Click it to activate your account.
            </p>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed mb-3">
                The email service is not configured yet (dev mode), so here is your verification link directly:
              </p>
              <a href={done.devLink} className="btn btn-green w-full">Verify {username} now →</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
