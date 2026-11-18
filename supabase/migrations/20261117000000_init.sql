-- Shared watchlist schema.
-- Reads are public (anon). All writes go through SECURITY DEFINER functions
-- that verify the shared passcode, so the anon key alone cannot modify data.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── tables ─────────────────────────

create table public.titles (
  id                    uuid primary key default gen_random_uuid(),
  tmdb_id               integer not null,
  media_type            text not null check (media_type in ('movie', 'tv')),
  title                 text not null,
  year                  integer,
  overview              text,
  tagline               text,
  poster_path           text,
  backdrop_path         text,
  genres                text[] not null default '{}',
  tmdb_rating           numeric(3, 1),
  tmdb_votes            integer,
  imdb_id               text,
  imdb_rating           numeric(3, 1),
  rt_rating             integer,
  certification         text,
  runtime_min           integer,
  seasons               integer,
  episodes              integer,
  status_text           text,
  release_date          date,
  next_episode_date     date,
  providers             jsonb not null default '{}'::jsonb,
  -- list fields (edited by people)
  state                 text not null default 'want'
                          check (state in ('want', 'watching', 'watched', 'dropped')),
  priority              smallint not null default 0 check (priority between 0 and 3),
  notes                 text not null default '',
  added_by              text not null default '',
  watched_by            text[] not null default '{}',
  added_at              timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  metadata_refreshed_at timestamptz not null default now(),
  unique (tmdb_id, media_type)
);

create table public.settings (
  id           boolean primary key default true check (id), -- single row
  countries    text[] not null default '{US,GB,CA,AU}',
  home_country text   not null default 'US',
  updated_at   timestamptz not null default now()
);
insert into public.settings default values;

create table public.app_secret (
  id            boolean primary key default true check (id),
  passcode_hash text not null
);

-- ───────────────────────── RLS ─────────────────────────

alter table public.titles     enable row level security;
alter table public.settings   enable row level security;
alter table public.app_secret enable row level security;

create policy "public read titles"   on public.titles   for select using (true);
create policy "public read settings" on public.settings for select using (true);
-- app_secret: no policies → invisible to anon/authenticated.

-- Newer Supabase projects don't auto-grant table access to API roles, so be explicit.
grant usage on schema public to anon, authenticated;
grant select on public.titles, public.settings to anon, authenticated;
revoke insert, update, delete on public.titles, public.settings from anon, authenticated;
revoke all on public.app_secret from anon, authenticated;

-- ───────────────────────── passcode ─────────────────────────

-- Run once from the SQL editor (as postgres): select public.set_passcode('your-passcode');
create or replace function public.set_passcode(new_passcode text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.app_secret (id, passcode_hash)
  values (true, crypt(new_passcode, gen_salt('bf')))
  on conflict (id) do update set passcode_hash = excluded.passcode_hash;
$$;
revoke execute on function public.set_passcode(text) from public, anon, authenticated;

create or replace function public.check_passcode(passcode text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.app_secret
    where passcode_hash = crypt(coalesce(passcode, ''), passcode_hash)
  );
$$;

create or replace function public._require_passcode(passcode text)
returns void
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.check_passcode(passcode) then
    raise exception 'invalid passcode' using errcode = '28P01';
  end if;
end;
$$;
revoke execute on function public._require_passcode(text) from public, anon, authenticated;

-- ───────────────────────── metadata helper ─────────────────────────

-- Applies normalized metadata (from the tmdb edge function) to a row.
create or replace function public._apply_metadata(t public.titles, m jsonb)
returns public.titles
language plpgsql
stable
as $$
begin
  t.title             := coalesce(m->>'title', t.title);
  t.year              := (m->>'year')::int;
  t.overview          := m->>'overview';
  t.tagline           := m->>'tagline';
  t.poster_path       := m->>'poster_path';
  t.backdrop_path     := m->>'backdrop_path';
  t.genres            := coalesce(array(select jsonb_array_elements_text(m->'genres')), '{}');
  t.tmdb_rating       := (m->>'tmdb_rating')::numeric;
  t.tmdb_votes        := (m->>'tmdb_votes')::int;
  t.imdb_id           := m->>'imdb_id';
  t.imdb_rating       := coalesce((m->>'imdb_rating')::numeric, t.imdb_rating);
  t.rt_rating         := coalesce((m->>'rt_rating')::int, t.rt_rating);
  t.certification     := m->>'certification';
  t.runtime_min       := (m->>'runtime_min')::int;
  t.seasons           := (m->>'seasons')::int;
  t.episodes          := (m->>'episodes')::int;
  t.status_text       := m->>'status_text';
  t.release_date      := nullif(m->>'release_date', '')::date;
  t.next_episode_date := nullif(m->>'next_episode_date', '')::date;
  t.providers         := coalesce(m->'providers', '{}'::jsonb);
  t.metadata_refreshed_at := now();
  return t;
end;
$$;

-- ───────────────────────── write RPCs ─────────────────────────

create or replace function public.add_title(passcode text, meta jsonb, added_by text default '')
returns public.titles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.titles;
begin
  perform public._require_passcode(passcode);

  select * into r from public.titles
  where tmdb_id = (meta->>'tmdb_id')::int and media_type = meta->>'media_type';
  if found then
    return r; -- already on the list
  end if;

  r.id := gen_random_uuid();
  r.tmdb_id := (meta->>'tmdb_id')::int;
  r.media_type := meta->>'media_type';
  r.state := 'want';
  r.priority := 0;
  r.notes := '';
  r.added_by := left(coalesce(added_by, ''), 60);
  r.watched_by := '{}';
  r.added_at := now();
  r.updated_at := now();
  r := public._apply_metadata(r, meta);

  insert into public.titles values (r.*) returning * into r;
  return r;
end;
$$;

-- patch may contain: state, priority, notes, watched_by
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
    updated_at = now()
  where id = title_id
  returning * into r;

  if not found then
    raise exception 'title not found';
  end if;
  return r;
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
    status_text = r.status_text, release_date = r.release_date,
    next_episode_date = r.next_episode_date, providers = r.providers,
    metadata_refreshed_at = r.metadata_refreshed_at
  where id = title_id
  returning * into r;
  return r;
end;
$$;

create or replace function public.delete_title(passcode text, title_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public._require_passcode(passcode);
  delete from public.titles where id = title_id;
end;
$$;

create or replace function public.update_settings(passcode text, countries text[], home_country text)
returns public.settings
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.settings;
  cleaned text[];
begin
  perform public._require_passcode(passcode);
  cleaned := array(
    select cc from (
      select upper(c) cc, min(i) first_i
      from unnest(update_settings.countries) with ordinality u(c, i)
      where c ~* '^[a-z]{2}$'
      group by upper(c)
    ) x order by first_i
  );
  if coalesce(array_length(cleaned, 1), 0) = 0 then
    raise exception 'at least one country is required';
  end if;
  update public.settings set
    countries = cleaned,
    home_country = case when upper(update_settings.home_country) = any(cleaned)
                     then upper(update_settings.home_country) else cleaned[1] end,
    updated_at = now()
  where id
  returning * into s;
  return s;
end;
$$;

grant execute on function
  public.check_passcode(text),
  public.add_title(text, jsonb, text),
  public.update_title(text, uuid, jsonb),
  public.refresh_title_metadata(text, uuid, jsonb),
  public.delete_title(text, uuid),
  public.update_settings(text, text[], text)
to anon, authenticated;

-- ───────────────────────── realtime ─────────────────────────

alter publication supabase_realtime add table public.titles, public.settings;
alter table public.titles replica identity full;
