'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/** "הדפסה / PDF": the browser's print dialog (the report has print styles). */
export default function PrintButton() {
  return (
    <Button type="button" variant="outline" size="md" iconStart={<Printer />} onClick={() => window.print()} className="print:hidden">
      הדפסה או שמירה כ-PDF
    </Button>
  );
}
