import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  countryName, daysUntil, flag, fmtDate, img, inDays, mergeProviders, nextSeasonNote, releaseDateFor, runtime,
  sortCountries, STATE_LABEL,
} from '../lib/format';
import { session } from '../lib/session';
import { db, removeLocal, upsertLocal } from '../lib/supabase';
import type { CountryProviders, MediaType, Meta, Provider, Settings, Title, WatchState } from '../lib/types';
import { handleError, toast } from '../lib/ui';
import Poster from './Poster';

interface Props {
  /** Either an existing list row… */
  title?: Title;
  /** …or a TMDB id to preview before adding. */
  preview?: { media_type: MediaType; tmdb_id: number };
  settings: Settings;
  theaterCountry: string;
  onClose: () => void;
  existing?: Title;
}

export default function TitleDetail({ title, preview, settings, theaterCountry, onClose, existing }: Props) {
  const [meta, setMeta] = useState<Meta | null>(title ?? null);
  const [notes, setNotes] = useState(title?.notes ?? '');
  const [busy, setBusy] = useState(false);

  // Keep in sync with live updates for list rows.
  useEffect(() => {
    if (title) {
      setMeta(title);
    }
  }, [title]);
  useEffect(() => setNotes(title?.notes ?? ''), [title?.id, title?.notes]);

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    setMeta(null);
    api.details(preview.media_type, preview.tmdb_id).then(
      (m) => !cancelled && setMeta(m),
      (e) => {
        handleError(e);
        onClose();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [preview?.media_type, preview?.tmdb_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const patch = (p: Parameters<typeof db.updateTitle>[1]) =>
    title && run(async () => upsertLocal(await db.updateTitle(title.id, p)));

  const add = () =>
    meta &&
    run(async () => {
      const row = await db.addTitle(meta);
      upsertLocal(row);
      toast(`Added “${row.title}”`);
      onClose();
    });

  const remove = () =>
    title &&
    confirm(`Remove “${title.title}” from the list?`) &&
    run(async () => {
      await db.deleteTitle(title.id);
      removeLocal(title.id);
      onClose();
    });

  const refresh = () =>
    title &&
    run(async () => {
      await api.refresh({ id: title.id });
      toast('Details refreshed');
    });

  const me = session.name;
  const iWatched = title ? title.watched_by.includes(me) : false;
  const toggleWatchedByMe = () =>
    title &&
    patch({ watched_by: iWatched ? title.watched_by.filter((n) => n !== me) : [...title.watched_by, me] });

  const ownRelease = meta?.media_type === 'movie' ? meta.release_dates?.[theaterCountry] : undefined;
  const relDate = meta ? (meta.media_type === 'movie' ? releaseDateFor(meta, theaterCountry) : meta.release_date) : null;
  const relDays = daysUntil(relDate);
  const seasonNote = meta ? nextSeasonNote(meta) : null;
  const epDays = daysUntil(meta?.next_episode_date);
  const countries = sortCountries(settings.countries, settings.home_country);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        {!meta ? (
          <div className="loading">Loading…</div>
        ) : (
          <>
            {meta.backdrop_path && (
              <div className="backdrop" style={{ backgroundImage: `url(${img(meta.backdrop_path, 'w1280')})` }} />
            )}
            <div className="detail-head">
              <div className="detail-poster">
                <Poster path={meta.poster_path} title={meta.title} size="w342" />
              </div>
              <div>
                <h2>
                  {meta.title} {meta.year && <span className="muted">({meta.year})</span>}
                </h2>
                {meta.tagline && <p className="tagline">{meta.tagline}</p>}
                <div className="facts">
                  <span className="chip">{meta.media_type === 'tv' ? 'TV series' : 'Movie'}</span>
                  {meta.certification && <span className="chip">{meta.certification}</span>}
                  {meta.media_type === 'movie' && meta.runtime_min && <span className="chip">{runtime(meta.runtime_min)}</span>}
                  {meta.media_type === 'tv' && meta.seasons != null && (
                    <span className="chip">
                      {meta.seasons === 0 ? 'Not aired yet' : `${meta.seasons} season${meta.seasons === 1 ? '' : 's'}`}
                    </span>
                  )}
                  {meta.media_type === 'tv' && !!meta.episodes && <span className="chip">{meta.episodes} episodes</span>}
                  {meta.media_type === 'tv' && meta.runtime_min && <span className="chip">~{runtime(meta.runtime_min)}/ep</span>}
                  {meta.status_text && <span className="chip">{meta.status_text}</span>}
                </div>
                <div className="ratings">
                  {meta.tmdb_rating ? (
                    <span><b>★ {meta.tmdb_rating.toFixed(1)}</b> TMDB{meta.tmdb_votes ? <span className="muted small"> ({meta.tmdb_votes.toLocaleString()})</span> : null}</span>
                  ) : null}
                  {meta.imdb_rating ? (
                    <a href={`https://www.imdb.com/title/${meta.imdb_id}/`} target="_blank" rel="noreferrer"><b>{meta.imdb_rating.toFixed(1)}</b> IMDb</a>
                  ) : null}
                  {meta.rt_rating != null && <span><b>🍅 {meta.rt_rating}%</b> RT</span>}
                </div>
                {relDate && relDays != null && relDays >= 0 && (
                  <p className="upcoming-note">
                    📅 {meta.media_type === 'tv' ? 'Premieres' : 'Releases'}
                    {ownRelease ? ` in ${flag(theaterCountry)} ${countryName(theaterCountry)}` : ''} {inDays(relDays)} ({fmtDate(relDate)})
                  </p>
                )}
                {meta.media_type === 'movie' && !ownRelease && Object.keys(meta.release_dates ?? {}).length > 0 && relDays != null && relDays >= 0 && (
                  <p className="muted small">No {countryName(theaterCountry)} date yet — showing the main release date.</p>
                )}
                {seasonNote && <p className="upcoming-note">🆕 {seasonNote}</p>}
                {meta.media_type === 'tv' && epDays != null && epDays >= 0 && (
                  <p className="upcoming-note">📺 Next episode {inDays(epDays)} ({fmtDate(meta.next_episode_date!)})</p>
                )}
              </div>
            </div>

            {meta.genres?.length > 0 && <p className="muted small genres">{meta.genres.join(' · ')}</p>}
            <p className="overview">{meta.overview || 'No description available.'}</p>

            {!title && (
              <div className="actions">
                {existing ? (
                  <span className="muted">Already on the list ({STATE_LABEL[existing.state]})</span>
                ) : (
                  <button className="btn primary" onClick={add} disabled={busy}>+ Add to list</button>
                )}
              </div>
            )}

            {title && (
              <section className="list-controls">
                <div className="segmented" role="group" aria-label="Status">
                  {(Object.keys(STATE_LABEL) as WatchState[]).map((s) => (
                    <button key={s} className={title.state === s ? 'on' : ''} onClick={() => patch({ state: s })} disabled={busy}>
                      {STATE_LABEL[s]}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <label className="inline">
                    Priority
                    <select value={title.priority} onChange={(e) => patch({ priority: Number(e.target.value) })} disabled={busy}>
                      <option value={0}>Normal</option>
                      <option value={1}>🔥 High</option>
                      <option value={2}>🔥🔥 Higher</option>
                      <option value={3}>🔥🔥🔥 Must watch</option>
                    </select>
                  </label>
                  {me && (
                    <button className={`btn ${iWatched ? 'on' : ''}`} onClick={toggleWatchedByMe} disabled={busy}>
                      {iWatched ? '✓ I’ve seen it' : 'Mark seen by me'}
                    </button>
                  )}
                </div>
                {title.watched_by.length > 0 && <p className="muted small">Seen by: {title.watched_by.join(', ')}</p>}
                <textarea
                  placeholder="Notes (who recommended it, where we left off…)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => notes !== title.notes && patch({ notes })}
                  rows={2}
                />
                <p className="muted small">
                  Added{title.added_by ? ` by ${title.added_by}` : ''} on {new Date(title.added_at).toLocaleDateString()}
                </p>
              </section>
            )}

            <section>
              <h3>Where to watch</h3>
              {countries.map((cc) => (
                <CountryRow key={cc} cc={cc} cp={meta.providers?.[cc]} home={cc === settings.home_country} />
              ))}
              <p className="muted small">Streaming data by JustWatch.</p>
            </section>

            {title && (
              <div className="actions end">
                <button className="btn" onClick={refresh} disabled={busy}>↻ Refresh details</button>
                <button className="btn danger" onClick={remove} disabled={busy}>Remove</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CountryRow({ cc, cp, home }: { cc: string; cp?: CountryProviders; home: boolean }) {
  const groups: [string, Provider[]][] = [
    ['Stream', mergeProviders(cp?.flatrate ?? [])],
    ['Free', mergeProviders([...(cp?.free ?? []), ...(cp?.ads ?? [])])],
    ['Rent', mergeProviders(cp?.rent ?? [])],
    ['Buy', mergeProviders(cp?.buy ?? [])],
  ];
  const any = groups.some(([, l]) => l?.length);
  return (
    <div className={`country ${home ? 'home' : ''}`}>
      <div className="country-name">
        <span className="flag">{flag(cc)}</span> {countryName(cc)}
        {cp?.link && (
          <a href={cp.link} target="_blank" rel="noreferrer" className="small">open ↗</a>
        )}
      </div>
      {!any ? (
        <p className="muted small">Not available</p>
      ) : (
        groups.map(([label, list]) =>
          list?.length ? (
            <div key={label} className="prov-group">
              <span className="prov-label">{label}</span>
              <span className="prov-list">
                {list.map((p) => (
                  <span key={p.id} className="prov" title={p.name}>
                    {p.logo && <img src={img(p.logo, 'w92') ?? ''} alt="" />}
                    <span>{p.name}</span>
                  </span>
                ))}
              </span>
            </div>
          ) : null,
        )
      )}
    </div>
  );
}
