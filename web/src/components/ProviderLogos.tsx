import { img, providerIn } from '../lib/format';
import type { Provider } from '../lib/types';

export default function ProviderLogos({ providers, max = 4, mine }: { providers: Provider[]; max?: number; mine?: Set<number> }) {
  if (!providers.length) return null;
  const sorted = mine ? [...providers].sort((a, b) => Number(providerIn(b, mine)) - Number(providerIn(a, mine))) : providers;
  const shown = sorted.slice(0, max);
  const extra = providers.length - shown.length;
  return (
    <span className="logos">
      {shown.map((p) => (
        <img key={p.id} src={img(p.logo, 'w92') ?? ''} alt={p.name} title={p.name} className={mine && providerIn(p, mine) ? 'mine' : ''} />
      ))}
      {extra > 0 && <span className="more">+{extra}</span>}
    </span>
  );
}
