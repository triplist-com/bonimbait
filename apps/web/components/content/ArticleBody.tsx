import './article.css';

interface ArticleBodyProps {
  /** Already sanitized by lib/content/sanitize.ts (prepareContentHtml). */
  html: string;
  className?: string;
}

/** Long-form Hebrew content body with the site's prose typography. */
export default function ArticleBody({ html, className = '' }: ArticleBodyProps) {
  if (!html.trim()) return null;
  return <div className={`bb-prose ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
