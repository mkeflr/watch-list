-- Episode progress (shared), "new" alerts, per-season episode counts and upcoming episodes (calendar).
-- Additive: safe to run on a live database. Run "Refresh all details" afterwards to backfill.

alter table public.titles
  add column if not exists progress_season   integer,
  add column if not exists progress_episode  integer,
  add column if not exists season_episodes   jsonb not null default '{}'::jsonb,
  add column if not exists upcoming_episodes jsonb not null default '[]'::jsonb,
  add column if not exists news              jsonb not null default '[]'::jsonb;

create or replace function public._apply_metadata(t public.titles, m jsonb)
returns public.titles
language plpgsql
stable
as $$
begin
  t.title              := coalesce(m->>'title', t.title);
  t.year               := (m->>'year')::int;
  t.overview           := m->>'overview';
  t.tagline            := m->>'tagline';
  t.poster_path        := m->>'poster_path';
  t.backdrop_path      := m->>'backdrop_path';
  t.genres             := coalesce(array(select jsonb_array_elements_text(m->'genres')), '{}');
  t.tmdb_rating        := (m->>'tmdb_rating')::numeric;
  t.tmdb_votes         := (m->>'tmdb_votes')::int;
  t.imdb_id            := m->>'imdb_id';
  t.imdb_rating        := coalesce((m->>'imdb_rating')::numeric, t.imdb_rating);
  t.rt_rating          := coalesce((m->>'rt_rating')::int, t.rt_rating);
  t.certification      := m->>'certification';
  t.runtime_min        := (m->>'runtime_min')::int;
  t.seasons            := (m->>'seasons')::int;
  t.episodes           := (m->>'episodes')::int;
  t.next_season_number := (m->>'next_season_number')::int;
  t.next_season_date   := nullif(m->>'next_season_date', '')::date;
  t.season_episodes    := coalesce(m->'season_episodes', '{}'::jsonb);
  t.upcoming_episodes  := coalesce(m->'upcoming_episodes', '[]'::jsonb);
  t.status_text        := m->>'status_text';
  t.release_date       := nullif(m->>'release_date', '')::date;
  t.release_dates      := coalesce(m->'release_dates', '{}'::jsonb);
  t.next_episode_date  := nullif(m->>'next_episode_date', '')::date;
  t.providers          := coalesce(m->'providers', '{}'::jsonb);
  if m ? 'news' then
    t.news := coalesce(m->'news', '[]'::jsonb);
  else
    t.news := coalesce(t.news, '[]'::jsonb); -- keep existing; add_title builds rows with nulls
  end if;
  t.metadata_refreshed_at := now();
  return t;
end;
$$;

create or replace function public.refresh_title_metadata(passcode text, title_id uuid, meta jsonb)
returns public.titles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.titles;
begin
  perform public._require_passcode(passcode);
  select * into r from public.titles where id = title_id;
  if not found then
    raise exception 'title not found';
  end if;
  r := public._apply_metadata(r, meta);
  update public.titles set
    title = r.title, year = r.year, overview = r.overview, tagline = r.tagline,
    poster_path = r.poster_path, backdrop_path = r.backdrop_path, genres = r.genres,
    tmdb_rating = r.tmdb_rating, tmdb_votes = r.tmdb_votes, imdb_id = r.imdb_id,
    imdb_rating = r.imdb_rating, rt_rating = r.rt_rating, certification = r.certification,
    runtime_min = r.runtime_min, seasons = r.seasons, episodes = r.episodes,
    next_season_number = r.next_season_number, next_season_date = r.next_season_date,
    season_episodes = r.season_episodes, upcoming_episodes = r.upcoming_episodes, news = r.news,
    status_text = r.status_text, release_date = r.release_date, release_dates = r.release_dates,
    next_episode_date = r.next_episode_date, providers = r.providers,
    metadata_refreshed_at = r.metadata_refreshed_at
  where id = title_id
  returning * into r;
  return r;
end;
$$;

-- patch may contain: state, priority, notes, watched_by, progress_season, progress_episode
-- (progress keys may be null to reset).
create or replace function public.update_title(passcode text, title_id uuid, patch jsonb)
returns public.titles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.titles;
begin
  perform public._require_passcode(passcode);

  update public.titles set
    state      = coalesce(patch->>'state', state),
    priority   = coalesce((patch->>'priority')::smallint, priority),
    notes      = coalesce(left(patch->>'notes', 4000), notes),
    watched_by = case when patch ? 'watched_by'
                   then array(select left(jsonb_array_elements_text(patch->'watched_by'), 60))
                   else watched_by end,
    progress_season  = case when patch ? 'progress_season'
                         then (patch->>'progress_season')::int else progress_season end,
    progress_episode = case when patch ? 'progress_episode'
                         then (patch->>'progress_episode')::int else progress_episode end,
    updated_at = now()
  where id = title_id
  returning * into r;

  if not found then
    raise exception 'title not found';
  end if;
  return r;
end;
$$;
