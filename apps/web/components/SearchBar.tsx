'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Search } from 'lucide-react';
import { getSuggestions } from '@/lib/api';
import { track } from '@/lib/analytics/track';
import { cn } from '@/lib/cn';

interface SearchBarProps {
  defaultValue?: string;
  size?: 'default' | 'large';
  onSearch?: (query: string) => void;
}

export default function SearchBar({
  defaultValue = '',
  size = 'default',
  onSearch,
}: SearchBarProps) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // Suggestions follow typing only: a query that arrives with the page (?q=) must not pop a list over the results.
  const typedRef = useRef(false);

  const isLarge = size === 'large';

  // Update query when defaultValue changes (e.g. navigating back)
  useEffect(() => {
    typedRef.current = false;
    setQuery(defaultValue);
  }, [defaultValue]);

  // Debounced suggestions fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!typedRef.current || query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoadingSuggestions(true);
      try {
        const s = await getSuggestions(query.trim());
        setSuggestions(s);
        if (s.length > 0) setShowSuggestions(true);
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

  // Click outside to close suggestions
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const submit = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setShowSuggestions(false);
      track('search_submitted', { query: trimmed });
      if (onSearch) {
        onSearch(trimmed);
      } else {
        router.push(`/search/?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [onSearch, router],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const selected = suggestions[activeIndex];
      setQuery(selected);
      submit(selected);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search
            aria-hidden="true"
            className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-400', isLarge ? 'start-5 size-6' : 'start-4 size-5')}
          />

          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              typedRef.current = true;
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="חפשו נושא, למשל: איטום גג"
            aria-label="חיפוש בסרטונים ובמאמרים"
            enterKeyHint="search"
            className={cn(
              'w-full border border-ink-200 bg-white text-ink-900 outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-400',
              'hover:border-ink-300 focus:border-primary-600 focus:ring-4 focus:ring-primary-600/15 [&::-webkit-search-cancel-button]:hidden',
              isLarge ? 'h-16 rounded-2xl pe-32 ps-14 text-lg shadow-search' : 'h-14 rounded-2xl pe-28 ps-12 text-body shadow-card',
              showSuggestions && suggestions.length > 0 && 'rounded-b-none border-b-transparent',
            )}
            autoComplete="off"
          />

          {/* Loading spinner */}
          {isLoadingSuggestions && (
            <span aria-hidden="true" className={cn('absolute top-1/2 -translate-y-1/2', isLarge ? 'end-36' : 'end-28')}>
              <LoaderCircle className="size-5 animate-spin text-primary-600" />
            </span>
          )}

          <button
            type="submit"
            className={cn(
              'absolute end-2 top-1/2 inline-flex -translate-y-1/2 items-center rounded-xl bg-primary-600 font-semibold text-white transition-colors hover:bg-primary-700 active:bg-primary-800',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
              isLarge ? 'h-12 px-6 text-base' : 'h-10 px-5 text-[0.9375rem]',
            )}
          >
            חיפוש
          </button>
        </div>
      </form>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="הצעות חיפוש"
          className="absolute z-50 w-full overflow-hidden rounded-b-2xl border border-t-0 border-ink-200 bg-white shadow-lift motion-safe:animate-slide-down"
        >
          {suggestions.map((suggestion, i) => (
            <button
              key={suggestion}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-start text-sm transition-colors hover:bg-primary-50',
                i === activeIndex ? 'bg-primary-50 text-primary-700' : 'text-ink-700',
              )}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => {
                setQuery(suggestion);
                submit(suggestion);
              }}
            >
              <Search aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
              <span>{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
