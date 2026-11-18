import type { CountryProviders, Meta, NewsItem, Provider, Title } from './types';

export const img = (path: string | null | undefined, size: 'w92' | 'w185' | 'w342' | 'w780' | 'w1280' = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

export const flag = (cc: string) =>
  cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();
export const countryName = (cc: string) => regionNames?.of(cc) ?? cc;

export const COMMON_COUNTRIES = [
  'US', 'GB', 'CA', 'AU', 'IE', 'NZ', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI', 'IN', 'JP', 'KR', 'BR', 'MX',
];

export function runtime(min: number | null | undefined) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m ? `${m}m` : ''}`.trim() : `${m}m`;
}

/** Whole days from today (local) until an ISO date; negative if past. */
export function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const target = new Date(y, mo - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86400000);
}

export function inDays(n: number) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 14) return `in ${n} days`;
  if (n < 60) return `in ${Math.round(n / 7)} weeks`;
  return `in ${Math.round(n / 30)} months`;
}

type Dated = Pick<Meta, 'media_type' | 'release_date' | 'next_episode_date'> &
  Partial<Pick<Meta, 'release_dates' | 'seasons' | 'next_season_number' | 'next_season_date'>>;

/** Movie release date for a country (falls back to the default date). */
export function releaseDateFor(t: Pick<Meta, 'release_date'> & Partial<Pick<Meta, 'release_dates'>>, cc?: string | null) {
  return (cc && t.release_dates?.[cc]) || t.release_date;
}

/** Badge text for upcoming releases / new seasons / new episodes, or null. */
export function upcomingBadge(t: Dated, cc?: string | null) {
  const rel = daysUntil(t.media_type === 'movie' ? releaseDateFor(t, cc) : t.release_date);
  if (rel != null && rel >= 0) return t.media_type === 'tv' ? `Premieres ${inDays(rel)}` : `Out ${inDays(rel)}`;
  if (t.media_type === 'tv') {
    const ns = daysUntil(t.next_season_date);
    if (t.next_season_number && ns != null && ns >= 0) return `S${t.next_season_number} ${inDays(ns)}`;
    const ep = daysUntil(t.next_episode_date);
    if (ep != null && ep >= 0) return `New ep ${inDays(ep)}`;
  }
  return null;
}

/** Text for an announced/upcoming season, e.g. "Season 3 premieres Jan 16, 2027". */
export function nextSeasonNote(t: Dated) {
  if (t.media_type !== 'tv' || !t.next_season_number) return null;
  const d = t.next_season_date;
  if (!d) return `Season ${t.next_season_number} announced`;
  const days = daysUntil(d);
  if (days != null && days < 0) return null;
  return `Season ${t.next_season_number} premieres ${fmtDate(d)}${days != null && days < 60 ? ` (${inDays(days)})` : ''}`;
}

export function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// "HBO Max Amazon Channel", "Paramount+ Apple TV Channel", "Netflix Standard with Ads" → base service.
const VARIANT_SUFFIX =
  /\s+(amazon channel|apple tv channel|roku premium channel|channel|standard with ads|basic with ads|free with ads|with ads|premium)$/;

function serviceKey(name: string) {
  let k = name.toLowerCase().replace(/\+/g, ' plus').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== k; ) {
    prev = k;
    k = k.replace(VARIANT_SUFFIX, '').trim();
  }
  return k || name.toLowerCase();
}

/** Merge variants of the same service into one entry (shortest name wins), keeping order. */
export function mergeProviders(list: Provider[]): Provider[] {
  const groups = new Map<string, Provider>();
  for (const p of list) {
    const key = serviceKey(p.name);
    const g = groups.get(key);
    const ids = p.ids ?? [p.id];
    if (!g) {
      groups.set(key, { ...p, ids: [...ids] });
    } else {
      for (const id of ids) if (!g.ids!.includes(id)) g.ids!.push(id);
      if (p.name.length < g.name.length) Object.assign(g, { id: p.id, name: p.name, logo: p.logo ?? g.logo });
    }
  }
  return [...groups.values()];
}

/** Subscription-style providers (stream, free, with ads) for one country, variants merged. */
export function streamingProviders(cp: CountryProviders | undefined): Provider[] {
  if (!cp) return [];
  return mergeProviders([...(cp.flatrate ?? []), ...(cp.free ?? []), ...(cp.ads ?? [])]);
}

/** Every subscription-style provider id (incl. merged variants) for a title across the given countries. */
export function streamingIds(t: Title, countries: string[]) {
  const ids = new Set<number>();
  for (const cc of countries) for (const p of streamingProviders(t.providers?.[cc])) for (const id of p.ids ?? [p.id]) ids.add(id);
  return ids;
}

/** True if any of a merged provider's ids is in the set. */
export const providerIn = (p: Provider, set: Set<number>) => (p.ids ?? [p.id]).some((id) => set.has(id));

export function sortCountries(countries: string[], home: string) {
  return [...countries].sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)));
}

export const STATE_LABEL: Record<Title['state'], string> = {
  want: 'Want to watch',
  watching: 'Watching',
  watched: 'Watched',
  dropped: 'Dropped',
};

// ───────────────────────── episode progress ─────────────────────────

export interface EpisodeRef {
  s: number;
  e: number;
}

const seasonCounts = (t: Pick<Title, 'season_episodes'>) =>
  Object.entries(t.season_episodes ?? {})
    .map(([s, n]) => [Number(s), Number(n)] as const)
    .filter(([s, n]) => s > 0 && n > 0)
    .sort((a, b) => a[0] - b[0]);

/** The aired episode after the shared progress position, or null when caught up / no data. */
export function nextEpisode(t: Pick<Title, 'season_episodes' | 'progress_season' | 'progress_episode'>): EpisodeRef | null {
  const counts = seasonCounts(t);
  if (!counts.length) return null;
  const ps = t.progress_season ?? 0;
  const pe = t.progress_episode ?? 0;
  for (const [s, n] of counts) {
    if (s < ps) continue;
    if (s === ps && pe < n) return { s, e: pe + 1 };
    if (s > ps) return { s, e: 1 };
  }
  return null;
}

/** Number of aired episodes after the progress position. */
export function unwatchedCount(t: Pick<Title, 'season_episodes' | 'progress_season' | 'progress_episode'>) {
  const ps = t.progress_season ?? 0;
  const pe = t.progress_episode ?? 0;
  return seasonCounts(t).reduce((sum, [s, n]) => sum + (s < ps ? 0 : s === ps ? Math.max(0, n - pe) : n), 0);
}

export const epLabel = (r: EpisodeRef) => `S${r.s}E${r.e}`;

// ───────────────────────── "new" alerts ─────────────────────────

const FRESH_DAYS = 14;

/** News items from the last two weeks, newest first, preferring my services and home country. */
export function freshNews(t: Pick<Title, 'news'>, opts: { home?: string; mine?: Set<number> } = {}): NewsItem[] {
  const cutoff = Date.now() - FRESH_DAYS * 86400000;
  const score = (n: NewsItem) =>
    (n.type === 'season' ? 4 : 0) +
    (n.provider_id != null && opts.mine?.has(n.provider_id) ? 2 : 0) +
    (n.country === opts.home ? 1 : 0);
  return (t.news ?? [])
    .filter((n) => Date.parse(n.at) >= cutoff)
    .sort((a, b) => score(b) - score(a) || b.at.localeCompare(a.at));
}

export function newsLabel(n: NewsItem, home?: string) {
  if (n.type === 'season') return `S${n.season} out`;
  return `New on ${n.provider}${n.country && n.country !== home ? ` ${flag(n.country)}` : ''}`;
}

// ───────────────────────── calendar ─────────────────────────

export interface CalendarEvent {
  key: string;
  date: string;
  title: Title;
  kind: 'release' | 'premiere' | 'episode';
  label: string;
}

/** Upcoming dates for list titles: movie releases, season premieres and episodes. Mirrors the ICS feed. */
export function calendarEvents(titles: Title[], country: string, fromIso: string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const t of titles) {
    if (t.state === 'dropped') continue;
    if (t.media_type === 'movie') {
      const own = t.release_dates?.[country];
      const date = own ?? t.release_date;
      if (date && date >= fromIso && t.state !== 'watched') {
        out.push({ key: `${t.id}-rel`, date, title: t, kind: 'release', label: own ? `Release ${flag(country)}` : 'Release' });
      }
      continue;
    }
    const eps = t.upcoming_episodes ?? [];
    for (const ep of eps) {
      if (ep.date < fromIso) continue;
      out.push({
        key: `${t.id}-s${ep.s}e${ep.e}`,
        date: ep.date,
        title: t,
        kind: ep.e === 1 ? 'premiere' : 'episode',
        label: `${ep.e === 1 ? `Season ${ep.s} premiere · ` : ''}S${ep.s}E${ep.e}${ep.name ? ` · ${ep.name}` : ''}`,
      });
    }
    const covered = eps.some((ep) => ep.s === t.next_season_number && ep.e === 1);
    if (t.next_season_date && !covered && t.next_season_date >= fromIso) {
      out.push({ key: `${t.id}-season`, date: t.next_season_date, title: t, kind: 'premiere', label: `Season ${t.next_season_number} premiere` });
    }
    if (!eps.length && !t.next_season_date && t.next_episode_date && t.next_episode_date >= fromIso) {
      out.push({ key: `${t.id}-ep`, date: t.next_episode_date, title: t, kind: 'episode', label: 'New episode' });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.title.localeCompare(b.title.title));
}

/** Today's date as YYYY-MM-DD in local time. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
