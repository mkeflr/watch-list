// Per-device preferences, stored in localStorage (wrapped: storage may be unavailable).

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Country from the browser's language settings, e.g. en-GB → GB. */
export function detectCountry(): string | null {
  try {
    for (const lang of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(lang).maximize().region;
      if (region && /^[A-Z]{2}$/.test(region)) return region;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const session = {
  get passcode() {
    return read<string | null>('wl.passcode', null);
  },
  set passcode(v: string | null) {
    write('wl.passcode', v);
  },
  get name() {
    return read<string>('wl.name', '');
  },
  set name(v: string) {
    write('wl.name', v);
  },
  /** Country used for theater rows and movie release dates on this device. */
  get theaterCountry() {
    return read<string | null>('wl.theater', null);
  },
  set theaterCountry(v: string | null) {
    write('wl.theater', v);
  },
  /** Provider ids this person subscribes to. */
  get myServices() {
    return read<number[]>('wl.services', []);
  },
  set myServices(v: number[]) {
    write('wl.services', v);
  },
};
