/** The Select mark: three stacked levels, the top one filled — autonomy earned step by step. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Select">
      <rect x="3" y="15" width="18" height="5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
      <rect x="6" y="9" width="12" height="5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.8" />
      <rect x="9" y="3" width="6" height="5" rx="1.5" fill="var(--color-accent)" />
    </svg>
  );
}
