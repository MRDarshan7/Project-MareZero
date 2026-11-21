import React, { useState } from 'react';
import { useNavigatorStore } from '../../state/useNavigatorStore';
import { SceneBridge } from '../almanac/SceneBridge';
import { HorizonPanorama } from '../almanac/HorizonPanorama';
import { DomeViewport } from '../dashboard/DomeViewport';

type View = 'dome' | 'panorama' | 'both';
export function SkyDomeTab({ store, scene, panoramaRef }: {
  store: ReturnType<typeof useNavigatorStore>; scene: SceneBridge; panoramaRef: React.RefObject<SVGSVGElement>;
}) {
  const [view, setView] = useState<View>(() => window.matchMedia('(min-width:1024px)').matches ? 'both' : 'dome');
  const delta = store.terrainDelta;
  const sunText = delta.sunReductionHours >= 0
    ? `reduces sunlight by ${delta.sunReductionHours.toFixed(1)} h`
    : `gains ${(-delta.sunReductionHours).toFixed(1)} h sunlight`;
  const earthText = delta.earthReductionHours >= 0
    ? `Earth comms by ${delta.earthReductionHours.toFixed(1)} h`
    : `gains ${(-delta.earthReductionHours).toFixed(1)} h comms`;
  const deltaMessage = `Local terrain ${sunText} and ${earthText} over this 30-day window.`;

  return <section className={`sky-views view-${view}`} aria-label="Sun and Earth sky views">
    <div className="section-heading">
      <div className="section-title-wrap">
        <h2>The sky at this site</h2>
        {!store.includeTerrain && (
          <span className="terrain-delta-inline mono" title="Difference compared to an idealized flat airless lunar sphere">
            {deltaMessage}
          </span>
        )}
      </div>
      <div className="sky-view-controls">
        <label className="terrain-toggle" title="Toggle between local LOLA terrain and an idealized 0° flat lunar sphere">
          <input
            type="checkbox"
            checked={store.includeTerrain}
            onChange={e => store.setIncludeTerrain(e.target.checked)}
          />
          <span>Include local terrain</span>
        </label>
        <div className="view-switch" role="group" aria-label="Sky view">
          {(['dome','panorama','both'] as const).map(option => <button key={option} aria-pressed={view === option} onClick={() => setView(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}
        </div>
      </div>
    </div>
    <div className="sky-view-grid">
      <div className="dome-column" hidden={view === 'panorama'}><DomeViewport scene={scene} position={store.position} /></div>
      <div className="panorama-column" hidden={view === 'dome'}>
        <HorizonPanorama
          ref={panoramaRef}
          compact={view === 'both'}
          position={store.position}
          horizon={store.horizonManager}
          trail={store.trail}
          siteName={store.currentSite.name}
          currentDate={store.currentEpochDate}
        />
        <div className="panorama-notes">
          <span>Trail: previous 12 h / next 24 h</span>
          <span>Heights scaled as marked.</span>
          {!store.includeTerrain && <span className="flat-indicator sun-text">0° Flat Sphere Active (Airless Zero-Refraction)</span>}
        </div>
      </div>
    </div>
  </section>;
}
