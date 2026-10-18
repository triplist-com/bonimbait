import { Home } from 'lucide-react';
import AskForm from '@/components/ask/AskForm';
import { ButtonLink } from '@/components/ui/Button';
import SystemPage, { SystemDestinations } from '@/components/system/SystemPage';

/** 404: an empty plot. Question first (the ask box), then the main destinations. */
export default function NotFound() {
  return (
    <SystemPage
      code="404"
      icon="/brand/stages/land.svg"
      eyebrow="שגיאה 404"
      title="הגעתם למגרש ריק"
      description="הדף שחיפשתם לא קיים, או שהכתובת שלו השתנתה. במקום לחפש, שאלו אותנו: נמצא לכם את התשובה בסרטונים ובמאמרים של בונים בית."
    >
      <div className="mx-auto max-w-2xl text-start">
        <AskForm size="lg" rotate label="מה חיפשתם?" />
      </div>
      <div className="mx-auto max-w-2xl">
        <SystemDestinations />
        <ButtonLink href="/" variant="ghost" className="mt-6" iconStart={<Home />}>
          לדף הבית
        </ButtonLink>
      </div>
    </SystemPage>
  );
}
