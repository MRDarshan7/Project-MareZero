import React, { useState } from 'react';
import { OperationalWindow, LandingSite } from '../../types';
import { HorizonManager } from '../../terrain/horizon';
import { EphemerisEngine } from '../../ephemeris/engine';
import { formatDate, duration } from '../../utils/almanac';

export function VisibilityTimeline({
  windows,
  date,
  activeDate,
  missionDay = 0,
  onSelectDate,
  onScrub,
  site,
  horizon,
  expanded = false
}: {
  windows: OperationalWindow[];
  date: Date;
  activeDate?: Date;
  missionDay?: number;
  onSelectDate: (date: Date) => void;
  onScrub?: (day: number) => void;
  site?: LandingSite;
  horizon?: HorizonManager;
  expanded?: boolean;
}) {
  const [hovered, setHovered] = useState<OperationalWindow | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverData, setHoverData] = useState<{
    fraction: number;
    date: Date;
    sun: { el: number; clearance: number; isBlocked: boolean };
    earth: { el: number; clearance: number; isBlocked: boolean };
    clientX: number;
    clientY: number;
  } | null>(null);

  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  const todayPercent = (today - date.getTime()) / (30 * 86400000) * 100;
  const inWindow = todayPercent >= 0 && todayPercent <= 100;

  const currentActiveDay = activeDate
    ? Math.max(0, Math.min(30, (activeDate.getTime() - date.getTime()) / 86400000))
    : missionDay;
  const activePercent = (currentActiveDay / 30) * 100;

  const updateScrub = (e: React.PointerEvent) => {
    const target = e.currentTarget.getBoundingClientRect();
    if (!target.width) return;
    const fraction = Math.max(0, Math.min(1, (e.clientX - target.left) / target.width));
    onScrub?.(fraction * 30);
  };

  const updateHover = (e: React.PointerEvent) => {
    const target = e.currentTarget.getBoundingClientRect();
    if (!target.width) return;
    const fraction = Math.max(0, Math.min(1, (e.clientX - target.left) / target.width));
    const hoverDate = new Date(date.getTime() + fraction * 30 * 86400000);
    if (site && horizon) {
      const pos = EphemerisEngine.calculatePosition(site, hoverDate, horizon);
      setHoverData({
        fraction,
        date: hoverDate,
        sun: { el: pos.sun.el, clearance: pos.sun.el - pos.sun.horizonElevation, isBlocked: pos.sun.isBlocked },
        earth: { el: pos.earth.el, clearance: pos.earth.el - pos.earth.horizonElevation, isBlocked: pos.earth.isBlocked },
        clientX: e.clientX,
        clientY: e.clientY
      });
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    updateScrub(e);
    updateHover(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      updateScrub(e);
    }
    updateHover(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    }
  };

  const handlePointerLeave = () => {
    if (!isDragging) setHoverData(null);
  };

  return <section className={`visibility-timeline ${expanded ? 'timeline-expanded' : ''}`} aria-label="Visibility over the next 30 days">
    <div className="section-heading">
      <h2>{expanded ? 'The next 30 days' : 'A month at a glance'}</h2>
      <span className="muted">{formatDate(date)} — {formatDate(new Date(date.getTime() + 30 * 86400000))} · UTC</span>
    </div>
    <p className="timeline-hint">
      {expanded
        ? 'Point to or focus a stretch for its dates and duration. Select it to move to its start.'
        : 'Drag or click anywhere along the bands to scrub the 30-day mission timeline live. Hover to inspect topocentric clearance.'}
    </p>
    <div className="timeline-plot">
      {(['sun', 'earth'] as const).map(body => <div className="timeline-row" key={body}>
        <span className="band-name">{body === 'sun' ? 'Sun up' : 'Earth visible'}</span>
        <div
          className="timeline-band interactive-timeline-band"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          {windows.filter(w => body === 'sun' ? ['sunlight', 'solar_shadow'].includes(w.type) : ['earth_los', 'comm_blackout'].includes(w.type)).map((w, index) => {
            const up = w.type === 'sunlight' || w.type === 'earth_los';
            const text = `${body === 'sun' ? 'Sun' : 'Earth'} ${up ? 'visible' : 'hidden'}: ${formatDate(new Date(w.startIso))} to ${formatDate(new Date(w.endIso))}, ${duration(w.durationHours)}`;
            return <button key={index} type="button" className={`timeline-segment ${up ? body : 'blocked'}`}
              style={{ left: `${w.startDay / 30 * 100}%`, width: `${(w.endDay - w.startDay) / 30 * 100}%` }}
              aria-label={text} title={text} onMouseEnter={() => setHovered(w)} onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(w)} onBlur={() => setHovered(null)} onClick={(e) => { e.stopPropagation(); onSelectDate(new Date(w.startIso)); }} />;
          })}
          {inWindow && <span className="today-line" style={{ left: `${todayPercent}%` }} aria-label="Today in UTC" title="Today in UTC" />}
          {/* Active mission scrubber indicator needle */}
          <div
            className="timeline-scrubber"
            style={{ left: `${Math.max(0, Math.min(100, activePercent))}%` }}
            aria-label={`Active mission time: Day ${currentActiveDay.toFixed(1)}`}
          >
            <div className="scrubber-head" />
            <div className="scrubber-stem" />
          </div>
          {/* Hover guideline */}
          {hoverData && (
            <div
              className="timeline-hover-guide"
              style={{ left: `${hoverData.fraction * 100}%` }}
            />
          )}
        </div>
      </div>)}
      <div className="timeline-axis">
        <span />
        {[0, 5, 10, 15, 20, 25, 30].map(day => <span key={day}>{formatDate(new Date(date.getTime() + day * 86400000)).replace(' 2026', '').replace(/ \d{4}$/, '')}</span>)}
      </div>
    </div>
    <div className="timeline-caption" aria-live="polite">{hovered
      ? `${hovered.type === 'sunlight' || hovered.type === 'earth_los' ? 'Visible' : 'Hidden'} · ${formatDate(new Date(hovered.startIso))} — ${formatDate(new Date(hovered.endIso))} · ${duration(hovered.durationHours)}`
      : `${inWindow ? 'The thin bone marker shows today in UTC. ' : ''}Amber / blue: visible. Red: hidden. Gold needle marks active scrubbed epoch.`}</div>
    {expanded && <div className="timeline-window-list"><h3>Stretches of visibility</h3>
      <div className="table-scroll"><table><thead><tr><th>Body</th><th>From (UTC)</th><th>Until (UTC)</th><th>Duration</th></tr></thead>
        <tbody>{windows.filter(w => w.type === 'sunlight' || w.type === 'earth_los').map((w, i) => <tr key={i}>
          <td>{w.type === 'sunlight' ? 'Sun' : 'Earth'}</td><td>{formatDate(new Date(w.startIso))}</td><td>{formatDate(new Date(w.endIso))}</td><td className="mono">{duration(w.durationHours)}</td>
        </tr>)}</tbody></table></div>
    </div>}
    {hoverData && (
      <div
        className="timeline-floating-tooltip floating-dark-popover mono"
        style={{
          left: `${Math.min(window.innerWidth - 320, Math.max(16, hoverData.clientX - 140))}px`,
          top: `${Math.max(16, hoverData.clientY - 95)}px`
        }}
        role="tooltip"
      >
        <div className="tooltip-title">{hoverData.date.toISOString().slice(0, 10)} {hoverData.date.toISOString().slice(11, 16)} UTC (Day {(hoverData.fraction * 30).toFixed(1)})</div>
        <div className="tooltip-row">
          <span className="sun-text">Sun:</span>
          <span>{hoverData.sun.el >= 0 ? '+' : ''}{hoverData.sun.el.toFixed(1)}° el · clearance: {hoverData.sun.clearance >= 0 ? '+' : ''}{hoverData.sun.clearance.toFixed(1)}° · {hoverData.sun.isBlocked ? 'Blocked (Shadow)' : 'Visible (Sunlight)'}</span>
        </div>
        <div className="tooltip-row">
          <span className="earth-text">Earth:</span>
          <span>{hoverData.earth.el >= 0 ? '+' : ''}{hoverData.earth.el.toFixed(1)}° el · clearance: {hoverData.earth.clearance >= 0 ? '+' : ''}{hoverData.earth.clearance.toFixed(1)}° · {hoverData.earth.isBlocked ? 'Blocked (Blackout)' : 'Visible (LOS)'}</span>
        </div>
      </div>
    )}
  </section>;
}
