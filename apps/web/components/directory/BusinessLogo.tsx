/** Business logo with an initial-letter fallback. Plain <img>: logos come from several hosts. */
export default function BusinessLogo({
  name,
  src,
  className = 'h-16 w-16',
}: {
  name: string;
  src: string | null;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`לוגו ${name}`}
        loading="lazy"
        decoding="async"
        className={`${className} shrink-0 rounded-xl border border-gray-100 bg-white object-contain`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-primary-50 text-2xl font-bold text-primary-700`}
    >
      {name.trim().charAt(0)}
    </span>
  );
}
