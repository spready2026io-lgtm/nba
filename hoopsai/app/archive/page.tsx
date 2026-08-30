import type { Metadata } from 'next';
import ArchiveList from '@/components/ArchiveList';
import archiveIndex from '@/data/archive-index.json';
import type { ArchiveEntry } from '@/lib/types';

export const metadata: Metadata = {
  title: 'The Archive | HoopsAi',
  description:
    'Revisit the moments that moved the line: final scores, probability swings, and the games where certainty came apart.',
};

export default function ArchivePage() {
  const archive = archiveIndex as ArchiveEntry[];
  // derive the season label from the data itself so a retrain can never strand it
  const years = archive.filter((a) => a.date).map((a) => new Date(a.date!).getUTCFullYear());
  const seasonLabel = years.length
    ? `${Math.min(...years)}-${String(Math.max(...years)).slice(2)} season`
    : 'season archive';
  return (
    <div className="px-4 md:px-8 pt-10 max-w-[1200px] mx-auto">
      <div className="label mb-2 flex items-center gap-2" style={{ color: 'var(--green)' }}>
        <span>✦</span> Game intelligence / Archive
      </div>
      <h1 className="headline text-4xl md:text-6xl">
        The archive<span className="text-faint">.</span>
      </h1>
      <div className="flex flex-wrap items-end justify-between gap-4 mt-4">
        <p className="text-muted max-w-md text-[13.5px] leading-relaxed">
          Revisit the moments that moved the line. Explore final scores, probability swings, and the games where certainty
          came apart.
        </p>
        <span className="panel-inset px-3 py-2 label-faint">🗓 {seasonLabel}</span>
      </div>

      <ArchiveList archive={archive} />
    </div>
  );
}
