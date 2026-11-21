import React, { useMemo, useState } from 'react';
import { LandingSite } from '../../types';
import { EphemerisEngine } from '../../ephemeris/engine';
import { formatDate, duration, terrainLabel } from '../../utils/almanac';

export function Compare({ sites, currentSite, date, compareCombos, onUpdateCombos }: {
  sites: LandingSite[];
  currentSite: LandingSite;
  date: Date;
  compareCombos?: Array<{ siteId: string; date: string }>;
  onUpdateCombos?: (combos: Array<{ siteId: string; date: string }>) => void;
}) {
  const [internalCombos, setInternalCombos] = useState(() => [currentSite, ...sites.filter(s => ['shackleton-connecting-ridge', 'malapert-massif', 'apollo-11'].includes(s.id) && s.id !== currentSite.id)]
    .slice(0, 3).map(site => ({ siteId: site.id, date: date.toISOString().slice(0, 10) })));
  
  const combos = compareCombos || internalCombos;
  const setCombos = (updater: (prev: Array<{ siteId: string; date: string }>) => Array<{ siteId: string; date: string }>) => {
    const next = updater(combos);
    if (onUpdateCombos) onUpdateCombos(next);
    else setInternalCombos(next);
  };
  const rows = useMemo(() => combos.map(combo => {
    const site = sites.find(s => s.id === combo.siteId)!;
    const epoch = new Date(combo.date + 'T00:00:00Z');
    return { site, date: epoch, metrics: EphemerisEngine.computeSiteMetrics(site, epoch) };
  }), [combos, sites]);
  const slips = useMemo(() => EphemerisEngine.computeLaunchSlipScenarios(currentSite, date), [currentSite, date]);
  const change = (index: number, field: 'siteId' | 'date', value: string) => {
    if (field === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900 || Number(value.slice(0, 4)) > 2100)) return;
    setCombos(previous => previous.map((combo, i) => i === index ? { ...combo, [field]: value } : combo));
  };
  const delta = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  return <section className="compare-view">
    <div className="section-heading"><h1>Compare places and dates</h1><span className="muted">Up to three combinations · 30 days each</span></div>
    <p className="section-intro">See how sunlight and a view of Earth change. Differences are measured against the first column. Each combination starts at 00:00 UTC.</p>
    <details className="compare-configuration"><summary>Choose sites and dates ({combos.length} combinations)</summary>
    <div className="compare-controls">{combos.map((combo, index) => <fieldset key={index}>
      <legend>Combination {index + 1}</legend>
      <label>Site<select aria-label={`Site for combination ${index + 1}`} value={combo.siteId} onChange={e => change(index, 'siteId', e.target.value)}>
        {sites.map(site => <option value={site.id} key={site.id}>{site.name}</option>)}
      </select></label>
      <p className="selected-name">{rows[index].site.name}</p>
      <label>{formatDate(rows[index].date)} · UTC<span className="native-date-field"><input aria-label={`Date for combination ${index + 1}`} type="date" min="1900-01-01" max="2100-12-31" value={combo.date} onChange={e => change(index, 'date', e.target.value)} /><span aria-hidden="true">{formatDate(rows[index].date)}</span></span></label>
      {combos.length > 1 && <button className="text-button" onClick={() => setCombos(previous => previous.filter((_, i) => i !== index))}>Remove combination {index + 1}</button>}
    </fieldset>)}</div>
    {combos.length < 3 && <button onClick={() => setCombos(previous => [...previous, { siteId: currentSite.id, date: date.toISOString().slice(0, 10) }])}>Add a combination</button>}
    </details>
    <p className="table-hint">Scroll sideways for other combinations.</p>
    <div className="table-scroll" tabIndex={0} aria-label="Scrollable comparison table"><table className="comparison-table" aria-label="Computed visibility including the selected terrain">
      <thead><tr><th>Next 30 days</th>{rows.map((row, i) => <th key={i}>{row.site.name}<small>{formatDate(row.date)} · {terrainLabel(row.site)}</small></th>)}</tr></thead>
      <tbody>
        <tr><th>Sun up</th>{rows.map((row, i) => <td key={i} className="mono sun-text">{(row.metrics.illuminationFraction * 100).toFixed(1)}%<small>{i ? `${delta((row.metrics.illuminationFraction - rows[0].metrics.illuminationFraction) * 100)} percentage points` : 'Reference'}</small></td>)}</tr>
        <tr><th>Longest dark stretch</th>{rows.map((row, i) => <td className="mono" key={i}>{duration(row.metrics.longestContinuousShadowHours)}</td>)}</tr>
        <tr><th>Earth visible</th>{rows.map((row, i) => <td className="mono earth-text" key={i}>{(row.metrics.earthVisibilityFraction * 100).toFixed(1)}%<small>{i ? `${delta((row.metrics.earthVisibilityFraction - rows[0].metrics.earthVisibilityFraction) * 100)} percentage points` : 'Reference'}</small></td>)}</tr>
        <tr><th>Longest time Earth is hidden</th>{rows.map((row, i) => <td className="mono" key={i}>{duration(row.metrics.longestContinuousBlackoutHours)}</td>)}</tr>
      </tbody>
    </table></div>
    <section className="slip-section"><h2>If the date slips</h2><p className="muted">{currentSite.name} · relative to {formatDate(date)}. Each row uses its own start date.</p>
      <div className="table-scroll"><table><thead><tr><th>Change</th><th>Start (UTC)</th><th>Sun up</th><th>Difference</th><th>Earth visible</th><th>Difference</th></tr></thead>
        <tbody>{slips.map(slip => <tr key={slip.slipDays}><th>{slip.label}</th><td>{formatDate(slip.epochDate)}</td>
          <td className="mono sun-text">{(slip.metrics.illuminationFraction * 100).toFixed(1)}%</td><td className="mono">{delta((slip.metrics.illuminationFraction - slips[0].metrics.illuminationFraction) * 100)} pp</td>
          <td className="mono earth-text">{(slip.metrics.earthVisibilityFraction * 100).toFixed(1)}%</td><td className="mono">{delta((slip.metrics.earthVisibilityFraction - slips[0].metrics.earthVisibilityFraction) * 100)} pp</td>
        </tr>)}</tbody></table></div>
    </section>
  </section>;
}
