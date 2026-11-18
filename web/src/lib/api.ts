import { PasscodeError, SUPABASE_KEY, SUPABASE_URL } from './supabase';
import { session } from './session';
import type { DiscoverData, MediaType, Meta, Summary } from './types';

async function tmdbFn<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tmdb`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY!,
      'x-passcode': session.passcode ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new PasscodeError('Passcode rejected');
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  search: (query: string) => tmdbFn<{ results: Summary[] }>({ action: 'search', query }).then((r) => r.results),
  details: (media_type: MediaType, tmdb_id: number) => tmdbFn<Meta>({ action: 'details', media_type, tmdb_id }),
  discover: (region?: string) => tmdbFn<DiscoverData>({ action: 'discover', region }),
  refresh: (opts: { id?: string; max_age_days?: number; limit?: number } = {}) =>
    tmdbFn<{ refreshed: number; total: number; errors: string[] }>({ action: 'refresh', ...opts }),
};
