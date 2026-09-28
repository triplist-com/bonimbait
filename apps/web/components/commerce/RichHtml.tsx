/**
 * Render imported WordPress HTML (product descriptions / accordion sections)
 * with basic typography. The HTML comes from our own DB (seeded from the
 * live site or edited by staff), never from visitors.
 */
export default function RichHtml({ html, className = '' }: { html: string; className?: string }) {
  return (
    <div
      className={`space-y-3 leading-relaxed text-gray-700 [&_a]:text-primary [&_a]:underline [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-gray-900 [&_li]:ms-5 [&_strong]:text-gray-900 [&_ul]:list-disc [&_ul]:space-y-1 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
