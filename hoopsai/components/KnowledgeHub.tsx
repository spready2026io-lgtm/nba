'use client';

// Knowledge Hub: import CSV/PDF models or connect a live URL; see connected
// sources with sync status. Registered users only, per the spec.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { UploadedSource } from '@/lib/types';

export default function KnowledgeHub() {
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sources, setSources] = useState<UploadedSource[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [meR, srcR] = await Promise.all([fetch('/api/me'), fetch('/api/sources')]);
      setUser(meR.ok ? (await meR.json()).user : null);
      if (srcR.ok) setSources((await srcR.json()).sources ?? []);
    } catch {
      // keep last state
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
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json();
      setNotice(r.ok ? { kind: 'ok', text: d.source?.summary ?? 'Uploaded.' } : { kind: 'err', text: d.error ?? 'Upload failed.' });
      await refresh();
    } catch {
      setNotice({ kind: 'err', text: 'Upload failed.' });
    } finally {
      setBusy(false);
    }
  };

  const importUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await r.json();
      setNotice(r.ok ? { kind: 'ok', text: 'Source connected.' } : { kind: 'err', text: d.error ?? 'Import failed.' });
      if (r.ok) setUrl('');
      await refresh();
    } catch {
      setNotice({ kind: 'err', text: 'Import failed.' });
    } finally {
      setBusy(false);
    }
  };

  const synced = sources.filter((s) => s.status === 'synced').length;

  return (
    <div className="px-4 md:px-8 pt-10 max-w-[1200px] mx-auto">
      <div className="label mb-2 flex items-center gap-2">
        <span className="dot dot-green" /> Knowledge / Sources
      </div>
      <h1 className="headline text-4xl md:text-5xl">Knowledge Hub</h1>
      <div className="flex flex-wrap items-end justify-between gap-4 mt-3">
        <p className="text-muted max-w-md text-[13.5px] leading-relaxed">
          Bring your basketball intelligence together. Upload CSV or PDF models that Shimi folds into your charts, and keep
          your source links in one place.
        </p>
        <span className="panel-inset px-3 py-2 label-faint">
          <span className="text-green">▁▂▃ {sources.length}</span> active sources
        </span>
      </div>

      {loaded && !user && (
        <div className="panel p-8 mt-8 text-center max-w-md mx-auto">
          <div className="label mb-2">Registered users only</div>
          <p className="text-muted text-[13px] mb-4">
            The Knowledge Hub stores your uploaded models and connected feeds. Register free to use it.
          </p>
          <Link href="/register" className="btn btn-green">Register free</Link>
        </div>
      )}

      {loaded && user && (
        <div className="grid gap-5 lg:grid-cols-2 mt-8">
          {/* import */}
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="label-faint">Add intelligence</div>
                <div className="headline text-xl">Import your data</div>
              </div>
              <span className="flex items-center justify-center w-9 h-9 rounded" style={{ background: 'var(--blue)' }}>⛁</span>
            </div>

            <div
              className="mt-4 rounded-lg border border-dashed p-10 text-center cursor-pointer transition-colors outline-none focus:border-[var(--green)]"
              style={{ borderColor: dragOver ? 'var(--green)' : 'var(--border-strong)', background: 'var(--panel-2)' }}
              role="button"
              tabIndex={0}
              aria-label="upload a CSV or PDF file"
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) upload(f);
              }}
            >
              <div className="text-2xl mb-2">⭱</div>
              <div className="font-bold">Drop files here or browse</div>
              <div className="label-faint mt-1">CSV or PDF · up to 4 MB</div>
            </div>
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

            <div className="label-faint text-center my-4">─── or save a source link ───</div>
            <label htmlFor="hub-url" className="label mb-1.5 block">Source URL</label>
            <div className="flex gap-2">
              <input
                id="hub-url"
                className="input"
                placeholder="https://data.source.com/feed"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && importUrl()}
              />
              <button
                className="btn !px-4"
                style={{ background: 'var(--blue)', borderColor: 'var(--blue)', color: '#fff' }}
                onClick={importUrl}
                disabled={busy || !url.trim()}
                aria-label="save source URL"
              >
                +
              </button>
            </div>

            {notice && (
              <div className={`mt-3 text-[12px] ${notice.kind === 'ok' ? 'text-green' : 'text-red'}`}>{notice.text}</div>
            )}

            <div className="panel-inset p-3 mt-5 text-[11px] text-muted leading-relaxed">
              <div className="label-faint mb-1">CSV formats Shimi reads</div>
              <code className="text-green">metric,value</code> with a <code>home_prior_adjust,&lt;points&gt;</code> row shifts the
              pregame prior on your charts. <code className="text-green">game_fraction,home_wp</code> rows (0 to 1) draw your own
              model as an overlay line. PDFs are read by Shimi for stated model parameters.
            </div>
          </div>

          {/* connected sources */}
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="label-faint">Your library</div>
                <div className="headline text-xl">Connected Sources</div>
              </div>
              <span className="label-faint">{String(sources.length).padStart(2, '0')} records</span>
            </div>

            <div className="space-y-2.5">
              {sources.map((s) => (
                <div key={s.id} className="panel-inset p-3 flex items-center gap-3">
                  <span
                    className="flex items-center justify-center w-9 h-9 rounded shrink-0"
                    style={{ background: s.kind === 'url' ? 'rgba(77,255,102,0.15)' : s.kind === 'pdf' ? 'rgba(255,54,72,0.15)' : 'rgba(63,140,255,0.15)' }}
                  >
                    {s.kind === 'url' ? '🔗' : s.kind === 'pdf' ? '▤' : '⛁'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[13px] truncate">{s.name}</div>
                    {s.summary && <div className="text-[11px] text-muted truncate" title={s.summary}>{s.summary}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`label-faint flex items-center gap-1.5 justify-end ${s.status === 'synced' ? 'text-green' : s.status === 'processing' ? 'text-amber' : 'text-red'}`}>
                      {s.status === 'synced' ? '✓' : s.status === 'processing' ? '↻' : '✕'} {s.status}
                    </div>
                    <div className="label-faint mt-0.5">{timeAgo(s.addedAt)}</div>
                  </div>
                </div>
              ))}
              {sources.length === 0 && <div className="label-faint py-6 text-center">Nothing connected yet.</div>}
            </div>

            {synced > 0 && (
              <div className="mt-4 panel-inset px-3 py-2.5 text-[12px] flex items-center justify-between" style={{ borderColor: 'var(--green-dim)' }}>
                <span><span className="text-green">✓</span> {synced === sources.length ? 'All synced sources are ready to query' : `${synced} of ${sources.length} sources ready to query`}</span>
                <Link href="/" className="text-green">↗</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)}d ago`;
}
