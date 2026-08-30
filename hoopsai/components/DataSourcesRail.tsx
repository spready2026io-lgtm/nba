'use client';

// Left rail: the user's data sources. Registered users upload CSV/PDF models or
// connect a URL; Shimi folds what he can read into the chart (prior adjustment,
// wp overlay). Anonymous visitors get the register prompt.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { UploadedSource } from '@/lib/types';

type Props = {
  adjustHome: number | null;
  adjustSource: string | null;
  onDataChanged?: () => void; // lets the Game Room re-pull its payload after an upload
};

export default function DataSourcesRail({ adjustHome, adjustSource, onDataChanged }: Props) {
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sources, setSources] = useState<UploadedSource[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [meR, srcR] = await Promise.all([fetch('/api/me'), fetch('/api/sources')]);
      const me = meR.ok ? await meR.json() : { user: null };
      setUser(me.user);
      if (srcR.ok) setSources((await srcR.json()).sources ?? []);
    } catch {
      // rail stays in its last state on transient failures
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; every setState in refresh() happens after an await
    refresh();
  }, [refresh]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? 'Upload failed.');
      await refresh();
      if (r.ok) onDataChanged?.();
    } catch {
      setError('Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const importUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? 'Import failed.');
      else setUrl('');
      await refresh();
      if (r.ok) onDataChanged?.();
    } catch {
      setError('Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="label mb-3 px-1">Data sources</div>

      {!loaded && <div className="label-faint px-1">loading...</div>}

      {loaded && !user && (
        <div className="panel p-4">
          <p className="text-[12px] text-muted leading-relaxed mb-3">
            Upload your own models (CSV or PDF) and Shimi will fold them into the chart.
          </p>
          <Link href="/register" className="btn btn-green w-full">
            Register free
          </Link>
        </div>
      )}

      {loaded && user && (
        <div className="space-y-3">
          <button className="btn w-full !justify-start" style={{ borderColor: 'var(--blue)' }} onClick={() => fileRef.current?.click()} disabled={busy}>
            <span className="text-blue">⬆</span> Upload CSV/PDF
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = '';
            }}
          />

          <div className="flex gap-1.5">
            <input
              className="input !py-2 text-[11px]"
              placeholder="Import URL..."
              aria-label="source url to import"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && importUrl()}
            />
            <button className="btn !px-3" onClick={importUrl} disabled={busy || !url.trim()} aria-label="import url">
              +
            </button>
          </div>

          {error && <div className="text-red text-[11px] px-1">{error}</div>}

          {adjustHome != null && (
            <div className="panel-inset p-2.5 text-[11px]">
              <span className="text-blue font-bold">Prior adjusted {adjustHome >= 0 ? '+' : ''}{adjustHome} pts (home)</span>
              {adjustSource && <div className="label-faint mt-1 truncate">from {adjustSource}</div>}
            </div>
          )}

          <div className="space-y-2 mt-1">
            {sources.map((s) => (
              <div key={s.id} className="panel p-2.5">
                <div className="flex items-center gap-2">
                  <span className={s.kind === 'url' ? 'text-green' : s.kind === 'pdf' ? 'text-red' : 'text-blue'}>
                    {s.kind === 'url' ? '🌐' : s.kind === 'pdf' ? '▤' : '▦'}
                  </span>
                  <span className="text-[11.5px] font-bold truncate" title={s.name}>{s.name}</span>
                </div>
                <div className="label-faint mt-1 flex items-center gap-1.5">
                  <span className={`dot ${s.status === 'synced' ? 'dot-green' : s.status === 'processing' ? 'dot-amber' : 'dot-red'}`} />
                  {s.status} · {timeAgo(s.addedAt)}
                </div>
                {s.summary && <div className="text-[10.5px] text-muted mt-1 leading-snug">{s.summary}</div>}
              </div>
            ))}
            {sources.length === 0 && <div className="label-faint px-1">No sources yet.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} mins ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)}d ago`;
}
