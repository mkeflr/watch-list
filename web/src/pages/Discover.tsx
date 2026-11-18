import { useEffect, useMemo, useRef, useState } from 'react';
import Rail from '../components/Rail';
import TitleCard from '../components/TitleCard';
import { useQuickAdd } from '../lib/actions';
import { api } from '../lib/api';
import { COMMON_COUNTRIES, countryName, flag } from '../lib/format';
import { setTheaterCountry } from '../lib/supabase';
import type { DiscoverData, MediaType, Recommendation, Summary, Title } from '../lib/types';
import { handleError } from '../lib/ui';

interface Props {
  titles: Title[];
  theaterCountry: string;
  countries: string[];
  onPreview: (s: { media_type: MediaType; tmdb_id: number }) => void;
}

/** Discover rails per theater country, kept for 30 minutes. */
const discoverCache = new Map<string, { at: number; data: DiscoverData }>();
const recCache = new Map<string, { at: number; data: Recommendation[] }>();

/** Up to 3 seeds: the two most recently added want/watching titles, plus the top-priority one. */
function pickSeeds(titles: Title[]) {
  const active = titles.filter((t) => t.state === 'want' || t.state === 'watching');
  const recent = [...active].sort((a, b) => b.added_at.localeCompare(a.added_at)).slice(0, 2);
  const top = [...active].sort((a, b) => b.priority - a.priority || b.added_at.localeCompare(a.added_at)).find((t) => !recent.includes(t) && t.priority > 0);
  return [...recent, ...(top ? [top] : [])];
}

export default function Discover({ titles, theaterCountry, countries, onPreview }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Summary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [rails, setRails] = useState<DiscoverData | null>(discoverCache.get(theaterCountry)?.data ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const quick = useQuickAdd(titles);

  // "Because you added …" recommendations.
  const seeds = useMemo(() => pickSeeds(titles), [titles]);
  const seedKey = seeds.map((t) => `${t.media_type}:${t.tmdb_id}`).join(',');
  const [recs, setRecs] = useState<Recommendation[]>(recCache.get(seedKey)?.data ?? []);
  useEffect(() => {
    if (!seeds.length) return setRecs([]);
    const cached = recCache.get(seedKey);
    if (cached && Date.now() - cached.at < 30 * 60_000) return setRecs(cached.data);
    let cancelled = false;
    api.recommendations(seeds.map((t) => ({ media_type: t.media_type, tmdb_id: t.tmdb_id }))).then((data) => {
      recCache.set(seedKey, { at: Date.now(), data });
      if (!cancelled) setRecs(data);
    }, () => {});
    return () => {
      cancelled = true;
    };
  }, [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Auto-focus only on wider screens; on phones it would pop the keyboard up.
    if (window.matchMedia('(min-width: 760px)').matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const cached = discoverCache.get(theaterCountry);
    if (cached && Date.now() - cached.at < 30 * 60_000) {
      setRails(cached.data);
      return;
    }
    let cancelled = false;
    setRails(null);
    api.discover(theaterCountry).then((data) => {
      discoverCache.set(theaterCountry, { at: Date.now(), data });
      if (!cancelled) setRails(data);
    }, handleError);
    return () => {
      cancelled = true;
    };
  }, [theaterCountry]);

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

  const countryOptions = useMemo(
    () =>
      [...new Set([theaterCountry, ...countries, ...COMMON_COUNTRIES])].sort((a, b) =>
        countryName(a).localeCompare(countryName(b)),
      ),
    [theaterCountry, countries],
  );

  const card = (s: Summary) => {
    const key = `${s.media_type}:${s.tmdb_id}`;
    return (
      <TitleCard
        key={key}
        item={s}
        theaterCountry={theaterCountry}
        onOpen={() => onPreview(s)}
        onAdd={() => quick.add(s)}
        added={quick.isAdded(s)}
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
      ) : (
        <>
          <label className="inline theater-pick">
            <span>🎬 Theaters in</span>
            <select value={theaterCountry} onChange={(e) => setTheaterCountry(e.target.value)}>
              {countryOptions.map((cc) => (
                <option key={cc} value={cc}>
                  {flag(cc)} {countryName(cc)}
                </option>
              ))}
            </select>
          </label>
          {!rails ? (
            <p className="empty muted">Loading…</p>
          ) : (
            <>
              {recs.map((r) => {
                const seed = seeds.find((t) => t.tmdb_id === r.tmdb_id && t.media_type === r.media_type);
                const items = r.results.filter((x) => !quick.onList.has(`${x.media_type}:${x.tmdb_id}`)).slice(0, 15);
                return seed ? (
                  <Rail key={`${r.media_type}:${r.tmdb_id}`} title={`✨ Because you added ${seed.title}`} items={items} render={card} />
                ) : null;
              })}
              <Rail title="🎬 Coming soon to theaters" items={rails.upcoming} render={card} />
              <Rail title="🍿 In theaters now" items={rails.now_playing} render={card} />
              <Rail title="📺 New episodes airing" items={rails.on_the_air} render={card} />
              <Rail title="🔥 Trending this week" items={rails.trending} render={card} />
            </>
          )}
        </>
      )}
    </div>
  );
}
