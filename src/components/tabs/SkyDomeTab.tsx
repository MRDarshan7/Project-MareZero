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
  return <section className={`sky-views view-${view}`} aria-label="Sun and Earth sky views">
    <div className="section-heading"><h2>The sky at this site</h2><div className="view-switch" role="group" aria-label="Sky view">
      {(['dome','panorama','both'] as const).map(option => <button key={option} aria-pressed={view === option} onClick={() => setView(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}
    </div></div>
    <div className="sky-view-grid">
      <div className="dome-column" hidden={view === 'panorama'}><DomeViewport scene={scene} position={store.position} /></div>
      <div className="panorama-column" hidden={view === 'dome'}>
        <HorizonPanorama ref={panoramaRef} compact={view === 'both'} position={store.position} horizon={store.horizonManager} trail={store.trail} siteName={store.currentSite.name} />
        <div className="panorama-notes"><span>Trail: previous 12 h / next 24 h</span><span>Heights scaled as marked.</span></div>
      </div>
    </div>
  </section>;
}
