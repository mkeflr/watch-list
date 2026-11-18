import { useState } from 'react';
import { api } from './api';
import { db, upsertLocal } from './supabase';
import type { Summary, Title } from './types';
import { handleError, toast } from './ui';

const keyOf = (s: { media_type: string; tmdb_id: number }) => `${s.media_type}:${s.tmdb_id}`;

/** Quick-add search/discover results, tracking which ones are in flight. */
export function useQuickAdd(titles: Title[]) {
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const onList = new Set(titles.map(keyOf));

  async function add(s: Summary) {
    const key = keyOf(s);
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

  return { add, isAdded: (s: Summary) => onList.has(keyOf(s)) || adding.has(keyOf(s)), onList };
}

/** Advance (or set) shared episode progress; starting a show moves it to "watching". */
export async function setProgress(t: Title, s: number | null, e: number | null) {
  try {
    const patch: Parameters<typeof db.updateTitle>[1] = { progress_season: s, progress_episode: e };
    if (s != null && t.state === 'want') patch.state = 'watching';
    const row = await db.updateTitle(t.id, patch);
    upsertLocal(row);
    return row;
  } catch (err) {
    handleError(err);
    return null;
  }
}
