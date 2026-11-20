'use client';

import Link from 'next/link';
import { useState } from 'react';
import DropZone from './DropZone';
import HeroVisual from './HeroVisual';
import { checkPlanFile } from './fileCheck';

interface LandingProps {
  /** Start the analysis with the supported sample sheet. */
  onStart: () => void;
}

const STEPS = [
  { n: '1', title: 'מעלים תוכנית', text: 'קובץ PDF של תוכנית ההגשה, ישר מהדפדפן.' },
  { n: '2', title: 'הבינה המלאכותית קוראת אותה', text: 'קירות, פתחים, חדרים, מידות וכמויות, תוך כמה שניות.' },
  { n: '3', title: 'רואים את הבית נבנה', text: 'מהמגרש החשוף ועד הבית המרוהט, שלב אחר שלב.' },
];

export default function Landing({ onStart }: LandingProps) {
  const [notice, setNotice] = useState<null | 'unsupported' | 'not-pdf' | 'unreadable'>(null);
  const [checking, setChecking] = useState(false);

  const handleFile = async (file: File) => {
    setNotice(null);
    setChecking(true);
    const res = await checkPlanFile(file);
    setChecking(false);
    if (res.ok) onStart();
    else setNotice(res.reason);
  };

  return (
    <div dir="rtl" className="absolute inset-0 overflow-y-auto overflow-x-hidden bg-[#F7F5F1] text-[#231F20]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px]" style={{ background: 'radial-gradient(ellipse at 20% 10%, #fff 0%, transparent 60%), radial-gradient(ellipse at 90% 0%, rgba(230,21,89,.08), transparent 55%)' }} />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-extrabold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E61559]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E61559] text-white" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
          </span>
          בונים בית
        </Link>
        <Link href="/" className="text-sm font-semibold text-[#231F20]/65 transition hover:text-[#E61559]">
          לאתר בונים בית ›
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-3 px-5 pb-8 pt-1 sm:gap-6 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:gap-10 lg:pb-16 lg:pt-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#E61559]/10 px-3 py-1 text-xs font-bold text-[#E61559]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E61559]" /> הדגמה חיה · תלת-ממד
          </span>
          <h1 className="mt-3 text-[2.25rem] font-black leading-[1.08] tracking-tight sm:text-6xl">
            מתוכנית לבית<span className="text-[#E61559]"> —</span>
            <br />
            צעד אחר צעד
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#231F20]/75 sm:mt-4 sm:text-lg">
            מעלים את תוכנית ההגשה ורואים כל שלב בבנייה בתלת-ממד: יסודות, ברזל, בטון, בלוקים, מערכות וגמרים.
            כמו חוברת הרכבה, רק לבית שלכם.
          </p>

          <div className="mt-5 max-w-xl sm:mt-7">
            <DropZone onFile={handleFile} busy={checking} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onStart}
                className="inline-flex items-center gap-2 rounded-full bg-[#231F20] px-6 py-3 text-base font-bold text-white transition hover:bg-[#E61559] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#E61559]/30"
              >
                נסו עם תוכנית לדוגמה
                <span aria-hidden>←</span>
              </button>
              <span className="text-sm text-[#231F20]/60">תוכנית מגרש 43, בלי להעלות קובץ</span>
            </div>

            {notice && (
              <div role="alert" className="mt-4 rounded-2xl border border-[#E61559]/25 bg-white p-4 shadow-sm">
                <p className="font-semibold leading-relaxed">
                  {notice === 'unsupported' && 'בגרסת ההדגמה ניתן לנתח רק את תוכנית מגרש 43. רוצים לראות אותה?'}
                  {notice === 'not-pdf' && 'צריך קובץ PDF של תוכנית. בגרסת ההדגמה ניתן לנתח רק את תוכנית מגרש 43. רוצים לראות אותה?'}
                  {notice === 'unreadable' && 'לא הצלחנו לקרוא את הקובץ. אפשר לנסות שוב, או לראות את תוכנית מגרש 43.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={onStart} className="rounded-full bg-[#E61559] px-5 py-2 text-sm font-bold text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#E61559]/30">
                    כן, הראו לי
                  </button>
                  <button type="button" onClick={() => setNotice(null)} className="rounded-full border border-[#231F20]/15 px-5 py-2 text-sm font-semibold transition hover:bg-black/5">
                    לא עכשיו
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative order-first mx-auto aspect-[16/9] w-full max-w-md sm:aspect-[16/10] sm:max-w-2xl lg:order-none lg:max-w-none">
          <HeroVisual className="absolute inset-0" />
        </div>
      </section>

      <section aria-labelledby="how-title" className="relative z-10 border-t border-[#231F20]/8 bg-white/60">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
          <h2 id="how-title" className="text-sm font-extrabold tracking-wide text-[#231F20]/55">איך זה עובד</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_14px_rgba(35,31,32,.06)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E61559] font-black text-white">{s.n}</span>
                <span>
                  <span className="block font-extrabold">{s.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-[#231F20]/65">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-[#231F20]/45">
            הדגמה בלבד: הכמויות והעלויות מוערכות ואינן מחליפות תוכניות מהנדס. <Link href="/" className="underline underline-offset-2 hover:text-[#E61559]">חזרה לאתר הראשי</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
