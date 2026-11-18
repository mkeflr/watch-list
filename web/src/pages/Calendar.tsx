import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { calendarEvents, countryName, daysUntil, flag, img, todayIso, type CalendarEvent } from '../lib/format';
import type { Title } from '../lib/types';
import { toast } from '../lib/ui';

interface Props {
  titles: Title[];
  theaterCountry: string;
  onOpen: (t: Title) => void;
}

const DAYS_AHEAD = 120;
const KIND_ICON: Record<CalendarEvent['kind'], string> = { release: '🎬', premiere: '🆕', episode: '📺' };

function dayLabel(iso: string) {
  const n = daysUntil(iso) ?? 0;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const md = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return n === 0 ? `Today · ${md}` : n === 1 ? `Tomorrow · ${md}` : `${weekday} · ${md}`;
}

export default function Calendar({ titles, theaterCountry, onOpen }: Props) {
  const [showSub, setShowSub] = useState(false);
  const today = todayIso();

  const events = useMemo(() => {
    const until = new Date(Date.now() + DAYS_AHEAD * 86400000).toISOString().slice(0, 10);
    return calendarEvents(titles, theaterCountry, today).filter((e) => e.date <= until);
  }, [titles, theaterCountry, today]);

  // Group: month → day → events
  const months = useMemo(() => {
    const out: { month: string; days: { date: string; events: CalendarEvent[] }[] }[] = [];
    for (const ev of events) {
      const [y, m] = ev.date.split('-').map(Number);
      const month = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      let mo = out[out.length - 1];
      if (!mo || mo.month !== month) out.push((mo = { month, days: [] }));
      let day = mo.days[mo.days.length - 1];
      if (!day || day.date !== ev.date) mo.days.push((day = { date: ev.date, events: [] }));
      day.events.push(ev);
    }
    return out;
  }, [events]);

  const thisWeek = events.filter((e) => (daysUntil(e.date) ?? 99) < 7).length;
  const feed = api.calendarUrl(theaterCountry);
  const webcal = feed.replace(/^https?:/, 'webcal:');

  async function copy() {
    try {
      await navigator.clipboard.writeText(feed);
      toast('Calendar link copied');
    } catch {
      prompt('Copy this calendar link:', feed);
    }
  }

  return (
    <div className="page calendar">
      <div className="cal-head">
        <div>
          <h2>Release calendar</h2>
          <p className="muted small">
            {thisWeek ? `${thisWeek} thing${thisWeek === 1 ? '' : 's'} this week · ` : ''}Next {DAYS_AHEAD} days · movie dates for{' '}
            {flag(theaterCountry)} {countryName(theaterCountry)}
          </p>
        </div>
        <button className={`btn ${showSub ? 'on' : ''}`} onClick={() => setShowSub((v) => !v)} aria-expanded={showSub}>
          📅 Subscribe
        </button>
      </div>

      {showSub && (
        <div className="subscribe">
          <p>Add these dates to your phone or computer calendar. It updates automatically.</p>
          <div className="row">
            <a className="btn primary" href={webcal}>Open in Apple Calendar</a>
            <button className="btn" onClick={copy}>Copy link</button>
          </div>
          <p className="muted small">
            Google Calendar: on a computer, go to calendar.google.com → “Other calendars” <b>+</b> → “From URL”, and paste the link.
          </p>
        </div>
      )}

      {months.length === 0 ? (
        <p className="empty muted">Nothing coming up for titles on your list. Upcoming movies and shows you add will appear here.</p>
      ) : (
        months.map((mo) => (
          <section key={mo.month} className="cal-month">
            <h3 className="cal-month-title">{mo.month}</h3>
            {mo.days.map((day) => (
              <div key={day.date} className={`cal-day ${day.date === today ? 'today' : ''}`}>
                <div className="cal-date">{dayLabel(day.date)}</div>
                <div className="cal-events">
                  {day.events.map((ev) => (
                    <button key={ev.key} className="cal-event" onClick={() => onOpen(ev.title)}>
                      {img(ev.title.poster_path, 'w92') ? (
                        <img src={img(ev.title.poster_path, 'w92')!} alt="" loading="lazy" />
                      ) : (
                        <span className="cal-thumb" />
                      )}
                      <span className="cal-text">
                        <b>{ev.title.title}</b>
                        <span className="muted small">
                          {KIND_ICON[ev.kind]} {ev.label}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
