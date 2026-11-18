import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { COMMON_COUNTRIES, countryName, flag, img, mergeProviders, providerIn, streamingProviders } from '../lib/format';
import { session } from '../lib/session';
import { db, setSettingsLocal, setTheaterCountry } from '../lib/supabase';
import type { Provider, Settings as S, Title } from '../lib/types';
import { handleError, toast } from '../lib/ui';

interface Props {
  titles: Title[];
  settings: S;
  theaterCountry: string;
  onLock: () => void;
}

export default function Settings({ titles, settings, theaterCountry, onLock }: Props) {
  const [name, setName] = useState(session.name);
  const [countries, setCountries] = useState(settings.countries);
  const [home, setHome] = useState(settings.home_country);
  const [extra, setExtra] = useState('');
  const [mine, setMine] = useState(new Set(session.myServices));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCountries(settings.countries);
    setHome(settings.home_country);
  }, [settings]);

  // Every streaming service seen on the list, across the configured countries.
  const providers = useMemo(() => {
    const all: Provider[] = [];
    for (const t of titles) for (const cc of settings.countries) all.push(...streamingProviders(t.providers?.[cc]));
    return mergeProviders(all).sort((a, b) => a.name.localeCompare(b.name));
  }, [titles, settings.countries]);

  const options = [...new Set([...COMMON_COUNTRIES, ...countries])];
  const dirty = home !== settings.home_country || countries.join() !== settings.countries.join();

  function toggleCountry(cc: string) {
    setCountries((c) => (c.includes(cc) ? c.filter((x) => x !== cc) : [...c, cc]));
  }

  async function saveCountries() {
    setBusy(true);
    try {
      const s = await db.updateSettings({ countries, home_country: home });
      setSettingsLocal({ countries: s.countries, home_country: s.home_country });
      toast('Countries saved. Refreshing streaming info…');
      const r = await api.refresh({ max_age_days: 0, limit: 100 });
      toast(`Updated ${r.refreshed} of ${r.total} titles`);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAll() {
    setBusy(true);
    try {
      const r = await api.refresh({ max_age_days: 0, limit: 100 });
      toast(`Updated ${r.refreshed} of ${r.total} titles${r.errors.length ? ` (${r.errors.length} failed)` : ''}`);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  function toggleService(p: Provider) {
    const n = new Set(mine);
    const ids = p.ids ?? [p.id];
    if (providerIn(p, n)) ids.forEach((id) => n.delete(id));
    else ids.forEach((id) => n.add(id));
    setMine(n);
    session.myServices = [...n];
  }

  return (
    <div className="page settings">
      <section>
        <h2>You</h2>
        <label>
          Display name (shown as “added by” / “seen by”)
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => (session.name = name.trim())} />
        </label>
      </section>

      <section>
        <h2>My streaming services</h2>
        <p className="muted small">Saved on this device. Used by the “My services” filter and the random picker.</p>
        {providers.length === 0 ? (
          <p className="muted">Add some titles first — services show up here as they’re found.</p>
        ) : (
          <div className="service-grid">
            {providers.map((p) => (
              <button key={p.id} className={`service ${providerIn(p, mine) ? 'on' : ''}`} onClick={() => toggleService(p)} aria-pressed={providerIn(p, mine)}>
                {p.logo && <img src={img(p.logo, 'w92') ?? ''} alt="" />}
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Theater country</h2>
        <p className="muted small">Saved on this device. Used for “Coming soon / In theaters” and movie release dates.</p>
        <label className="inline">
          Theaters in
          <select value={theaterCountry} onChange={(e) => setTheaterCountry(e.target.value)}>
            {[...new Set([theaterCountry, ...settings.countries, ...COMMON_COUNTRIES])]
              .sort((a, b) => countryName(a).localeCompare(countryName(b)))
              .map((cc) => (
                <option key={cc} value={cc}>{flag(cc)} {countryName(cc)}</option>
              ))}
          </select>
        </label>
      </section>

      <section>
        <h2>Countries to check</h2>
        <p className="muted small">Shared with everyone. Streaming availability is looked up in each of these.</p>
        <div className="country-grid">
          {options.map((cc) => (
            <label key={cc} className={`country-opt ${countries.includes(cc) ? 'on' : ''}`}>
              <input type="checkbox" checked={countries.includes(cc)} onChange={() => toggleCountry(cc)} />
              {flag(cc)} {countryName(cc)}
            </label>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const cc = extra.trim().toUpperCase();
            if (/^[A-Z]{2}$/.test(cc) && !countries.includes(cc)) setCountries([...countries, cc]);
            setExtra('');
          }}
        >
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Other country code (e.g. ZA)" maxLength={2} />
          <button className="btn">Add</button>
        </form>
        <label className="inline">
          Home country
          <select value={home} onChange={(e) => setHome(e.target.value)}>
            {countries.map((cc) => (
              <option key={cc} value={cc}>{flag(cc)} {countryName(cc)}</option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button className="btn primary" disabled={!dirty || busy || !countries.length} onClick={saveCountries}>Save countries</button>
        </div>
      </section>

      <section>
        <h2>Data</h2>
        <div className="actions">
          <button className="btn" onClick={refreshAll} disabled={busy}>↻ Refresh all details now</button>
          <button className="btn danger" onClick={() => { session.passcode = null; onLock(); }}>Lock this device</button>
        </div>
      </section>

      <footer className="attribution muted small">
        <p>Metadata and images from <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data provided by JustWatch.</p>
      </footer>
    </div>
  );
}
