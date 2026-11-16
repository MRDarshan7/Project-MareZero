import React, { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { EphemerisSample } from '../../types';
import { TopocentricResult } from '../../ephemeris/engine';
import { HorizonManager } from '../../terrain/horizon';

interface Props {
  position: TopocentricResult;
  horizon: HorizonManager;
  trail: EphemerisSample[];
  siteName: string;
  compact?: boolean;
}

export const HorizonPanorama = forwardRef<SVGSVGElement, Props>(({ position, horizon, trail, siteName, compact = false }, ref) => {
  const id = useId().replace(/:/g, '');
  const scrollContainer = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);
  const [visibleRange, setVisibleRange] = useState({ left: 0, right: 1200 });
  const width = compact ? 800 : 1200, height = compact ? 360 : 300;
  const left = 52, right = width - 40, top = 34, bottom = height - 62;

  const profile = useMemo(() => horizon.getProfile(), [horizon]);
  const elevations = useMemo(() => trail.flatMap(s => [s.sun.el, s.earth.el]), [trail]);
  const { low, high } = useMemo(() => {
    const l = Math.min(-3, Math.floor(Math.min(position.sun.el, position.earth.el, ...elevations, ...profile) - 3));
    const h = Math.max(15, Math.ceil(Math.max(position.sun.el, position.earth.el, ...elevations, ...profile) + 4));
    return { low: l, high: h };
  }, [position.sun.el, position.earth.el, elevations, profile]);

  const x = useCallback((az: number) => left + (az / 360) * (right - left), [left, right]);
  const y = useCallback((el: number) => bottom - ((el - low) / (high - low)) * (bottom - top), [bottom, low, high, top]);
  const exaggeration = ((bottom - top) / (high - low)) / ((right - left) / 360);

  const updateVisibleRange = useCallback(() => {
    const container = scrollContainer.current;
    if (!container || !container.scrollWidth || !container.clientWidth) return;
    const factor = container.scrollWidth / width;
    const newLeft = container.scrollLeft / factor;
    const newRight = (container.scrollLeft + container.clientWidth) / factor;
    setVisibleRange(prev => {
      if (Math.abs(prev.left - newLeft) < 1 && Math.abs(prev.right - newRight) < 1) return prev;
      return { left: newLeft, right: newRight };
    });
  }, [width]);

  const handleScroll = useCallback(() => {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      updateVisibleRange();
    });
  }, [updateVisibleRange]);

  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  useEffect(() => {
    const container = scrollContainer.current;
    if (!container) return;
    const recenter = () => {
      if (container.scrollWidth > container.clientWidth) {
        const factor = container.scrollWidth / width;
        const centre = Math.abs(position.sun.az - position.earth.az) <= 180
          ? (x(position.sun.az) + x(position.earth.az)) / 2 : x(position.sun.az);
        container.scrollLeft = centre * factor - container.clientWidth / 2;
      }
      updateVisibleRange();
    };
    recenter();
    const resize = new ResizeObserver(recenter);
    resize.observe(container);
    return () => resize.disconnect();
  }, [position.sun.az, position.earth.az, compact, width, x, updateVisibleRange]);

  const terrain = useMemo(() => {
    return profile.map((el, i) => `${x(i)},${y(el)}`).join(' ') + ` ${x(360)},${y(profile[0])}`;
  }, [profile, x, y]);

  const ticks = useMemo(() => Array.from({ length: 5 }, (_, i) => low + ((high - low) * i) / 4), [low, high]);

  const sunPath = useMemo(() => trail.map((s, i) => {
    const previous = trail[i - 1];
    const jump = previous && Math.abs(s.sun.az - previous.sun.az) > 180;
    return `${i === 0 || jump ? 'M' : 'L'}${x(s.sun.az)},${y(s.sun.el)}`;
  }).join(' '), [trail, x, y]);

  const earthPath = useMemo(() => trail.map((s, i) => {
    const previous = trail[i - 1];
    const jump = previous && Math.abs(s.earth.az - previous.earth.az) > 180;
    return `${i === 0 || jump ? 'M' : 'L'}${x(s.earth.az)},${y(s.earth.el)}`;
  }).join(' '), [trail, x, y]);

  const paths = { sun: sunPath, earth: earthPath };

  const summary = `${siteName}. Sun ${position.sun.el.toFixed(1)} degrees above the flat horizon, direction ${position.sun.az.toFixed(1)} degrees, ${position.sun.isBlocked ? 'hidden' : 'visible'}. Earth ${position.earth.el.toFixed(1)} degrees, direction ${position.earth.az.toFixed(1)} degrees, ${position.earth.isBlocked ? 'hidden' : 'visible'}. Terrain shown is the selected profile.`;
  return <div ref={scrollContainer} className="panorama-scroll" onScroll={handleScroll} tabIndex={0} aria-label="Scrollable horizon panorama">
    <svg ref={ref} id="horizon-panorama" className="panorama" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Sun and Earth above the horizon</title>
      <desc id={`${id}-description`}>{summary}</desc>
      <defs><clipPath id={`${id}-plot`}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
      <rect width={width} height={height} fill="#0C0D0B" />
      <g fontFamily="IBM Plex Mono, monospace" fontSize={visibleRange.right - visibleRange.left < 1100 ? 16 : 12} fill="#8F8B80">
        {ticks.map(tick => <g key={tick}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="#ECE8DD" strokeOpacity="0.14" />
          <text x={left - 12} y={y(tick) + 4} textAnchor="end">{tick.toFixed(0)}°</text>
        </g>)}
        {[0, 90, 180, 270, 360].map((az, i) => <g key={az}>
          <line x1={x(az)} x2={x(az)} y1={top} y2={bottom + 8} stroke="#ECE8DD" strokeOpacity="0.14" />
          <text x={x(az)} y={bottom + 30} textAnchor="middle" fill="#ECE8DD">{['N', 'E', 'S', 'W', 'N'][i]}</text>
          <text x={x(az)} y={bottom + 49} textAnchor="middle">{az}°</text>
        </g>)}
        {visibleRange.right - visibleRange.left >= 1100 && <text x={left} y={20}>Height above a flat horizon</text>}
        <text x={Math.min(right, visibleRange.right - 8)} y={20} textAnchor="end" fontSize={visibleRange.right - visibleRange.left < 1100 ? 18 : 12}>Vertical scale {exaggeration >= 1 ? `exaggerated ${exaggeration.toFixed(1)}×` : `compressed ${(1 / exaggeration).toFixed(1)}×`}</text>
      </g>
      <g clipPath={`url(#${id}-plot)`}>
        <polygon points={`${left},${bottom} ${terrain} ${right},${bottom}`} fill="#0C0D0B" />
        <polyline points={terrain} fill="none" stroke="#ECE8DD" strokeOpacity="0.65" strokeWidth="1" />
        <line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="#8F8B80" strokeOpacity="0.4" strokeDasharray="3 6" />
        {(['sun', 'earth'] as const).map(body => <path key={body} d={paths[body]} fill="none" stroke={body === 'sun' ? '#F2B84B' : '#5FA8D3'} strokeWidth="1.5" strokeOpacity="0.35" strokeDasharray="3 5" />)}
      </g>
      {(['sun', 'earth'] as const).map(body => {
        const point = position[body];
        // Common visual magnification preserves the true angular diameter ratio (~1.9 / 0.53).
        const radius = body === 'sun' ? 6 : 6 * 1.9 / 0.53;
        const color = body === 'sun' ? '#F2B84B' : '#5FA8D3';
        const px = x(point.az), py = y(point.el);
        const label = `${body === 'sun' ? 'Sun' : 'Earth'} ${point.el.toFixed(1)} deg${point.isBlocked ? ' · hidden' : ''}`;
        const textWidth = label.length * 9.65;
        const labelLeft = Math.max(left + 6, visibleRange.left + 10);
        const labelRight = Math.min(right - 6, visibleRange.right - 10);
        const anchor = px + radius + 12 + textWidth > labelRight ? 'end' : 'start';
        const labelX = anchor === 'end'
          ? Math.max(labelLeft + textWidth, Math.min(labelRight, px - radius - 12))
          : Math.max(labelLeft, Math.min(labelRight - textWidth, px + radius + 12));
        const labelY = Math.max(top + 14, Math.min(bottom - 14, py + (body === 'sun' ? -radius - 15 : radius + 22)));
        return <g key={body} data-body={body}>
          <circle cx={px} cy={py} r={radius} fill={point.isBlocked ? '#0C0D0B' : color} stroke={color}
            strokeWidth="1.5" strokeDasharray={point.isBlocked ? '4 3' : undefined} opacity={point.isBlocked ? 0.58 : 1} />
          <line x1={px} y1={py + (body === 'sun' ? -radius : radius)} x2={labelX} y2={labelY - 5} stroke={color} strokeOpacity="0.5" />
          <text x={labelX} y={labelY} textAnchor={anchor} fontFamily="IBM Plex Mono, monospace" fontSize="16" fill={color}
            stroke="#0C0D0B" strokeWidth="5" paintOrder="stroke">
            {label}
          </text>
        </g>;
      })}
    </svg>
  </div>;
});
