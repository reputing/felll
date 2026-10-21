"use client";

import { AppLink as Link } from "@/components/AppLink";
import { useEffect, useRef, useState } from "react";

interface Suggestion {
  slug: string;
  title: string;
  cover_url: string | null;
  meta: string;
}

/** Search input with instant suggestions; Enter goes to the full search page. */
export function SearchBox({ autoFocus = false, large = false }: { autoFocus?: boolean; large?: boolean }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (res.ok) setItems((await res.json()).results);
      } catch {
        // Aborted by a newer keystroke.
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // "/" focuses search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        window.location.href = `/search?q=${encodeURIComponent(q.trim())}`;
      }}
    >
      <input
        ref={inputRef}
        type="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search anime…  ( / )"
        aria-label="Search anime"
        className={`w-full rounded-lg border border-line bg-panel px-4 outline-none focus:border-accent ${
          large ? "py-3 text-lg" : "py-2 text-sm"
        }`}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          {items.map((s) => (
            <li key={s.slug}>
              <Link href={`/anime/${s.slug}`} className="flex items-center gap-3 px-3 py-2 hover:bg-line">
                {s.cover_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.cover_url} alt="" className="h-12 w-8 rounded object-cover" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm">{s.title}</span>
                  <span className="block text-xs text-muted">{s.meta}</span>
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={`/search?q=${encodeURIComponent(q.trim())}`}
              className="block px-3 py-2 text-center text-xs text-accent hover:bg-line"
            >
              View all results
            </Link>
          </li>
        </ul>
      )}
    </form>
  );
}
