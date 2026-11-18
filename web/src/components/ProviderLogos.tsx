import { img } from '../lib/format';
import type { Provider } from '../lib/types';

export default function ProviderLogos({ providers, max = 4, mine }: { providers: Provider[]; max?: number; mine?: Set<number> }) {
  if (!providers.length) return null;
  const sorted = mine ? [...providers].sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id))) : providers;
  const shown = sorted.slice(0, max);
  const extra = providers.length - shown.length;
  return (
    <span className="logos">
      {shown.map((p) => (
        <img key={p.id} src={img(p.logo, 'w92') ?? ''} alt={p.name} title={p.name} className={mine?.has(p.id) ? 'mine' : ''} />
      ))}
      {extra > 0 && <span className="more">+{extra}</span>}
    </span>
  );
}
