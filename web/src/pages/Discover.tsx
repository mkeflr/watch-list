import { useEffect, useMemo, useRef, useState } from 'react';
import TitleCard from '../components/TitleCard';
import { api } from '../lib/api';
import { db, upsertLocal } from '../lib/supabase';
import type { DiscoverData, MediaType, Summary, Title } from '../lib/types';
import { handleError, toast } from '../lib/ui';

interface Props {
  titles: Title[];
  onPreview: (s: { media_type: MediaType; tmdb_id: number }) => void;
}

let discoverCache: { at: number; data: DiscoverData } | null = null;

export default function Discover({ titles, onPreview }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Summary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [rails, setRails] = useState<DiscoverData | null>(discoverCache?.data ?? null);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const onList = useMemo(() => new Set(titles.map((t) => `${t.media_type}:${t.tmdb_id}`)), [titles]);

  useEffect(() => {
    // Auto-focus only on wider screens; on phones it would pop the keyboard up.
    if (window.matchMedia('(min-width: 760px)').matches) inputRef.current?.focus({ preventScroll: true });
    if (discoverCache && Date.now() - discoverCache.at < 30 * 60_000) return;
    api.discover().then((data) => {
      discoverCache = { at: Date.now(), data };
      setRails(data);
    }, handleError);
  }, []);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const h = window.setTimeout(() => {
      api.search(term).then(setResults, handleError).finally(() => setSearching(false));
    }, 350);
    return () => window.clearTimeout(h);
  }, [q]);

  async function quickAdd(s: Summary) {
    const key = `${s.media_type}:${s.tmdb_id}`;
    setAdding((a) => new Set(a).add(key));
    try {
      const meta = await api.details(s.media_type, s.tmdb_id);
      const row = await db.addTitle(meta);
      upsertLocal(row);
      toast(`Added “${row.title}”`);
    } catch (e) {
      handleError(e);
    } finally {
      setAdding((a) => {
        const n = new Set(a);
        n.delete(key);
        return n;
      });
    }
  }

  const card = (s: Summary) => {
    const key = `${s.media_type}:${s.tmdb_id}`;
    return (
      <TitleCard
        key={key}
        item={s}
        onOpen={() => onPreview(s)}
        onAdd={() => quickAdd(s)}
        added={onList.has(key) || adding.has(key)}
      />
    );
  };

  return (
    <div className="page">
      <div className="toolbar">
        <input
          ref={inputRef}
          type="search"
          placeholder="Search movies & TV shows…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
      </div>

      {results ? (
        <section>
          <h2 className="rail-title">{searching ? 'Searching…' : `Results for “${q.trim()}”`}</h2>
          {results.length ? <div className="grid">{results.map(card)}</div> : !searching && <p className="muted">No matches.</p>}
        </section>
      ) : !rails ? (
        <p className="empty muted">Loading…</p>
      ) : (
        <>
          <Rail title="🎬 Coming soon to theaters" items={rails.upcoming} card={card} />
          <Rail title="🍿 In theaters now" items={rails.now_playing} card={card} />
          <Rail title="📺 New episodes airing" items={rails.on_the_air} card={card} />
          <Rail title="🔥 Trending this week" items={rails.trending} card={card} />
        </>
      )}
    </div>
  );
}

function Rail({ title, items, card }: { title: string; items: Summary[]; card: (s: Summary) => JSX.Element }) {
  if (!items.length) return null;
  return (
    <section className="rail">
      <h2 className="rail-title">{title}</h2>
      <div className="rail-scroll">{items.map(card)}</div>
    </section>
  );
}
