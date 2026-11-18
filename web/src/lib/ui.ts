import { PasscodeError } from './supabase';
import { session } from './session';

type Toast = { id: number; text: string; kind: 'info' | 'error' };
const bus = new EventTarget();
let nextId = 1;

export function toast(text: string, kind: Toast['kind'] = 'info') {
  bus.dispatchEvent(new CustomEvent<Toast>('toast', { detail: { id: nextId++, text, kind } }));
}

/** Central error handler: a rejected passcode re-locks the app. */
export function handleError(e: unknown) {
  if (e instanceof PasscodeError) {
    session.passcode = null;
    bus.dispatchEvent(new Event('locked'));
    toast('Passcode was rejected — please enter it again', 'error');
    return;
  }
  toast(e instanceof Error ? e.message : String(e), 'error');
}

export function onToast(fn: (t: Toast) => void) {
  const h = (e: Event) => fn((e as CustomEvent<Toast>).detail);
  bus.addEventListener('toast', h);
  return () => bus.removeEventListener('toast', h);
}
export function onLocked(fn: () => void) {
  bus.addEventListener('locked', fn);
  return () => bus.removeEventListener('locked', fn);
}
export type { Toast };
