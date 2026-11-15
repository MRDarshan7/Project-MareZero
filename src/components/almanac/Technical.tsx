import React, { useMemo } from 'react';
import { LandingSite, SiteMetrics } from '../../types';
import { EphemerisEngine, TopocentricResult } from '../../ephemeris/engine';
import { duration, formatDate, terrainLabel } from '../../utils/almanac';

export function Technical({ position, metrics, site }: { position: TopocentricResult; metrics: SiteMetrics; site: LandingSite }) {
  const flux = EphemerisEngine.calculateSolarFlux(position.sun.el, position.sun.isBlocked);
  return <section className="technical-readout" aria-label="Technical readout">
    <div className="section-heading"><h2>Instrument readout</h2><span className="muted">{terrainLabel(site)}</span></div>
    <div className="technical-grid"><div className="table-scroll" tabIndex={0} aria-label="Scrollable positions table"><table><thead><tr><th>Body</th><th>Azimuth</th><th>Elevation</th><th>Distance</th></tr></thead><tbody>
      <tr><th>Sun</th><td className="mono">{position.sun.az.toFixed(2)}°</td><td className="mono">{position.sun.el.toFixed(2)}°</td><td className="mono">{position.sun.distance.toFixed(4)} AU</td></tr>
      <tr><th>Earth</th><td className="mono">{position.earth.az.toFixed(2)}°</td><td className="mono">{position.earth.el.toFixed(2)}°</td><td className="mono">{position.earth.distance.toLocaleString('en-GB')} km</td></tr>
    </tbody></table><p className="muted">Azimuth: north 0°, east 90°. Elevation: above the flat local horizon.</p></div>
    <div><h3>Sunlight outlook <span className="mono">{metrics.powerScore}/100</span></h3><p>{metrics.powerExplanation}</p><p className="muted">Illustrative vertical array output: <span className="mono">{flux.fluxWm2} W/m²</span>. {flux.description}</p></div></div>
    <details><summary>Visibility windows and data sources</summary>
      <p>Ephemeris: astronomy-engine, with Moon-fixed vectors checked against stored JPL Horizons rows at 0.1°. {terrainLabel(site)}: {site.terrainSource === 'user' ? 'the imported profile is not independently verified.' : 'the bundled profile is synthetic; no measured topography is included.'}</p>
      <p>Visibility treats each body as a point at its centre. No atmosphere or solar limb correction. Events use a 30-minute scan and bisection to within one minute; very short windows between scan samples can be missed.</p>
      <div className="table-scroll"><table><thead><tr><th>Window</th><th>Start (UTC)</th><th>End (UTC)</th><th>Duration</th></tr></thead><tbody>
        {metrics.windows.map((w, i) => <tr key={i}><th>{({ sunlight: 'Sun up', solar_shadow: 'Sun hidden', earth_los: 'Earth visible', comm_blackout: 'Earth hidden' })[w.type]}</th><td>{formatDate(new Date(w.startIso))} {w.startIso.slice(11, 16)}</td><td>{formatDate(new Date(w.endIso))} {w.endIso.slice(11, 16)}</td><td className="mono">{duration(w.durationHours)}</td></tr>)}
      </tbody></table></div>
    </details>
  </section>;
}

export function Analysis({ sites, date }: { sites: LandingSite[]; date: Date }) {
  const rows = useMemo(() => sites.map(site => ({ site, metrics: EphemerisEngine.computeSiteMetrics(site, date) }))
    .sort((a, b) => b.metrics.powerScore - a.metrics.powerScore), [sites, date]);
  return <section className="analysis-view"><h1>Sunlight outlook · analysis</h1>
    <p className="section-intro">An illustrative ranking for the 30 days from {formatDate(date)}. It does not rank mission suitability or include communication coverage.</p>
    <p className="muted">Score = 75 × sunlight fraction + 25 × max(0, 1 − longest dark stretch / 120 h). The weights and 120 h reference are heuristic choices.</p>
    <div className="table-scroll"><table><thead><tr><th>Site</th><th>Outlook / 100</th><th>Sun up</th><th>Longest darkness</th><th>Earth visible (separate)</th></tr></thead><tbody>
      {rows.map(({ site, metrics }) => <tr key={site.id}><th>{site.name}<small>{terrainLabel(site)}</small></th><td className="mono">{metrics.powerScore}</td><td className="mono sun-text">{(metrics.illuminationFraction * 100).toFixed(1)}%</td><td className="mono">{duration(metrics.longestContinuousShadowHours)}</td><td className="mono earth-text">{(metrics.earthVisibilityFraction * 100).toFixed(1)}%</td></tr>)}
    </tbody></table></div>
  </section>;
}
