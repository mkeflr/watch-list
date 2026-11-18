import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { detectCountry, session } from './session';
import type { Meta, Settings, Title } from './types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = configured
  ? createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false } })
  : (null as unknown as ReturnType<typeof createClient>);

export class PasscodeError extends Error {}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, { passcode: session.passcode ?? '', ...args });
  if (error) {
    if (/invalid passcode/i.test(error.message)) throw new PasscodeError('Passcode rejected');
    throw new Error(error.message);
  }
  return data as T;
}

export const db = {
  async checkPasscode(passcode: string) {
    const { data, error } = await supabase.rpc('check_passcode', { passcode });
    if (error) throw new Error(error.message);
    return data === true;
  },
  addTitle: (meta: Meta) => call<Title>('add_title', { meta, added_by: session.name }),
  updateTitle: (id: string, patch: Partial<Pick<Title, 'state' | 'priority' | 'notes' | 'watched_by'>>) =>
    call<Title>('update_title', { title_id: id, patch }),
  deleteTitle: (id: string) => call<void>('delete_title', { title_id: id }),
  updateSettings: (s: Settings) =>
    call<Settings>('update_settings', { countries: s.countries, home_country: s.home_country }),
};

// ───────────────────────── live data hook ─────────────────────────

type Listener = () => void;
const state = {
  titles: new Map<string, Title>(),
  settings: { countries: ['US'], home_country: 'US' } as Settings,
  loading: true,
  error: null as string | null,
  theaterCountry: session.theaterCountry ?? detectCountry(),
};
const listeners = new Set<Listener>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function upsertLocal(t: Title) {
  state.titles.set(t.id, t);
  emit();
}
export function removeLocal(id: string) {
  state.titles.delete(id);
  emit();
}
/** Per-device country for theater rows and movie release dates. */
export function setTheaterCountry(cc: string) {
  session.theaterCountry = cc;
  state.theaterCountry = cc;
  emit();
}

export function setSettingsLocal(s: Settings) {
  state.settings = s;
  emit();
}

let started = false;
async function load() {
  const [titles, settings] = await Promise.all([
    supabase.from('titles').select('*').order('added_at', { ascending: false }),
    supabase.from('settings').select('countries,home_country').limit(1).maybeSingle(),
  ]);
  if (titles.error) state.error = titles.error.message;
  else state.titles = new Map((titles.data as Title[]).map((t) => [t.id, t]));
  if (settings.data) state.settings = settings.data as Settings;
  state.loading = false;
  emit();
}

function start() {
  if (started || !configured) return;
  started = true;
  load();
  supabase
    .channel('watchlist')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'titles' }, (p) => {
      if (p.eventType === 'DELETE') removeLocal((p.old as Title).id);
      else upsertLocal(p.new as Title);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (p) => {
      if (p.new) setSettingsLocal({ countries: (p.new as Settings).countries, home_country: (p.new as Settings).home_country });
    })
    .subscribe((status) => {
      // Re-sync after reconnects (e.g. phone waking from sleep).
      if (status === 'SUBSCRIBED' && !state.loading) load();
    });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') load();
  });
}

export function useStore() {
  const [, setV] = useState(version);
  useEffect(() => {
    start();
    const l = () => setV(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    titles: [...state.titles.values()],
    settings: state.settings,
    loading: state.loading,
    error: state.error,
    theaterCountry: state.theaterCountry ?? state.settings.home_country,
    reload: load,
  };
}
