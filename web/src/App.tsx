import { useCallback, useEffect, useState } from 'react';
import PasscodeGate from './components/PasscodeGate';
import RandomPick from './components/RandomPick';
import TitleDetail from './components/TitleDetail';
import { session } from './lib/session';
import { configured, useStore } from './lib/supabase';
import type { MediaType, Title } from './lib/types';
import { onLocked, onToast, type Toast } from './lib/ui';
import Discover from './pages/Discover';
import List from './pages/List';
import Settings from './pages/Settings';

type Page = 'list' | 'discover' | 'settings';
const PAGES: [Page, string, string][] = [
  ['list', 'List', '☰'],
  ['discover', 'Add', '＋'],
  ['settings', 'Settings', '⚙'],
];

const pageFromHash = (): Page => {
  const h = location.hash.slice(1);
  return h === 'discover' || h === 'settings' ? h : 'list';
};

export default function App() {
  const [unlocked, setUnlocked] = useState(Boolean(session.passcode));
  useEffect(() => onLocked(() => setUnlocked(false)), []);

  if (!configured) return <SetupNeeded />;
  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />;
  return <Main onLock={() => setUnlocked(false)} />;
}

function Main({ onLock }: { onLock: () => void }) {
  const { titles, settings, loading, error } = useStore();
  const [page, setPageState] = useState<Page>(pageFromHash);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ media_type: MediaType; tmdb_id: number } | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const h = () => setPageState(pageFromHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const setPage = (p: Page) => {
    location.hash = p === 'list' ? '' : p;
    setPageState(p);
  };

  const open = useCallback((t: Title) => {
    setPicking(false);
    setPreview(null);
    setOpenId(t.id);
  }, []);
  const closeDetail = useCallback(() => {
    setOpenId(null);
    setPreview(null);
  }, []);

  const openTitle = openId ? titles.find((t) => t.id === openId) : undefined;
  const existingForPreview = preview ? titles.find((t) => t.tmdb_id === preview.tmdb_id && t.media_type === preview.media_type) : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => setPage('list')}>
          <img src="icon.svg" alt="" width={28} height={28} /> <span>Watchlist</span>
        </div>
        <nav className="topnav">
          {PAGES.map(([p, label]) => (
            <button key={p} className={page === p ? 'on' : ''} onClick={() => setPage(p)}>{label}</button>
          ))}
        </nav>
        <button className="btn primary pick-btn" onClick={() => setPicking(true)}>🎲 <span>Pick for me</span></button>
      </header>

      <main>
        {error && <p className="error">Couldn’t load the list: {error}</p>}
        {page === 'list' && <List titles={titles} settings={settings} loading={loading} onOpen={open} onDiscover={() => setPage('discover')} />}
        {page === 'discover' && <Discover titles={titles} onPreview={setPreview} />}
        {page === 'settings' && <Settings titles={titles} settings={settings} onLock={onLock} />}
      </main>

      <nav className="bottomnav">
        {PAGES.slice(0, 2).map(([p, label, icon]) => (
          <button key={p} className={page === p ? 'on' : ''} onClick={() => setPage(p)}>
            <span className="icon">{icon}</span>{label}
          </button>
        ))}
        <button className="dice" onClick={() => setPicking(true)} aria-label="Pick something random">🎲</button>
        {PAGES.slice(2).map(([p, label, icon]) => (
          <button key={p} className={page === p ? 'on' : ''} onClick={() => setPage(p)}>
            <span className="icon">{icon}</span>{label}
          </button>
        ))}
      </nav>

      {picking && <RandomPick titles={titles} settings={settings} onClose={() => setPicking(false)} onOpen={open} />}
      {(openTitle || preview) && (
        <TitleDetail
          key={openTitle?.id ?? `${preview!.media_type}:${preview!.tmdb_id}`}
          title={openTitle}
          preview={openTitle ? undefined : preview!}
          existing={existingForPreview}
          settings={settings}
          onClose={closeDetail}
        />
      )}
      <Toasts />
    </div>
  );
}

function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(
    () =>
      onToast((t) => {
        setItems((i) => [...i, t]);
        window.setTimeout(() => setItems((i) => i.filter((x) => x.id !== t.id)), 3500);
      }),
    [],
  );
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}

function SetupNeeded() {
  return (
    <div className="gate">
      <div className="gate-card">
        <h1>Almost there</h1>
        <p className="muted">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (in <code>web/.env</code> locally, or as GitHub Actions
          variables) and rebuild. See the README for full setup.
        </p>
      </div>
    </div>
  );
}
