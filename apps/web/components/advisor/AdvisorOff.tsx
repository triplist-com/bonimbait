'use client';

/**
 * FLAG_ADVISOR=false: /ask/ is switched off, so the question goes to /search/
 * (the results grid) instead. The page is static, so the question is read from
 * the address in the browser.
 */
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdvisorOff() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const q = params.get('q')?.trim();
    router.replace(q ? `/search/?q=${encodeURIComponent(q)}` : '/search/');
  }, [params, router]);
  return null;
}
