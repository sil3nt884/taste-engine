'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const MIN_QUERY = 3;
const DEBOUNCE_MS = 250;

export default function NavSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [inputValue, setInputValue] = useState(params.get('q') ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pathname === '/') setInputValue(params.get('q') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, pathname]);

  function navigate(term: string) {
    const trimmed = term.trim();
    const target = trimmed.length >= MIN_QUERY ? `/?q=${encodeURIComponent(trimmed)}` : '/';
    startTransition(() => router.replace(target));
  }

  function onChange(value: string) {
    setInputValue(value);
    if (timer.current) clearTimeout(timer.current);
    // Don't navigate for 1–2 chars (below threshold, and not a "clear").
    if (value.trim().length > 0 && value.trim().length < MIN_QUERY) return;
    timer.current = setTimeout(() => navigate(value), DEBOUNCE_MS);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    navigate(inputValue);
  }

  return (
    <form className="navsearch" role="search" onSubmit={onSubmit}>
      <input
        type="search"
        value={inputValue}
        placeholder="Search anime…"
        aria-label="Search anime"
        onChange={(event) => onChange(event.target.value)}
      />
    </form>
  );
}
