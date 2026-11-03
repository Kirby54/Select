/** The Select mark: an open square in front of a second one — a selection the agent can step out of once it has earned it. */
export function Logo({ className, title = "Select" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 20.5 20.5" className={className} fill="currentColor" {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}>
      <path d="M9.5 3H4.5A4 4 0 0 0 .5 7v9a4 4 0 0 0 4 4h9a4 4 0 0 0 4-4v-5a1 1 0 0 0-2 0v5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5a1 1 0 0 0 0-2Z" />
      <path d="M3.5359 2.5A4 4 0 0 1 7 .5h9a4 4 0 0 1 4 4v9a4 4 0 0 1-2 3.4641V4.5a2 2 0 0 0-2-2Z" />
    </svg>
  );
}
