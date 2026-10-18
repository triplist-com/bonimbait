'use client';

import { useEffect } from 'react';
import { Home, MessageCircle, RotateCcw } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import SystemPage from '@/components/system/SystemPage';
import { captureException } from '@/lib/monitoring';

/** 500 inside the site chrome: say it's on us, offer a retry and a person. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <SystemPage
      code="500"
      icon="/brand/stages/frame.svg"
      eyebrow="תקלה זמנית"
      title="משהו נתקע אצלנו בדרך"
      description="זה לא אתם, זה אנחנו. נסו לטעון את הדף שוב בעוד רגע. אם זה חוזר, כתבו לנו ונטפל בזה."
    >
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button size="lg" iconStart={<RotateCcw />} onClick={reset}>
          נסו שוב
        </Button>
        <ButtonLink href="/" variant="outline" size="lg" iconStart={<Home />}>
          לדף הבית
        </ButtonLink>
        <ButtonLink href="/contact/" variant="ghost" size="lg" iconStart={<MessageCircle />}>
          כתבו לנו
        </ButtonLink>
      </div>
      {error.digest && (
        <p className="mt-6 text-caption text-ink-500">
          קוד התקלה, אם תרצו לספר לנו: <span className="num font-semibold">{error.digest}</span>
        </p>
      )}
    </SystemPage>
  );
}
