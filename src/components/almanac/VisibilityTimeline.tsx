import React, { useState } from 'react';
import { OperationalWindow } from '../../types';
import { formatDate, duration } from '../../utils/almanac';

export function VisibilityTimeline({ windows, date, onSelectDate, expanded = false }: {
  windows: OperationalWindow[]; date: Date; onSelectDate: (date: Date) => void; expanded?: boolean;
}) {
  const [hovered, setHovered] = useState<OperationalWindow | null>(null);
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  const todayPercent = (today - date.getTime()) / (30 * 86400000) * 100;
  const inWindow = todayPercent >= 0 && todayPercent <= 100;
  return <section className={`visibility-timeline ${expanded ? 'timeline-expanded' : ''}`} aria-label="Visibility over the next 30 days">
    <div className="section-heading"><h2>{expanded ? 'The next 30 days' : 'A month at a glance'}</h2><span className="muted">{formatDate(date)} — {formatDate(new Date(date.getTime() + 30 * 86400000))} · UTC</span></div>
    <p className="timeline-hint">{expanded ? 'Point to or focus a stretch for its dates and duration. Select it to move to its start.' : 'Sunlight and a clear view of Earth, with the selected terrain.'}</p>
    <div className="timeline-plot">
      {(['sun', 'earth'] as const).map(body => <div className="timeline-row" key={body}>
        <span className="band-name">{body === 'sun' ? 'Sun up' : 'Earth visible'}</span>
        <div className="timeline-band">
          {windows.filter(w => body === 'sun' ? ['sunlight', 'solar_shadow'].includes(w.type) : ['earth_los', 'comm_blackout'].includes(w.type)).map((w, index) => {
            const up = w.type === 'sunlight' || w.type === 'earth_los';
            const text = `${body === 'sun' ? 'Sun' : 'Earth'} ${up ? 'visible' : 'hidden'}: ${formatDate(new Date(w.startIso))} to ${formatDate(new Date(w.endIso))}, ${duration(w.durationHours)}`;
            return <button key={index} type="button" className={`timeline-segment ${up ? body : 'blocked'}`}
              style={{ left: `${w.startDay / 30 * 100}%`, width: `${(w.endDay - w.startDay) / 30 * 100}%` }}
              aria-label={text} title={text} onMouseEnter={() => setHovered(w)} onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(w)} onBlur={() => setHovered(null)} onClick={() => onSelectDate(new Date(w.startIso))} />;
          })}
          {inWindow && <span className="today-line" style={{ left: `${todayPercent}%` }} aria-label="Today in UTC" />}
        </div>
      </div>)}
      <div className="timeline-axis"><span />{[0, 5, 10, 15, 20, 25, 30].map(day => <span key={day}>{formatDate(new Date(date.getTime() + day * 86400000)).replace(' 2026', '').replace(/ \d{4}$/, '')}</span>)}</div>
    </div>
    <div className="timeline-caption" aria-live="polite">{hovered
      ? `${hovered.type === 'sunlight' || hovered.type === 'earth_los' ? 'Visible' : 'Hidden'} · ${formatDate(new Date(hovered.startIso))} — ${formatDate(new Date(hovered.endIso))} · ${duration(hovered.durationHours)}`
      : `${inWindow ? 'The thin marker shows today in UTC.' : 'Today is outside this window.'} Amber / blue: visible. Red: hidden.`}</div>
    {expanded && <div className="timeline-window-list"><h3>Stretches of visibility</h3>
      <div className="table-scroll"><table><thead><tr><th>Body</th><th>From (UTC)</th><th>Until (UTC)</th><th>Duration</th></tr></thead>
        <tbody>{windows.filter(w => w.type === 'sunlight' || w.type === 'earth_los').map((w, i) => <tr key={i}>
          <td>{w.type === 'sunlight' ? 'Sun' : 'Earth'}</td><td>{formatDate(new Date(w.startIso))}</td><td>{formatDate(new Date(w.endIso))}</td><td className="mono">{duration(w.durationHours)}</td>
        </tr>)}</tbody></table></div>
    </div>}
  </section>;
}
