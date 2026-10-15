import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import Breadcrumbs from '@/components/content/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { ReportDocument } from '@/components/planner/ReportDocument';
import ReportToolbar from '@/components/planner/ReportToolbar';
import { estimateBudget } from '@/lib/planner/engine';
import { loadPriceBook } from '@/lib/planner/price-book';
import { isCompleteInput, parsePlannerQuery } from '@/lib/planner/prefill';
import { plannerHref, whatsappShareHref } from '@/lib/planner/share';

// The answers come from the URL (?m2=&floors=&region=&finish=&extras=): one report per link.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'דוח תקציב ראשוני',
  description: 'הערכת תקציב ראשונית לבית פרטי לפי 7 שלבי הבנייה, להדפסה ולשמירה כ-PDF.',
  robots: { index: false, follow: false },
};

// A4, brand colours kept in print; the site chrome is print:hidden already.
const PRINT_CSS = `
@page { size: A4; margin: 14mm 12mm 16mm; }
@media print {
  html { font-size: 14px !important; }
  html, body { background: white !important; }
  #planner-report, #planner-report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #main-content { padding: 0 !important; }
}
`;

export default async function PlannerReportPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const parsed = parsePlannerQuery(searchParams);
  if (!isCompleteInput(parsed)) {
    return (
      <div className="container-page py-16">
        <h1 className="sr-only">דוח תקציב ראשוני</h1>
        <EmptyState
          icon={<FileText />}
          title="חסרים פרטים לדוח"
          description="הדוח נבנה מהתשובות במחשבון. ענו על חמש השאלות, והדוח יחכה לכם בסוף."
          actions={<ButtonLink href="/calculator/">למחשבון התקציב</ButtonLink>}
        />
      </div>
    );
  }

  const { book } = await loadPriceBook();
  const estimate = estimateBudget(parsed, book);

  return (
    <div className="bg-sand-50 pb-16 print:bg-white print:pb-0">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="container-page flex flex-col gap-4 py-6 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Breadcrumbs
          crumbs={[
            { label: 'ראשי', href: '/' },
            { label: 'מחשבון תקציב', href: '/calculator/' },
            { label: 'דוח להדפסה', href: '/calculator/report/' },
          ]}
        />
        <ReportToolbar backHref={plannerHref(estimate.input)} whatsappHref={whatsappShareHref(estimate)} estimateId={estimate.estimateId} />
      </div>
      <div className="container-page print:p-0">
        <ReportDocument estimate={estimate} book={book} issuedAt={new Date()} />
      </div>
    </div>
  );
}
