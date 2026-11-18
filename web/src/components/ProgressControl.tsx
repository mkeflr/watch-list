import { useEffect, useState } from 'react';
import { setProgress } from '../lib/actions';
import { db, upsertLocal } from '../lib/supabase';
import { epLabel, nextEpisode, nextSeasonNote, unwatchedCount } from '../lib/format';
import type { Title } from '../lib/types';
import { handleError } from '../lib/ui';

const ENDED = new Set(['Ended', 'Canceled', 'Cancelled']);

/** Shared "where are we up to" control for TV shows. */
export default function ProgressControl({ title }: { title: Title }) {
  const counts = Object.entries(title.season_episodes ?? {})
    .map(([s, n]) => [Number(s), Number(n)] as const)
    .filter(([s, n]) => s > 0 && n > 0)
    .sort((a, b) => a[0] - b[0]);
  const [season, setSeason] = useState(title.progress_season ?? counts[0]?.[0] ?? 1);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (title.progress_season) setSeason(title.progress_season);
  }, [title.progress_season]);

  if (!counts.length) {
    return (
      <div className="progress-box">
        <p className="muted small">Episode tracking needs fresh details — use “↻ Refresh details” below.</p>
      </div>
    );
  }

  const next = nextEpisode(title);
  const left = unwatchedCount(title);
  const started = !!title.progress_season;
  const seasonCount = counts.find(([s]) => s === season)?.[1] ?? 0;
  const upcoming = nextSeasonNote(title);

  async function go(s: number | null, e: number | null) {
    setBusy(true);
    const row = await setProgress(title, s, e);
    setBusy(false);
    if (row && s != null && !nextEpisode(row) && ENDED.has(row.status_text ?? '') && row.state !== 'watched') {
      if (confirm(`That’s the last episode of “${row.title}”. Mark the show as watched?`)) {
        try {
          upsertLocal(await db.updateTitle(row.id, { state: 'watched' }));
        } catch (err) {
          handleError(err);
        }
      }
    }
  }

  return (
    <div className="progress-box">
      <div className="progress-head">
        <strong>Progress</strong>
        <span className="muted small">
          {started
            ? `Watched up to ${epLabel({ s: title.progress_season!, e: title.progress_episode ?? 0 })} · ${
                next ? `${left} episode${left === 1 ? '' : 's'} left` : 'all caught up ✓'
              }`
            : `Not started · ${left} episodes aired`}
        </span>
      </div>
      {!next && upcoming && <p className="muted small">{upcoming}</p>}
      <div className="row">
        {next && (
          <button className="btn primary" onClick={() => go(next.s, next.e)} disabled={busy}>
            ✓ Watched {epLabel(next)}
          </button>
        )}
        <label className="inline">
          Season
          <select value={season} onChange={(e) => setSeason(Number(e.target.value))} disabled={busy}>
            {counts.map(([s]) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="inline">
          Up to ep
          <select
            value={title.progress_season === season ? title.progress_episode ?? 0 : ''}
            onChange={(e) => {
              const ep = Number(e.target.value);
              if (ep > 0) go(season, ep);
              else if (season > 1) go(season - 1, counts.find(([s]) => s === season - 1)?.[1] ?? null);
              else go(null, null);
            }}
            disabled={busy}
          >
            {title.progress_season !== season && <option value="">—</option>}
            <option value={0}>None</option>
            {Array.from({ length: seasonCount }, (_, i) => i + 1).map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        {started && (
          <button className="btn link" onClick={() => go(null, null)} disabled={busy}>Reset</button>
        )}
      </div>
    </div>
  );
}
