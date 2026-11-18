import { epLabel, freshNews, newsLabel, nextEpisode, runtime, streamingProviders, unwatchedCount, upcomingBadge } from '../lib/format';
import type { ReactNode } from 'react';
import type { Summary, Title } from '../lib/types';
import Poster from './Poster';
import ProviderLogos from './ProviderLogos';

interface Props {
  item: Title | Summary;
  homeCountry?: string;
  theaterCountry?: string;
  myServices?: Set<number>;
  onOpen: () => void;
  onAdd?: () => void;
  added?: boolean;
  /** Extra content under the card (e.g. a quick “✓ next episode” button). */
  footer?: ReactNode;
}

export default function TitleCard({ item, homeCountry, theaterCountry, myServices, onOpen, onAdd, added, footer }: Props) {
  const full = 'id' in item ? (item as Title) : null;
  const badge = upcomingBadge(full ?? { ...item, next_episode_date: null }, theaterCountry);
  const providers = full && homeCountry ? streamingProviders(full.providers?.[homeCountry]) : [];
  const news = full ? freshNews(full, { home: homeCountry, mine: myServices })[0] : undefined;
  const next = full?.media_type === 'tv' && full.state === 'watching' ? nextEpisode(full) : null;
  const progress =
    full?.media_type === 'tv' && full.progress_season
      ? `${epLabel({ s: full.progress_season, e: full.progress_episode ?? 0 })}${next ? ` · ${unwatchedCount(full)} left` : ' · caught up'}`
      : null;
  const detail = full
    ? full.media_type === 'tv'
      ? full.seasons
        ? `${full.seasons} season${full.seasons > 1 ? 's' : ''}${full.episodes ? ` · ${full.episodes} eps` : ''}`
        : full.seasons === 0
          ? 'Not aired yet'
          : null
      : runtime(full.runtime_min)
    : null;

  return (
    <article className={`card state-${full?.state ?? 'none'}`}>
      <button className="card-hit" onClick={onOpen} aria-label={`Open ${item.title}`}>
        <div className="card-poster">
          <Poster path={item.poster_path} title={item.title} size="w342" />
          {news ? (
            <span className="badge news">🆕 {newsLabel(news, homeCountry)}</span>
          ) : (
            badge && <span className="badge upcoming">{badge}</span>
          )}
          {full && full.state !== 'want' && <span className={`badge state ${full.state}`}>{full.state}</span>}
          {item.tmdb_rating ? <span className="badge rating">★ {item.tmdb_rating.toFixed(1)}</span> : null}
          {full && full.priority > 0 && <span className="badge prio">{'🔥'.repeat(full.priority)}</span>}
        </div>
        <div className="card-body">
          <h3>{item.title}</h3>
          <p className="muted small">
            {item.media_type === 'tv' ? 'TV' : 'Movie'}
            {item.year ? ` · ${item.year}` : ''}
            {detail ? ` · ${detail}` : ''}
          </p>
          {progress && <p className="progress-line small">▶ {progress}</p>}
          {providers.length > 0 && <ProviderLogos providers={providers} max={4} mine={myServices} />}
        </div>
      </button>
      {footer}
      {onAdd && (
        <button className={`add-btn ${added ? 'added' : ''}`} onClick={onAdd} disabled={added} aria-label={added ? 'On list' : `Add ${item.title}`}>
          {added ? '✓' : '+'}
        </button>
      )}
    </article>
  );
}
