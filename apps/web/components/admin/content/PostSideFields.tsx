import FormField, { Section, Select, TextInput } from '../FormField';
import type { AuthorRow, PostCategoryRow } from '@/lib/db/types';

/** Categories (with primary), tags and author for the post editor. Server-rendered inputs. */
export default function PostSideFields({
  categories,
  selected,
  primaryId,
  tags,
  tagSuggestions,
  authors,
  authorId,
}: {
  categories: PostCategoryRow[];
  selected: string[];
  primaryId: string | null;
  tags: string[];
  tagSuggestions: string[];
  authors: AuthorRow[];
  authorId: string | null;
}) {
  return (
    <>
      <Section title="קטגוריות">
        <p className="text-xs text-gray-500">סמנו קטגוריות. הקטגוריה הראשית קובעת את פירורי הלחם והמאמרים הקשורים.</p>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="category_ids" value={c.id} defaultChecked={selected.includes(c.id)} className="h-4 w-4 rounded border-gray-300" />
                {c.name}
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-500" title="קטגוריה ראשית">
                <input type="radio" name="primary_category_id" value={c.id} defaultChecked={primaryId === c.id} />
                ראשית
              </label>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="תגיות וכותב">
        <FormField label="תגיות" htmlFor="tags" hint="מופרדות בפסיק. תגית חדשה תיווצר אוטומטית.">
          <TextInput id="tags" name="tags" defaultValue={tags.join(', ')} list="tag-suggestions" />
          <datalist id="tag-suggestions">
            {tagSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </FormField>
        <FormField label="כותב" htmlFor="author_id">
          <Select id="author_id" name="author_id" defaultValue={authorId ?? ''}>
            <option value="">ללא</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </FormField>
      </Section>
    </>
  );
}
