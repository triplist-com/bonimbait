import { FolderLock } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/** A project that doesn't exist and one the visitor can't see look the same (no hint either way). */
export default function ManageNotFound() {
  return (
    <div className="container-page py-12 sm:py-20">
      <EmptyState
        variant="card"
        icon={<FolderLock />}
        title="הפרויקט לא נמצא"
        description="ייתכן שהקישור שגוי, או שהחשבון שאיתו התחברתם לא משויך לפרויקט הזה. פרויקטים בליווי פתוחים רק ללקוח ולצוות הליווי שלו."
        actions={
          <>
            <ButtonLink href="/manage/" variant="secondary" prefetch={false}>
              לפרויקטים שלי
            </ButtonLink>
            <ButtonLink href="/login/?next=/manage/" variant="ghost" prefetch={false}>
              התחברות בחשבון אחר
            </ButtonLink>
          </>
        }
      />
    </div>
  );
}
