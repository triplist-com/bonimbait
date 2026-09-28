'use client';

import { useId, useState } from 'react';

const CONVERSION = 0.25; // case-study conversion rate
const nf = new Intl.NumberFormat('he-IL');

/** "כמה שווה לכם הקהל שלנו?" slider calculator from /strategic-partners/. */
export default function StrategicRoiCalculator() {
  const id = useId();
  const [dealValue, setDealValue] = useState(15000);
  const [leads, setLeads] = useState(50);
  const deals = leads * CONVERSION;
  const revenue = deals * dealValue;

  return (
    <div className="grid grid-cols-1 gap-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-card md:grid-cols-2 sm:p-8">
      <div className="space-y-6">
        <div>
          <label htmlFor={`${id}-deal`} className="block font-medium text-gray-800">
            כמה שווה לכם עסקה אחת? (ש&quot;ח)
          </label>
          <input
            id={`${id}-deal`}
            type="range"
            min={1000}
            max={150000}
            step={1000}
            value={dealValue}
            onChange={(e) => setDealValue(Number(e.target.value))}
            className="mt-3 w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>1K</span>
            <span className="text-base font-bold text-gray-900">{nf.format(dealValue)} ₪</span>
            <span>150K</span>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-leads`} className="block font-medium text-gray-800">
            כמה פניות חודשיות תרצו לבחון?
          </label>
          <input
            id={`${id}-leads`}
            type="range"
            min={10}
            max={300}
            step={5}
            value={leads}
            onChange={(e) => setLeads(Number(e.target.value))}
            className="mt-3 w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>10</span>
            <span className="text-base font-bold text-gray-900">{leads} לידים</span>
            <span>300</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-4 rounded-xl bg-primary-50 p-6 text-center" aria-live="polite">
        <div>
          <p className="text-sm text-gray-600">עסקאות משוערות לפי קייס סטאדי</p>
          <p className="text-3xl font-black text-gray-900">{nf.format(deals)}</p>
          <p className="text-xs text-gray-500">הקייס סטאדי הראה יחס המרה של 25%.</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">הכנסה פוטנציאלית להמחשה</p>
          <p className="text-3xl font-black text-primary">{nf.format(revenue)} ₪</p>
        </div>
        <p className="text-xs text-gray-500">
          *הקייס סטאדי הראה יחס המרה של 25%. החישוב הוא המחשה בלבד ואינו התחייבות לכמות לידים, עסקאות או הכנסות.
        </p>
      </div>
    </div>
  );
}
