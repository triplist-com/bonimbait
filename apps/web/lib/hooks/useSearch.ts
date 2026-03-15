'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSuggestions, searchVideos } from '@/lib/api';
import type { SearchResponse } from '@/lib/types';

export function useSearch(initialQuery = '') {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced suggestions
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoadingSuggestions(true);
      try {
        const s = await getSuggestions(query.trim());
        setSuggestions(s);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const search = useCallback(
    async (q: string, category?: string, page?: number) => {
      if (!q.trim()) return;
      setIsLoadingResults(true);
      setError(null);
      try {
        const data = await searchVideos(q.trim(), category, page);
        setResults(data);
      } catch (err) {
        setError('שגיאה בחיפוש. אנא נסו שוב.');
        console.error(err);
      } finally {
        setIsLoadingResults(false);
      }
    },
    [],
  );

  return {
    query,
    setQuery,
    suggestions,
    isLoadingSuggestions,
    results,
    isLoadingResults,
    error,
    search,
  };
}
