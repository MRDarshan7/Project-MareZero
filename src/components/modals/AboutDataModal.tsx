import React from 'react';
import { Dialog } from '../almanac/Dialog';
import { HORIZONS_BENCHMARKS } from '../../ephemeris/horizonsValidation';
import { formatDate } from '../../utils/almanac';

export function AboutDataModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return <Dialog title="About the calculations" onClose={onClose}>
    <h3>Sky positions</h3><p>Calculated locally with astronomy-engine. Moon-to-Sun and Moon-to-Earth vectors are rotated into the Moon’s body-fixed frame, with the observer’s position subtracted. Stored JPL Horizons comparisons use a 0.1° tolerance for azimuth and elevation.</p>
    <p>Live reference queries cover the rows below. Query details are recorded in src/ephemeris/horizonsValidation.ts; generated rows include full URLs and raw responses. This checks those dates and sites; it does not establish accuracy everywhere.</p>
    <div className="table-scroll"><table><thead><tr><th>Site</th><th>Date (UTC)</th><th>Sun az / el</th><th>Earth az / el</th></tr></thead><tbody>
      {HORIZONS_BENCHMARKS.map((row, i) => <tr key={i}><th>{row.siteName}</th><td>{formatDate(new Date(row.epochIso))} {row.epochIso.slice(11, 16)}</td><td className="mono">{row.expectedSun.az.toFixed(2)}° / {row.expectedSun.el.toFixed(2)}°</td><td className="mono">{row.expectedEarth.az.toFixed(2)}° / {row.expectedEarth.el.toFixed(2)}°</td></tr>)}
    </tbody></table></div>
    <p><a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">JPL Horizons</a> · <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noreferrer">astronomy-engine source</a></p>
    <h3>Terrain and visibility</h3><p>All bundled terrain is synthetic and labeled “Approximate terrain”. An imported 360-value profile is labeled “User-supplied terrain”; importing it does not establish its origin or accuracy. Without a profile, the approximate fallback is a flat 0.5° horizon.</p>
    <p>We compare the centre of each body with the chosen horizon. Events use a 30-minute scan over 30 days, followed by bisection to within one minute. Very short windows between samples may be missed. “Stays up” and “does not rise” refer only to that finite window.</p>
    <p>A visible Sun does not guarantee usable power. A visible Earth does not guarantee a working radio link. The point-body model omits the Sun’s limb, atmosphere, equipment and engineering constraints.</p>
    <h3>Sunlight outlook</h3><p>An illustrative heuristic, not an engineering score: 75 × sunlight fraction + 25 × max(0, 1 − longest dark stretch / 120 h). Earth visibility is separate. “Soon” means a rise within 48 hours. The weights, 120-hour reference and 48-hour wording are display choices.</p>
    <p>Not affiliated with or endorsed by NASA.</p>
  </Dialog>;
}
