'use client';

// Admin: tab 1 app stats (registrations, dashboards viewed, files uploaded),
// tab 2 the registered users email list. Password-gated via httpOnly cookie.

import { useCallback, useEffect, useState } from 'react';
import type { Counters } from '@/lib/types';

type AdminUser = {
  username: string;
  email: string;
  consent: boolean;
  verified: boolean;
  createdAt: string;
  verifiedAt: string | null;
};

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'stats' | 'users'>('stats');
  const [counters, setCounters] = useState<Counters | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/data');
      if (!r.ok) {
        setAuthed(false);
        return;
      }
      const d = await r.json();
      setCounters(d.counters);
      setUsers(d.users);
      setAuthed(true);
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; every setState in load() happens after an await
    load();
  }, [load]);

  const login = async () => {
    setError(null);
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? 'Login failed.');
      else await load();
    } catch {
      setError('Login failed.');
    }
  };

  if (authed === null) return <div className="px-4 pt-14 max-w-md mx-auto label-faint">Loading...</div>;

  if (!authed) {
    return (
      <div className="px-4 pt-14 max-w-sm mx-auto">
        <div className="label mb-2">Restricted / Admin</div>
        <div className="panel p-5 space-y-3">
          <input
            className="input"
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
          />
          {error && <div className="text-red text-[12px]">{error}</div>}
          <button className="btn btn-green w-full" onClick={login} disabled={!password}>
            Enter
          </button>
        </div>
      </div>
    );
  }

  const verified = users.filter((u) => u.verified);

  return (
    <div className="px-4 md:px-8 pt-10 max-w-[1000px] mx-auto">
      <div className="label mb-2">Restricted / Admin</div>
      <h1 className="headline text-3xl mb-6">HoopsAi Admin</h1>

      <div className="flex gap-2 mb-6">
        <button className="btn" style={tab === 'stats' ? { borderColor: 'var(--green)', color: 'var(--green)' } : {}} onClick={() => setTab('stats')}>
          App stats
        </button>
        <button className="btn" style={tab === 'users' ? { borderColor: 'var(--green)', color: 'var(--green)' } : {}} onClick={() => setTab('users')}>
          Registered users ({verified.length})
        </button>
      </div>

      {tab === 'stats' && counters && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Registrations (verified)" value={counters.registrations} />
          <StatCard label="Dashboards viewed" value={counters.dashboardViews} />
          <StatCard label="Files uploaded" value={counters.filesUploaded} />
        </div>
      )}

      {tab === 'users' && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                <Th>Username</Th>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th>Consent</Th>
                <Th>Registered</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username} className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-2.5 font-bold">{u.username}</td>
                  <td className="px-4 py-2.5">{u.email}</td>
                  <td className="px-4 py-2.5">
                    {u.verified ? <span className="text-green">verified</span> : <span className="text-amber">pending</span>}
                  </td>
                  <td className="px-4 py-2.5">{u.consent ? 'yes' : 'no'}</td>
                  <td className="px-4 py-2.5 text-muted">{new Date(u.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center label-faint">
                    No registrations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel p-5">
      <div className="label-faint mb-1">{label}</div>
      <div className="headline text-4xl">{value.toLocaleString()}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left label-faint font-normal">{children}</th>;
}
