import { useEffect, useMemo, useRef, useState } from 'react';
import { daysUntil, img, runtime, streamingIds, streamingProviders, upcomingBadge } from '../lib/format';
import { session } from '../lib/session';
import { db, upsertLocal } from '../lib/supabase';
import type { MediaType, Settings, Title } from '../lib/types';
import { handleError } from '../lib/ui';
import Poster from './Poster';
import ProviderLogos from './ProviderLogos';

type Where = 'any' | 'mine' | 'home' | 'countries';

interface Props {
  titles: Title[];
  settings: Settings;
  onClose: () => void;
  onOpen: (t: Title) => void;
}

const RUNTIMES = [0, 30, 60, 90, 120, 150];

export default function RandomPick({ titles, settings, onClose, onOpen }: Props) {
  const [type, setType] = useState<'any' | MediaType>('any');
  const [maxRuntime, setMaxRuntime] = useState(0);
  const [where, setWhere] = useState<Where>(session.myServices.length ? 'mine' : 'any');
  const [includeWatching, setIncludeWatching] = useState(false);
  const [includeUnreleased, setIncludeUnreleased] = useState(false);
  const [pick, setPick] = useState<Title | null>(null);
  const [spinning, setSpinning] = useState<Title | null>(null);
  const timer = useRef<number>();

  const myServices = useMemo(() => new Set(session.myServices), []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pool = useMemo(
    () =>
      titles.filter((t) => {
        if (!(t.state === 'want' || (includeWatching && t.state === 'watching'))) return false;
        if (type !== 'any' && t.media_type !== type) return false;
        if (maxRuntime && (!t.runtime_min || t.runtime_min > maxRuntime)) return false;
        if (!includeUnreleased) {
          const d = daysUntil(t.release_date);
          if (d != null && d > 0) return false;
        }
        if (where === 'home' && streamingProviders(t.providers?.[settings.home_country]).length === 0) return false;
        if (where === 'countries' && streamingIds(t, settings.countries).size === 0) return false;
        if (where === 'mine') {
          const ids = streamingIds(t, [settings.home_country]);
          if (![...ids].some((id) => myServices.has(id))) return false;
        }
        return true;
      }),
    [titles, type, maxRuntime, where, includeWatching, includeUnreleased, settings, myServices],
  );

  function weightedPick(exclude?: Title | null): Title | null {
    const candidates = pool.length > 1 && exclude ? pool.filter((t) => t.id !== exclude.id) : pool;
    if (!candidates.length) return null;
    const total = candidates.reduce((s, t) => s + 1 + t.priority, 0);
    let r = Math.random() * total;
    for (const t of candidates) {
      r -= 1 + t.priority;
      if (r < 0) return t;
    }
    return candidates[candidates.length - 1];
  }

  function spin() {
    const final = weightedPick(pick);
    if (!final) {
      setPick(null);
      return;
    }
    window.clearTimeout(timer.current);
    setPick(null);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || pool.length < 2) {
      setPick(final);
      return;
    }
    // Flick through random posters, slowing down, then land on the pick.
    let delay = 50;
    const step = () => {
      if (delay > 260) {
        setSpinning(null);
        setPick(final);
        return;
      }
      setSpinning(pool[Math.floor(Math.random() * pool.length)]);
      delay *= 1.18;
      timer.current = window.setTimeout(step, delay);
    };
    step();
  }

  async function startWatching(t: Title) {
    try {
      upsertLocal(await db.updateTitle(t.id, { state: 'watching' }));
      onClose();
    } catch (e) {
      handleError(e);
    }
  }

  const shown = spinning ?? pick;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet picker" role="dialog" aria-modal="true" aria-label="Pick something to watch" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        <h2>🎲 Pick something</h2>

        <div className="picker-filters">
          <div className="segmented small" role="group" aria-label="Type">
            {(['any', 'movie', 'tv'] as const).map((v) => (
              <button key={v} className={type === v ? 'on' : ''} onClick={() => setType(v)}>
                {v === 'any' ? 'Either' : v === 'movie' ? 'Movie' : 'TV'}
              </button>
            ))}
          </div>
          <label className="inline">
            Max length
            <select value={maxRuntime} onChange={(e) => setMaxRuntime(Number(e.target.value))}>
              {RUNTIMES.map((r) => (
                <option key={r} value={r}>{r ? `≤ ${runtime(r)}${type === 'tv' ? ' / ep' : ''}` : 'Any'}</option>
              ))}
            </select>
          </label>
          <label className="inline">
            Streaming on
            <select value={where} onChange={(e) => setWhere(e.target.value as Where)}>
              <option value="any">Anything (incl. not streaming)</option>
              <option value="mine" disabled={!myServices.size}>My services{myServices.size ? '' : ' (set in Settings)'}</option>
              <option value="home">Any service in {settings.home_country}</option>
              <option value="countries">Any service in my countries</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={includeWatching} onChange={(e) => setIncludeWatching(e.target.checked)} />
            Include “watching”
          </label>
          <label className="check">
            <input type="checkbox" checked={includeUnreleased} onChange={(e) => setIncludeUnreleased(e.target.checked)} />
            Include unreleased
          </label>
        </div>

        <p className="muted small">{pool.length} title{pool.length === 1 ? '' : 's'} match · higher priority = more likely</p>

        <div className={`pick-stage ${spinning ? 'spinning' : ''}`}>
          {shown ? (
            <div className="pick-card" style={shown.backdrop_path ? { backgroundImage: `linear-gradient(transparent, var(--bg) 85%), url(${img(shown.backdrop_path, 'w780')})` } : undefined}>
              <div className="pick-poster"><Poster path={shown.poster_path} title={shown.title} size="w342" /></div>
              <div className="pick-info">
                <h3>{shown.title} {shown.year && <span className="muted">({shown.year})</span>}</h3>
                {!spinning && (
                  <>
                    <p className="muted small">
                      {shown.media_type === 'tv' ? `TV · ${shown.seasons ?? '?'} seasons` : 'Movie'}
                      {shown.runtime_min ? ` · ${runtime(shown.runtime_min)}${shown.media_type === 'tv' ? '/ep' : ''}` : ''}
                      {shown.tmdb_rating ? ` · ★ ${shown.tmdb_rating.toFixed(1)}` : ''}
                    </p>
                    {upcomingBadge(shown) && <p className="small">{upcomingBadge(shown)}</p>}
                    <ProviderLogos providers={streamingProviders(shown.providers?.[settings.home_country])} max={6} mine={myServices} />
                    <p className="overview clamp">{shown.overview}</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="pick-empty muted">{pool.length ? 'Ready when you are.' : 'Nothing matches these filters.'}</div>
          )}
        </div>

        <div className="actions">
          <button className="btn primary big" onClick={spin} disabled={!pool.length || !!spinning}>
            {pick ? '🎲 Reroll' : '🎲 Pick for me'}
          </button>
          {pick && !spinning && (
            <>
              <button className="btn" onClick={() => onOpen(pick)}>Details</button>
              {pick.state === 'want' && <button className="btn" onClick={() => startWatching(pick)}>▶ Start watching</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
