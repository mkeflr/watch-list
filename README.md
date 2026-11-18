# Watchlist

A shared TV & movie watchlist that several people can edit. It works on phones and desktops, can be installed to a home screen as an app, and is hosted on GitHub Pages.

- **Add anything:** search TMDB, or browse *Coming soon to theaters*, *In theaters now*, *New episodes airing* and *Trending*.
- **Details fill in automatically:** poster, backdrop, description, genres, TMDB rating (plus IMDb and Rotten Tomatoes with an optional OMDb key), age rating, runtime, number of seasons and episodes, status, release date and next episode date.
- **Where to watch, by country:** stream, free, rent and buy options for each country you choose (e.g. 🇺🇸 🇬🇧 🇨🇦 🇦🇺), with your home country shown first. Data comes from JustWatch through TMDB.
- **Shared and live:** edits show up instantly for everyone. Each title tracks its status (want / watching / watched / dropped), priority, notes, who added it, and who has seen it.
- **🎲 Pick for me:** a random pick from your list, with filters for movie or TV, maximum length, *on my services* / *streaming in my countries*, and an option to include unreleased titles. Higher-priority titles are more likely to come up.
- **Shared passcode:** anyone with the link can see the app, but changing the list requires the passcode.

```
GitHub Pages (React + Vite PWA) ──► Supabase  ─ Postgres (titles, settings) + Realtime
                                              ─ RPC functions that check the passcode
                                              ─ Edge Function `tmdb` ──► TMDB API (+ OMDb)
```

## Setup (about 15 minutes)

### 1. Get the API keys
- **TMDB** (required, free): sign up at themoviedb.org, then go to *Settings → API* and copy the **API Read Access Token** or the API key.
- **OMDb** (optional, free tier): https://www.omdbapi.com/apikey.aspx. It adds IMDb and Rotten Tomatoes scores.

### 2. Create the Supabase project
1. Create a free project at https://supabase.com.
2. **Run the database migration.** Either paste `supabase/migrations/20261117000000_init.sql` into *SQL Editor* and run it, or use the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Set the shared passcode** in the SQL editor:
   ```sql
   select public.set_passcode('pick-a-good-passcode');
   ```
   Run the same command again later to change it. Everyone will then be asked for the new passcode.
4. **Deploy the edge function and set its secrets:**
   ```sh
   npx supabase secrets set TMDB_API_KEY=... OMDB_API_KEY=...   # OMDB is optional
   npx supabase functions deploy tmdb --no-verify-jwt
   ```
5. Copy the **Project URL** and the **anon / publishable key** from *Project Settings → API*.

### 3. Run locally (optional)
```sh
cd web
cp .env.example .env    # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 4. Host on GitHub Pages
1. Create a **public** repo and push this code. (Pages is free for public repos; a private repo needs GitHub Pro. Nothing secret is in the code.)
2. In *Settings → Secrets and variables → Actions*, add:
   - **Variables:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon key is fine to expose, because row-level security blocks direct writes.
   - **Secret:** `WATCHLIST_PASSCODE`, used by the daily refresh.
3. In *Settings → Pages*, set **Source** to **GitHub Actions**.
4. Each push to `main` runs **Deploy to GitHub Pages**, and the app is published at `https://<you>.github.io/watch-list/`.
5. **Refresh title metadata** runs every day at 06:00 UTC. It keeps season counts, next-episode dates, streaming availability and ratings up to date. You can also run it by hand from the *Actions* tab.

Database changes and the edge function aren't deployed by CI. Update them in the Supabase dashboard (SQL Editor / Edge Functions), or run `npx supabase db push` and `npx supabase functions deploy tmdb --no-verify-jwt`.

### 5. Install on phones
Open the URL, then on iOS tap *Share → Add to Home Screen*, or on Android tap *⋮ → Install app*.

## Using it
- **List:** use the tabs for To watch, Watching, Coming soon, Watched and All. *Filters* narrow by type, streaming service, genre and sort order.
- **Add:** search, or tap **+** on any title in the rails. Tap a poster to see the full details first.
- **Settings:**
  - your name (used for "added by" and "seen by")
  - **My streaming services**, which are saved per device and used by the filters and the picker
  - the shared **countries** list and home country (saving them refreshes all titles)
  - a manual refresh
  - lock this device

## Project layout
```
supabase/migrations/…_init.sql   tables, RLS, passcode-checked RPC functions, realtime
supabase/functions/tmdb/         edge function: search, details, discover, refresh
web/src/lib/                     supabase client + live store, edge-function API, helpers
web/src/pages/                   List, Discover, Settings
web/src/components/              TitleCard, TitleDetail, RandomPick, PasscodeGate, …
.github/workflows/                Pages build + daily metadata refresh
```

## Security notes
- Anyone with the URL can **read** the list. All writes go through `SECURITY DEFINER` functions that check a bcrypt-hashed passcode. The `app_secret` table can't be read through the API.
- The passcode is stored in each device's `localStorage`. Use **Settings → Lock this device** on shared computers.
- The TMDB and OMDb keys live only in Supabase secrets, and the edge function requires the passcode, so no one else can use up your API quota.

---
This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch.
