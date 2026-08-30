'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="px-4 pt-14 max-w-md mx-auto label-faint">Verifying...</div>}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'ok' | 'err'>(token ? 'working' : 'err');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(token ? '' : 'No verification token in this link.');

  useEffect(() => {
    if (!token) return;
    fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) {
          setUsername(d.username);
          setState('ok');
        } else {
          setError(d.error ?? 'Verification failed.');
          setState('err');
        }
      })
      .catch(() => {
        setError('Verification failed. Try the link again.');
        setState('err');
      });
  }, [token]);

  return (
    <div className="px-4 pt-14 max-w-md mx-auto">
      <div className="label mb-2">Access / Verification</div>
      {state === 'working' && <div className="panel p-5 label-faint">Verifying your email...</div>}
      {state === 'ok' && (
        <div className="panel p-5">
          <h1 className="headline text-2xl mb-2">
            Welcome, {username}<span className="text-green">.</span>
          </h1>
          <p className="text-muted text-[13px] mb-4">Your account is verified and you are signed in.</p>
          <div className="flex gap-2">
            <Link href="/" className="btn btn-green flex-1">Open the dashboard</Link>
            <Link href="/hub" className="btn flex-1">Knowledge Hub</Link>
          </div>
        </div>
      )}
      {state === 'err' && (
        <div className="panel p-5">
          <div className="text-red font-bold mb-2">Verification failed</div>
          <p className="text-muted text-[13px] mb-4">{error}</p>
          <Link href="/register" className="btn w-full">Back to registration</Link>
        </div>
      )}
    </div>
  );
}
