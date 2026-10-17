'use client';

import { useEffect } from 'react';
import './globals.css';
import { Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import SystemPage from '@/components/system/SystemPage';
import { captureException } from '@/lib/monitoring';

/**
 * Last-resort boundary: the root layout itself failed, so this renders its own
 * <html>. No site chrome, just the logo, the branded message and a retry.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body className="bg-paper font-sans text-ink-900 antialiased">
        <header className="container-page flex h-16 items-center">
          <a href="/" aria-label="בונים בית: לדף הבית" className="inline-flex text-ink-900">
            <Logo accent className="h-8" />
          </a>
        </header>
        <main>
          <SystemPage
            code="500"
            icon="/brand/stages/frame.svg"
            eyebrow="תקלה זמנית"
            title="משהו נתקע אצלנו בדרך"
            description="זה לא אתם, זה אנחנו. נסו לטעון את הדף שוב בעוד רגע."
          >
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" iconStart={<RotateCcw />} onClick={reset}>
                נסו שוב
              </Button>
              {/* A full reload: the client router may be the thing that broke. */}
              <a href="/" className="inline-flex h-12 items-center gap-2 rounded-xl px-5 font-semibold text-ink-800 hover:bg-ink-100">
                <Home aria-hidden="true" className="size-5" />
                לדף הבית
              </a>
            </div>
          </SystemPage>
        </main>
      </body>
    </html>
  );
}
