import type { Metadata } from 'next';
import { Suspense } from 'react';
import WizardClient from './WizardClient';

export const metadata: Metadata = {
  title: 'מחשבון עלויות בנייה',
  description:
    'חשבו את עלויות הבנייה המשוערות לבית הפרטי שלכם. מחשבון מבוסס נתונים מ-900 סרטוני בנייה מקצועיים.',
  alternates: {
    canonical: 'https://bonimbait.com/calculator',
  },
};

export default function CalculatorPage() {
  return (
    <div className="container-page py-8 sm:py-12">
      <div className="max-w-2xl mx-auto">
        {/* Page header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-full mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008H15.75v-.008zm0 2.25h.008v.008H15.75V13.5z" />
            </svg>
            <span>מחשבון עלויות</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            כמה יעלה לבנות את הבית שלכם?
          </h1>
          <p className="text-gray-500 text-sm sm:text-base max-w-lg mx-auto">
            ענו על כמה שאלות קצרות וקבלו הערכת עלות מבוססת נתונים מ-900+ סרטוני בנייה
          </p>
        </div>

        {/* Wizard card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-8">
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">טוען שאלון...</p>
              </div>
            }
          >
            <WizardClient />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
