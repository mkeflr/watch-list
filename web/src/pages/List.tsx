import { useMemo, useState } from 'react';
import TitleCard from '../components/TitleCard';
import { daysUntil, streamingIds, streamingProviders } from '../lib/format';
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
  loading: boolean;
  onOpen: (t: Title) => void;
  onDiscover: () => void;
}

export default function List({ titles, settings, loading, onOpen, onDiscover }: Props) {
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
    const provs = new Map<number, Provider>();
    const genres = new Set<string>();
    for (const t of titles) {
      for (const p of streamingProviders(t.providers?.[home])) provs.set(p.id, p);
      t.genres?.forEach((g) => genres.add(g));
    }
    return {
      allProviders: [...provs.values()].sort((a, b) => a.name.localeCompare(b.name)),
      allGenres: [...genres].sort(),
    };
  }, [titles, home]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: titles.length };
    for (const t of titles) {
      c[t.state] = (c[t.state] ?? 0) + 1;
      if (isUpcoming(t)) c.upcoming = (c.upcoming ?? 0) + 1;
    }
    return c;
  }, [titles]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = titles.filter((t) => {
      if (tab === 'upcoming' ? !isUpcoming(t) : tab !== 'all' && t.state !== tab) return false;
      if (type !== 'any' && t.media_type !== type) return false;
      if (genre !== 'any' && !t.genres?.includes(genre)) return false;
      if (needle && !`${t.title} ${t.notes} ${t.added_by}`.toLowerCase().includes(needle)) return false;
      if (service !== 'any') {
        const ids = streamingIds(t, [home]);
        if (service === 'none') return ids.size === 0;
        if (service === 'mine') return [...ids].some((id) => myServices.has(id));
        if (!ids.has(Number(service))) return false;
      }
      return true;
    });
    const by: Record<Sort, (a: Title, b: Title) => number> = {
      added: (a, b) => b.added_at.localeCompare(a.added_at),
      priority: (a, b) => b.priority - a.priority || b.added_at.localeCompare(a.added_at),
      rating: (a, b) => (b.tmdb_rating ?? 0) - (a.tmdb_rating ?? 0),
      release: (a, b) => (a.next_episode_date ?? a.release_date ?? '9').localeCompare(b.next_episode_date ?? b.release_date ?? '9'),
      runtime: (a, b) => (a.runtime_min ?? 9999) - (b.runtime_min ?? 9999),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return list.sort(tab === 'upcoming' && sort === 'priority' ? by.release : by[sort]);
  }, [titles, tab, q, type, service, genre, sort, home, myServices]);

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
            <TitleCard key={t.id} item={t} homeCountry={home} myServices={myServices} onOpen={() => onOpen(t)} />
          ))}
        </div>
      )}
    </div>
  );
}

function isUpcoming(t: Title) {
  const rel = daysUntil(t.release_date);
  if (rel != null && rel > 0) return true;
  const ep = daysUntil(t.next_episode_date);
  return t.media_type === 'tv' && ep != null && ep >= 0 && t.state !== 'dropped';
}
