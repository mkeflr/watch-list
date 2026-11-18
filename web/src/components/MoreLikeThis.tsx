import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useQuickAdd } from '../lib/actions';
import type { MediaType, Summary, Title } from '../lib/types';
import Rail from './Rail';
import TitleCard from './TitleCard';

const cache = new Map<string, Summary[]>();

/** "More like this" recommendations for one title (lazy-loaded). */
export default function MoreLikeThis({ seed, titles, theaterCountry, onPreview }: {
  seed: { media_type: MediaType; tmdb_id: number };
  titles: Title[];
  theaterCountry: string;
  onPreview: (s: Summary) => void;
}) {
  const key = `${seed.media_type}:${seed.tmdb_id}`;
  const [items, setItems] = useState<Summary[] | null>(cache.get(key) ?? null);
  const quick = useQuickAdd(titles);

  useEffect(() => {
    if (cache.has(key)) return;
    let cancelled = false;
    api.recommendations([seed]).then(
      (r) => {
        const list = r[0]?.results ?? [];
        cache.set(key, list);
        if (!cancelled) setItems(list);
      },
      () => !cancelled && setItems([]),
    );
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items?.length) return null;
  return (
    <Rail
      title="More like this"
      items={items.slice(0, 15)}
      render={(s) => (
        <TitleCard
          key={`${s.media_type}:${s.tmdb_id}`}
          item={s}
          theaterCountry={theaterCountry}
          onOpen={() => onPreview(s)}
          onAdd={() => quick.add(s)}
          added={quick.isAdded(s)}
        />
      )}
    />
  );
}
