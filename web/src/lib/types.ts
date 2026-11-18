export type MediaType = 'movie' | 'tv';
export type WatchState = 'want' | 'watching' | 'watched' | 'dropped';

export interface Provider {
  id: number;
  name: string;
  logo: string | null;
  /** All provider ids merged into this entry (e.g. "HBO Max" + "HBO Max Amazon Channel"). */
  ids?: number[];
}

export interface CountryProviders {
  link?: string;
  flatrate?: Provider[];
  free?: Provider[];
  ads?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
}

/** Lightweight search / discover result. */
export interface Summary {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: number | null;
  release_date: string | null;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  tmdb_rating: number | null;
}

/** Full normalized metadata from the `tmdb` edge function. */
export interface Meta extends Summary {
  tagline: string | null;
  genres: string[];
  tmdb_votes: number | null;
  imdb_id: string | null;
  imdb_rating: number | null;
  rt_rating: number | null;
  certification: string | null;
  runtime_min: number | null;
  /** Aired seasons / episodes only. */
  seasons: number | null;
  episodes: number | null;
  next_season_number?: number | null;
  next_season_date?: string | null;
  /** Movies: release date per country (theatrical first, else digital). */
  release_dates?: Record<string, string>;
  status_text: string | null;
  next_episode_date: string | null;
  providers: Record<string, CountryProviders>;
}

/** A row in the shared list. */
export interface Title extends Meta {
  id: string;
  state: WatchState;
  priority: number;
  notes: string;
  added_by: string;
  watched_by: string[];
  added_at: string;
  updated_at: string;
  metadata_refreshed_at: string;
}

export interface Settings {
  countries: string[];
  home_country: string;
}

export interface DiscoverData {
  region?: string;
  upcoming: Summary[];
  now_playing: Summary[];
  on_the_air: Summary[];
  trending: Summary[];
}
