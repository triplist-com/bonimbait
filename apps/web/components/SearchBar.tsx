'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSuggestions } from '@/lib/api';

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

  const isLarge = size === 'large';

  // Update query when defaultValue changes (e.g. navigating back)
  useEffect(() => {
    setQuery(defaultValue);
  }, [defaultValue]);

  // Debounced suggestions fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
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
      if (onSearch) {
        onSearch(trimmed);
      } else {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
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
          {/* Search icon */}
          <div
            className={`absolute right-0 top-0 flex items-center justify-center text-gray-400 pointer-events-none ${
              isLarge ? 'w-14 h-14' : 'w-12 h-12'
            }`}
          >
            <svg
              className={isLarge ? 'w-6 h-6' : 'w-5 h-5'}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="חפשו נושא בבנייה... למשל: איך בוחרים קבלן שלד?"
            className={`w-full bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all ${
              isLarge
                ? 'pr-14 pl-32 py-4 text-lg rounded-2xl shadow-search'
                : 'pr-12 pl-28 py-3 text-base rounded-xl shadow-md'
            } ${showSuggestions && suggestions.length > 0 ? 'rounded-b-none border-b-transparent' : ''}`}
            dir="rtl"
            autoComplete="off"
          />

          {/* Loading spinner */}
          {isLoadingSuggestions && (
            <div
              className={`absolute left-28 top-1/2 -translate-y-1/2 ${
                isLarge ? 'left-36' : 'left-28'
              }`}
            >
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}

          <button
            type="submit"
            aria-label="חיפוש"
            className={`absolute left-2 top-1/2 -translate-y-1/2 bg-primary hover:bg-primary-700 active:bg-primary-800 text-white font-medium rounded-lg transition-colors ${
              isLarge ? 'px-6 py-2.5 text-base' : 'px-5 py-2 text-sm'
            }`}
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
          className="absolute z-50 w-full bg-white border border-gray-200 border-t-0 rounded-b-xl shadow-lg overflow-hidden animate-slide-down"
        >
          {suggestions.map((suggestion, i) => (
            <button
              key={suggestion}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={`w-full text-right px-4 py-3 text-sm hover:bg-primary-50 transition-colors flex items-center gap-3 ${
                i === activeIndex ? 'bg-primary-50 text-primary' : 'text-gray-700'
              }`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => {
                setQuery(suggestion);
                submit(suggestion);
              }}
            >
              <svg
                className="w-4 h-4 text-gray-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <span>{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
