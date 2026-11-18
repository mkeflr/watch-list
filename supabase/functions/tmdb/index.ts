// Supabase Edge Function: TMDB proxy + metadata normalizer.
//
// Secrets (supabase secrets set ...):
//   TMDB_API_KEY  – TMDB v3 API key or v4 read access token (required)
//   OMDB_API_KEY  – OMDb key for IMDb / Rotten Tomatoes ratings (optional)
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.
//
// Every request must carry the shared passcode in the `x-passcode` header.
// POST body: { action: "search" | "details" | "discover" | "refresh", ... }

const TMDB_KEY = Deno.env.get("TMDB_API_KEY") ?? "";
const OMDB_KEY = Deno.env.get("OMDB_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-passcode",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MediaType = "movie" | "tv";

interface Provider {
  id: number;
  name: string;
  logo: string | null;
}
interface CountryProviders {
  link?: string;
  flatrate?: Provider[];
  free?: Provider[];
  ads?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
}

// deno-lint-ignore no-explicit-any
type Json = any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ───────────────────────── Supabase REST helpers ─────────────────────────

async function rest(path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, `Supabase ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const rpc = (fn: string, args: Record<string, unknown>) =>
  rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

async function getSettings(): Promise<{ countries: string[]; home_country: string }> {
  const rows = await rest("settings?select=countries,home_country&limit=1");
  return rows?.[0] ?? { countries: ["US"], home_country: "US" };
}

// ───────────────────────── TMDB ─────────────────────────

async function tmdb(path: string, params: Record<string, string> = {}): Promise<Json> {
  if (!TMDB_KEY) throw new HttpError(500, "TMDB_API_KEY is not configured");
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: "application/json" };
  // v4 read tokens are long JWTs; v3 keys are 32 hex chars.
  if (TMDB_KEY.length > 40) headers.Authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set("api_key", TMDB_KEY);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, `TMDB ${path}: ${res.status}`);
  return res.json();
}

const yearOf = (d?: string | null) => (d ? Number(d.slice(0, 4)) || null : null);

function summarize(r: Json, forcedType?: MediaType) {
  const media_type: MediaType = forcedType ?? r.media_type;
  const date = media_type === "movie" ? r.release_date : r.first_air_date;
  return {
    tmdb_id: r.id,
    media_type,
    title: r.title ?? r.name,
    year: yearOf(date),
    release_date: date || null,
    overview: r.overview ?? "",
    poster_path: r.poster_path ?? null,
    backdrop_path: r.backdrop_path ?? null,
    tmdb_rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
  };
}

function normalizeProviders(results: Json, countries: string[]): Record<string, CountryProviders> {
  const out: Record<string, CountryProviders> = {};
  const map = (list?: Json[]) =>
    list?.length
      ? list
        .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
        .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path ?? null }))
      : undefined;
  for (const cc of countries) {
    const r = results?.[cc];
    if (!r) continue;
    const entry: CountryProviders = {
      link: r.link,
      flatrate: map(r.flatrate),
      free: map(r.free),
      ads: map(r.ads),
      rent: map(r.rent),
      buy: map(r.buy),
    };
    for (const k of Object.keys(entry) as (keyof CountryProviders)[]) {
      if (entry[k] === undefined) delete entry[k];
    }
    out[cc] = entry;
  }
  return out;
}

async function omdbRatings(imdbId: string | null) {
  if (!OMDB_KEY) {
    console.warn("OMDB_API_KEY is not set; skipping IMDb/RT ratings");
    return { imdb_rating: null, rt_rating: null };
  }
  if (!imdbId) return { imdb_rating: null, rt_rating: null };
  try {
    const res = await fetch(
      `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(OMDB_KEY.trim())}`,
    );
    const d = await res.json().catch(() => ({ Response: "False", Error: `HTTP ${res.status}` }));
    if (d.Response === "False") console.warn(`OMDb lookup failed for ${imdbId}: ${d.Error}`);
    const imdb = Number(d.imdbRating);
    const rt = d.Ratings?.find((x: Json) => x.Source === "Rotten Tomatoes")?.Value;
    return {
      imdb_rating: Number.isFinite(imdb) ? imdb : null,
      rt_rating: rt ? parseInt(rt, 10) : null,
    };
  } catch {
    return { imdb_rating: null, rt_rating: null };
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * TMDB's number_of_seasons / number_of_episodes include announced seasons.
 * Count only what has aired, based on the last aired episode, and report the next season.
 */
function airedSeasons(d: Json) {
  const now = today();
  const list: Json[] = (d.seasons ?? []).filter((s: Json) => s.season_number > 0);
  const last = d.last_episode_to_air;
  let seasons = 0;
  let episodes = 0;
  if (last && last.season_number > 0) {
    seasons = last.season_number;
    episodes = list
      .filter((s) => s.season_number < last.season_number)
      .reduce((sum, s) => sum + (s.episode_count ?? 0), 0) + (last.episode_number ?? 0);
  } else if (last) {
    // Only specials have aired — fall back to seasons whose premiere is in the past.
    const aired = list.filter((s) => s.air_date && s.air_date <= now);
    seasons = aired.length;
    episodes = aired.reduce((sum, s) => sum + (s.episode_count ?? 0), 0);
  }
  const next = list
    .filter((s) => s.season_number > seasons)
    .sort((a, b) => a.season_number - b.season_number)[0];
  let next_season_date: string | null = next?.air_date || null;
  const ne = d.next_episode_to_air;
  if (next && ne && ne.season_number === next.season_number && ne.air_date) next_season_date = ne.air_date;
  return {
    seasons,
    episodes,
    next_season_number: next ? next.season_number : null,
    next_season_date,
  };
}

/** Earliest theatrical (premiere/limited/wide), else digital, else any release date per country. */
function releaseDatesByCountry(results: Json[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of results) {
    const dates: Json[] = r.release_dates ?? [];
    const earliest = (types: number[] | null) =>
      dates
        .filter((x) => !types || types.includes(x.type))
        .map((x) => String(x.release_date ?? "").slice(0, 10))
        .filter(Boolean)
        .sort()[0];
    const date = earliest([2, 3]) ?? earliest([4]) ?? earliest(null);
    if (date) out[r.iso_3166_1] = date;
  }
  return out;
}

async function details(media_type: MediaType, tmdb_id: number, countries: string[], home: string) {
  const extra = media_type === "movie" ? "release_dates" : "content_ratings";
  const d = await tmdb(`/${media_type}/${tmdb_id}`, {
    append_to_response: `watch/providers,external_ids,${extra}`,
  });

  const imdb_id: string | null = d.imdb_id ?? d.external_ids?.imdb_id ?? null;
  const ratings = await omdbRatings(imdb_id);

  let certification: string | null = null;
  let runtime_min: number | null = null;
  let release_date: string | null = null;
  let release_dates: Record<string, string> = {};
  let seasons: number | null = null;
  let episodes: number | null = null;
  let next_season_number: number | null = null;
  let next_season_date: string | null = null;

  if (media_type === "movie") {
    runtime_min = d.runtime || null;
    release_date = d.release_date || null;
    const rel = d.release_dates?.results ?? [];
    release_dates = releaseDatesByCountry(rel);
    const pick = rel.find((x: Json) => x.iso_3166_1 === home) ?? rel.find((x: Json) => x.iso_3166_1 === "US");
    certification = pick?.release_dates?.find((x: Json) => x.certification)?.certification ?? null;
    // Default (fallback) date: the home country's, when TMDB has one.
    if (release_dates[home]) release_date = release_dates[home];
  } else {
    runtime_min = d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || d.next_episode_to_air?.runtime ||
      null;
    release_date = d.first_air_date || null;
    const cr = d.content_ratings?.results ?? [];
    certification = (cr.find((x: Json) => x.iso_3166_1 === home) ?? cr.find((x: Json) => x.iso_3166_1 === "US"))
      ?.rating ?? null;
    ({ seasons, episodes, next_season_number, next_season_date } = airedSeasons(d));
  }

  return {
    tmdb_id: d.id,
    media_type,
    title: d.title ?? d.name,
    year: yearOf(release_date),
    overview: d.overview ?? "",
    tagline: d.tagline || null,
    poster_path: d.poster_path ?? null,
    backdrop_path: d.backdrop_path ?? null,
    genres: (d.genres ?? []).map((g: Json) => g.name),
    tmdb_rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    tmdb_votes: d.vote_count ?? null,
    imdb_id,
    ...ratings,
    certification,
    runtime_min,
    seasons,
    episodes,
    next_season_number,
    next_season_date,
    status_text: d.status ?? null,
    release_date,
    release_dates,
    next_episode_date: d.next_episode_to_air?.air_date ?? null,
    providers: normalizeProviders(d["watch/providers"]?.results, countries),
  };
}

// ───────────────────────── actions ─────────────────────────

async function handle(body: Json, passcode: string) {
  switch (body.action) {
    case "search": {
      const q = String(body.query ?? "").trim();
      if (!q) return { results: [] };
      const d = await tmdb("/search/multi", { query: q, include_adult: "false" });
      return {
        results: (d.results ?? [])
          .filter((r: Json) => r.media_type === "movie" || r.media_type === "tv")
          .map((r: Json) => summarize(r)),
      };
    }

    case "details": {
      const { countries, home_country } = await getSettings();
      return details(body.media_type, Number(body.tmdb_id), countries, home_country);
    }

    case "discover": {
      const region = /^[A-Za-z]{2}$/.test(body.region ?? "")
        ? String(body.region).toUpperCase()
        : (await getSettings()).home_country;
      const [upcoming, nowPlaying, onAir, trending] = await Promise.all([
        tmdb("/movie/upcoming", { region }),
        tmdb("/movie/now_playing", { region }),
        tmdb("/tv/on_the_air"),
        tmdb("/trending/all/week"),
      ]);
      const now = today();
      return {
        region,
        upcoming: (upcoming.results ?? [])
          .filter((r: Json) => (r.release_date ?? "") >= now)
          .sort((a: Json, b: Json) => a.release_date.localeCompare(b.release_date))
          .map((r: Json) => summarize(r, "movie")),
        now_playing: (nowPlaying.results ?? []).map((r: Json) => summarize(r, "movie")),
        on_the_air: (onAir.results ?? []).map((r: Json) => summarize(r, "tv")),
        trending: (trending.results ?? [])
          .filter((r: Json) => r.media_type === "movie" || r.media_type === "tv")
          .map((r: Json) => summarize(r)),
      };
    }

    case "refresh": {
      // Re-enrich titles whose metadata is older than `max_age_days` (default 7),
      // or a single title when `id` is given.
      const { countries, home_country } = await getSettings();
      const maxAge = Number(body.max_age_days ?? 7);
      const cutoff = new Date(Date.now() - maxAge * 86400_000).toISOString();
      const filter = body.id
        ? `id=eq.${encodeURIComponent(body.id)}`
        : `metadata_refreshed_at=lt.${encodeURIComponent(cutoff)}&order=metadata_refreshed_at.asc&limit=${
          Math.min(Number(body.limit ?? 40), 100)
        }`;
      const rows: { id: string; tmdb_id: number; media_type: MediaType }[] = await rest(
        `titles?select=id,tmdb_id,media_type&${filter}`,
      );
      let refreshed = 0;
      const errors: string[] = [];
      for (const row of rows) {
        try {
          const meta = await details(row.media_type, row.tmdb_id, countries, home_country);
          await rpc("refresh_title_metadata", { passcode, title_id: row.id, meta });
          refreshed++;
        } catch (e) {
          errors.push(`${row.media_type}/${row.tmdb_id}: ${(e as Error).message}`);
        }
      }
      return { refreshed, total: rows.length, errors };
    }

    default:
      throw new HttpError(400, `unknown action: ${body.action}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const passcode = req.headers.get("x-passcode") ?? "";
    const ok = await rpc("check_passcode", { passcode });
    if (ok !== true) return json({ error: "invalid passcode" }, 401);
    const body = await req.json().catch(() => ({}));
    return json(await handle(body, passcode));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error(e);
    return json({ error: (e as Error).message }, status);
  }
});
