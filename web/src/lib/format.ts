import type { CountryProviders, Provider, Title } from './types';

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

/** Badge text for upcoming releases / new episodes, or null. */
export function upcomingBadge(t: Pick<Title, 'media_type' | 'release_date' | 'next_episode_date'>) {
  const rel = daysUntil(t.release_date);
  if (rel != null && rel >= 0) return `Out ${inDays(rel)}`;
  if (t.media_type === 'tv') {
    const ep = daysUntil(t.next_episode_date);
    if (ep != null && ep >= 0) return `New ep ${inDays(ep)}`;
  }
  return null;
}

/** Subscription-style providers (stream, free, with ads) for one country. */
export function streamingProviders(cp: CountryProviders | undefined): Provider[] {
  if (!cp) return [];
  const seen = new Set<number>();
  return [...(cp.flatrate ?? []), ...(cp.free ?? []), ...(cp.ads ?? [])].filter((p) =>
    seen.has(p.id) ? false : (seen.add(p.id), true),
  );
}

/** Every subscription-style provider id for a title across the given countries. */
export function streamingIds(t: Title, countries: string[]) {
  const ids = new Set<number>();
  for (const cc of countries) for (const p of streamingProviders(t.providers?.[cc])) ids.add(p.id);
  return ids;
}

export function sortCountries(countries: string[], home: string) {
  return [...countries].sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)));
}

export const STATE_LABEL: Record<Title['state'], string> = {
  want: 'Want to watch',
  watching: 'Watching',
  watched: 'Watched',
  dropped: 'Dropped',
};
