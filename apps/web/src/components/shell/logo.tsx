/** The Select mark: a pyramid seen from its sunny corner. Lit face, shaded face, one ridge. */
export function Logo({ className, title = "Select" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}>
      <path d="M12 2.5 1.5 20.5h9.2L12 2.5Z" opacity="0.55" />
      <path d="M12 2.5 22.5 20.5h-11.8L12 2.5Z" />
    </svg>
  );
}

/** The brand mark in colour: sand to violet, like the dust around the pyramids. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="sel-lit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#facc15" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
        <linearGradient id="sel-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a68bff" />
          <stop offset="1" stopColor="#4f8cf7" />
        </linearGradient>
      </defs>
      <path d="M12 2.5 1.5 20.5h9.2L12 2.5Z" fill="url(#sel-shade)" />
      <path d="M12 2.5 22.5 20.5h-11.8L12 2.5Z" fill="url(#sel-lit)" />
    </svg>
  );
}
