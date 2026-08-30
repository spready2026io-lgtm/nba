'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/archive', label: 'Archive' },
  { href: '/hub', label: 'Knowledge Hub' },
];

export default function NavBar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, [pathname]);

  return (
    <nav
      className="flex items-center justify-between px-4 h-9 border-b text-[10px] uppercase tracking-[0.16em]"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
    >
      <div className="flex items-center gap-5">
        {LINKS.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className="font-bold transition-colors"
              style={{ color: active ? 'var(--green)' : 'var(--muted)' }}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-4">
        {loaded && user && (
          <span className="text-muted">
            <span className="dot dot-green mr-2" />
            {user.username}
          </span>
        )}
        {loaded && !user && (
          <Link href="/register" className="font-bold" style={{ color: 'var(--green)' }}>
            Register
          </Link>
        )}
      </div>
    </nav>
  );
}
