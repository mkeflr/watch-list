import { img } from '../lib/format';

export default function Poster({ path, title, size = 'w342' }: { path: string | null; title: string; size?: 'w185' | 'w342' | 'w780' }) {
  const src = img(path, size);
  return src ? (
    <img className="poster" src={src} alt={title} loading="lazy" />
  ) : (
    <div className="poster placeholder" aria-label={title}>
      <span>{title}</span>
    </div>
  );
}
