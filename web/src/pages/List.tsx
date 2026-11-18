import { useMemo, useState } from 'react';
import TitleCard from '../components/TitleCard';
import { daysUntil, mergeProviders, providerIn, releaseDateFor, streamingIds, streamingProviders } from '../lib/format';
import { session } from '../lib/session';
import type { Provider, Settings, Title, WatchState } from '../lib/types';

type StateTab = WatchState | 'upcoming' | 'all';
type Sort = 'added' | 'priority' | 'rating' | 'release' | 'runtime' | 'title';

const TABS: [StateTab, string][] = [
  ['want', 'To watch'],
  ['watching', 'Watching'],
  ['upcoming', 'Coming soon'],
  ['watched', 'Watched'],
  ['all', 'All'],
];

interface Props {
  titles: Title[];
  settings: Settings;
  theaterCountry: string;
  loading: boolean;
  onOpen: (t: Title) => void;
  onDiscover: () => void;
}

export default function List({ titles, settings, theaterCountry, loading, onOpen, onDiscover }: Props) {
  const [tab, setTab] = useState<StateTab>('want');
  const [q, setQ] = useState('');
  const [type, setType] = useState<'any' | 'movie' | 'tv'>('any');
  const [service, setService] = useState<string>('any'); // 'any' | 'mine' | 'none' | provider id
  const [genre, setGenre] = useState('any');
  const [sort, setSort] = useState<Sort>('priority');
  const [showFilters, setShowFilters] = useState(false);

  const myServices = useMemo(() => new Set(session.myServices), []);
  const home = settings.home_country;

  const { allProviders, allGenres } = useMemo(() => {
    const provs: Provider[] = [];
    const genres = new Set<string>();
    for (const t of titles) {
      provs.push(...streamingProviders(t.providers?.[home]));
      t.genres?.forEach((g) => genres.add(g));
    }
    return {
      allProviders: mergeProviders(provs).sort((a, b) => a.name.localeCompare(b.name)),
      allGenres: [...genres].sort(),
    };
  }, [titles, home]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: titles.length };
    for (const t of titles) {
      c[t.state] = (c[t.state] ?? 0) + 1;
      if (isUpcoming(t, theaterCountry)) c.upcoming = (c.upcoming ?? 0) + 1;
    }
    return c;
  }, [titles, theaterCountry]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = titles.filter((t) => {
      if (tab === 'upcoming' ? !isUpcoming(t, theaterCountry) : tab !== 'all' && t.state !== tab) return false;
      if (type !== 'any' && t.media_type !== type) return false;
      if (genre !== 'any' && !t.genres?.includes(genre)) return false;
      if (needle && !`${t.title} ${t.notes} ${t.added_by}`.toLowerCase().includes(needle)) return false;
      if (service !== 'any') {
        const ids = streamingIds(t, [home]);
        if (service === 'none') return ids.size === 0;
        if (service === 'mine') return [...ids].some((id) => myServices.has(id));
        const chosen = allProviders.find((p) => String(p.id) === service);
        if (!(chosen ? providerIn(chosen, ids) : ids.has(Number(service)))) return false;
      }
      return true;
    });
    const by: Record<Sort, (a: Title, b: Title) => number> = {
      added: (a, b) => b.added_at.localeCompare(a.added_at),
      priority: (a, b) => b.priority - a.priority || b.added_at.localeCompare(a.added_at),
      rating: (a, b) => (b.tmdb_rating ?? 0) - (a.tmdb_rating ?? 0),
      release: (a, b) => nextDate(a, theaterCountry).localeCompare(nextDate(b, theaterCountry)),
      runtime: (a, b) => (a.runtime_min ?? 9999) - (b.runtime_min ?? 9999),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return list.sort(tab === 'upcoming' && sort === 'priority' ? by.release : by[sort]);
  }, [titles, tab, q, type, service, genre, sort, home, myServices, theaterCountry, allProviders]);

  const activeFilters = [type !== 'any', service !== 'any', genre !== 'any'].filter(Boolean).length;

  return (
    <div className="page">
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label} <span className="count">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Filter list…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`btn ${activeFilters ? 'on' : ''}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
          Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>

      {showFilters && (
        <div className="filters">
          <label className="inline">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="any">Movies & TV</option>
              <option value="movie">Movies</option>
              <option value="tv">TV shows</option>
            </select>
          </label>
          <label className="inline">
            Streaming ({home})
            <select value={service} onChange={(e) => setService(e.target.value)}>
              <option value="any">Any</option>
              {myServices.size > 0 && <option value="mine">My services</option>}
              <option value="none">Not streaming</option>
              {allProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="inline">
            Genre
            <select value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="any">Any</option>
              {allGenres.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="inline">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="priority">Priority</option>
              <option value="added">Recently added</option>
              <option value="rating">Rating</option>
              <option value="release">Release date</option>
              <option value="runtime">Shortest first</option>
              <option value="title">A–Z</option>
            </select>
          </label>
          {activeFilters > 0 && (
            <button className="btn link" onClick={() => { setType('any'); setService('any'); setGenre('any'); }}>Clear</button>
          )}
        </div>
      )}

      {loading ? (
        <p className="empty muted">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p className="muted">{titles.length ? 'Nothing here with these filters.' : 'The list is empty.'}</p>
          <button className="btn primary" onClick={onDiscover}>+ Find something to add</button>
        </div>
      ) : (
        <div className="grid">
          {shown.map((t) => (
            <TitleCard key={t.id} item={t} homeCountry={home} theaterCountry={theaterCountry} myServices={myServices} onOpen={() => onOpen(t)} />
          ))}
        </div>
      )}
    </div>
  );
}

function isUpcoming(t: Title, cc: string) {
  const rel = daysUntil(t.media_type === 'movie' ? releaseDateFor(t, cc) : t.release_date);
  if (rel != null && rel > 0) return true;
  if (t.media_type !== 'tv' || t.state === 'dropped') return false;
  if (t.next_season_number && !t.next_season_date) return true; // announced, no date yet
  const ns = daysUntil(t.next_season_date);
  const ep = daysUntil(t.next_episode_date);
  return (ns != null && ns >= 0) || (ep != null && ep >= 0);
}

/** Soonest upcoming date for sorting ('9' sorts undated items last). */
function nextDate(t: Title, cc: string) {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = [
    t.media_type === 'movie' ? releaseDateFor(t, cc) : t.release_date,
    t.next_season_date,
    t.next_episode_date,
  ].filter((d): d is string => !!d && d >= today);
  return candidates.sort()[0] ?? (t.media_type === 'movie' ? releaseDateFor(t, cc) : t.release_date) ?? '9';
}
