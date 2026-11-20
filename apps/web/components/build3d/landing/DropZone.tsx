'use client';

import { useRef, useState } from 'react';

interface DropZoneProps {
  onFile: (file: File) => void;
  busy?: boolean;
}

export default function DropZone({ onFile, busy }: DropZoneProps) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
    if (input.current) input.current.value = '';
  };

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pick(e.dataTransfer.files);
      }}
      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-9 text-center transition focus-within:ring-4 focus-within:ring-[#E61559]/25 sm:py-11 ${
        drag
          ? 'border-[#E61559] bg-[#E61559]/[0.07] scale-[1.01]'
          : 'border-[#231F20]/25 bg-white/80 hover:border-[#E61559] hover:bg-white'
      }`}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => pick(e.target.files)}
        disabled={busy}
      />
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E61559] text-white shadow-[0_8px_24px_rgba(230,21,89,.35)] transition group-hover:-translate-y-0.5">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
        </svg>
      </span>
      <span className="text-xl font-extrabold leading-snug sm:text-2xl">
        {drag ? 'שחררו כאן' : 'גררו לכאן את תוכנית ההגשה (PDF)'}
      </span>
      <span className="text-sm text-[#231F20]/60">
        או <span className="font-bold text-[#E61559] underline underline-offset-4">לחצו לבחירת קובץ</span> · הקובץ נבדק בדפדפן שלכם ולא עולה לשום שרת
      </span>
    </label>
  );
}
