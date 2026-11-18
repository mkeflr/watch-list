import type { ReactNode } from 'react';

/** Horizontally scrolling row of cards with a heading. Renders nothing when empty. */
export default function Rail<T>({ title, items, render, action }: {
  title: ReactNode;
  items: T[];
  render: (item: T) => ReactNode;
  action?: ReactNode;
}) {
  if (!items.length) return null;
  return (
    <section className="rail">
      <div className="rail-head">
        <h2 className="rail-title">{title}</h2>
        {action}
      </div>
      <div className="rail-scroll">{items.map(render)}</div>
    </section>
  );
}
