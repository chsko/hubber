/** Hubbr mark: a hub with three members. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="17" className="fill-primary" />
        <circle cx="18" cy="18" r="5" className="fill-bg" />
        <circle cx="18" cy="7.5" r="3" className="fill-accent" />
        <circle cx="27.5" cy="23.5" r="3" className="fill-accent" />
        <circle cx="8.5" cy="23.5" r="3" className="fill-accent" />
      </svg>
      <span className="text-2xl font-extrabold tracking-tight text-primary">hubbr</span>
    </span>
  );
}
