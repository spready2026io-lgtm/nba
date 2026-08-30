// The Seam mark: a basketball whose seam is a win probability trace, green above
// the 50/50 line and red along it. Chosen 2026-08-30.
//
// The trace is drawn to sit inside the ball rather than being clipped to it, so
// the mark needs no clipPath and therefore no unique id, which keeps it safe to
// render more than once on a page and safe to inline in a server component.

export default function Logo({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx="60" cy="60" r="46" fill="none" stroke="var(--text)" strokeWidth="8" />
      <line x1="22" y1="60" x2="98" y2="60" stroke="var(--red)" strokeWidth="5" />
      <path
        d="M22 68 L44 52 L60 44 L78 62 L98 48"
        fill="none"
        stroke="var(--green)"
        strokeWidth="10"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
