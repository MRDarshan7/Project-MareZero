import React, { useEffect, useRef, useState } from 'react';
import { useNavigatorStore } from '../../state/useNavigatorStore';
import { SkyDomeTab } from '../tabs/SkyDomeTab';
import { SceneBridge } from './SceneBridge';
import { VisibilityTimeline } from './VisibilityTimeline';
import { Compare } from './Compare';
import { Analysis, Technical } from './Technical';
import { Dialog } from './Dialog';
import { AboutDataModal } from '../modals/AboutDataModal';
import { CustomSiteModal } from '../modals/CustomSiteModal';
import { StudyPopover } from './StudyPopover';
import { exportEphemerisCsv } from '../../utils/exportCsv';
import { exportCanvasPng, exportSvgPng } from '../../utils/exportPng';
import { formatDate, terrainLabel, verdict, shareUrl } from '../../utils/almanac';

export default function AlmanacDashboard({ store, scene, onWatchStory }: {
  store: ReturnType<typeof useNavigatorStore>; scene: SceneBridge; onWatchStory: () => void;
}) {
  const [modal, setModal] = useState<'about' | 'custom' | 'share' | null>(null);
  const [notice, setNotice] = useState('');
  const [studyMenuOpen, setStudyMenuOpen] = useState(false);
  const [solarArch, setSolarArch] = useState<'vertical' | 'horizontal'>('vertical');
  const panorama = useRef<SVGSVGElement>(null);
  const studyMenuRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const sun = verdict('Sun', store.position.sun, store.countdownEvents.nextSolarEvent);
  const earth = verdict('Earth', store.position.earth, store.countdownEvents.nextEarthEvent);

  useEffect(() => {
    if (!store.technical && store.activeTab === 'analysis') store.setActiveTab('today');
  }, [store.technical, store.activeTab]);

  useEffect(() => {
    if (!studyMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (studyMenuRef.current && !studyMenuRef.current.contains(e.target as Node)) {
        setStudyMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStudyMenuOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [studyMenuOpen]);

  const moveDate = (days: number) => store.setTargetDate(new Date(store.currentEpochDate.getTime() + days * 86400000));
  const png = async () => {
    try {
      if (panorama.current?.getBoundingClientRect().width) await exportSvgPng(panorama.current, `${store.currentSite.id}-horizon.png`);
      else {
        const canvas = document.querySelector('.dome-stage canvas') as HTMLCanvasElement | null;
        if (canvas) exportCanvasPng(canvas, `${store.currentSite.id}-3d.png`);
        else { setNotice('Open Today to export the horizon as a PNG.'); return; }
      }
      setNotice('PNG exported.');
    } catch { setNotice('PNG export failed. Try the panorama view.'); }
  };
  const site = store.currentSite;

  // Solar Array Geometry Calculations
  const sunEl = store.position.sun.el;
  const isSunBlocked = store.position.sun.isBlocked || sunEl <= 0;
  const vertFactor = isSunBlocked ? 0 : Math.max(0, Math.cos(sunEl * Math.PI / 180));
  const horizFactor = isSunBlocked ? 0 : Math.max(0, Math.sin(sunEl * Math.PI / 180));
  const activeEff = solarArch === 'vertical' ? vertFactor : horizFactor;
  const activeEffPercent = (activeEff * 100).toFixed(1);
  const cosEffPercent = (vertFactor * 100).toFixed(1);
  const sinEffPercent = (horizFactor * 100).toFixed(1);

  const formulaLabel = isSunBlocked
    ? (sunEl <= 0 ? 'below horizon' : 'terrain occluded')
    : (solarArch === 'vertical' ? `cos(${sunEl.toFixed(1)}°)` : `sin(${sunEl.toFixed(1)}°)`);

  const arrayNote = isSunBlocked
    ? `Sun is below terrain horizon (${sunEl.toFixed(1)}°, 0.0% collection) — lander requires battery storage or fuel cells.`
    : Math.abs(site.lat) > 65 || sunEl < 15
      ? `At low grazing angles (θ = ${sunEl.toFixed(1)}°), vertical arrays capture cos(θ) (${cosEffPercent}%) vs flat arrays capturing sin(θ) (only ${sinEffPercent}%), making vertical panels essential for polar landers.`
      : `At high solar elevations (θ = ${sunEl.toFixed(1)}°), horizontal arrays collect sin(θ) (${sinEffPercent}%) while vertical arrays collect cos(θ) (${cosEffPercent}%).`;

  // Physics dynamic values for study popovers
  const maxSunEl = Math.max(0, 90 - Math.abs(site.lat) + 1.54);
  const earthEquivMaxSunEl = Math.max(0, 90 - Math.abs(site.lat) + 23.44);

  const STUDY_PRESETS = [
    {
      id: 'equator-vs-southpole',
      title: 'Equator vs. South Pole',
      subtitle: 'Apollo 11 vs. Shackleton Connecting Ridge',
      description: 'Extreme lighting contrast: equatorial 14-day night vs. polar ridge continuous grazing sunlight.',
      apply: () => {
        const baseDate = store.targetDate.toISOString().slice(0, 10);
        store.setCompareCombos([
          { siteId: 'apollo-11', date: baseDate },
          { siteId: 'shackleton-connecting-ridge', date: baseDate }
        ]);
        store.setActiveTab('compare');
      }
    },
    {
      id: 'small-shift',
      title: 'Small Shift, Big Impact',
      subtitle: 'Shackleton Connecting Ridge vs. Faustini Crater Rim',
      description: 'Two South Pole coordinates ~70 km apart showing how micro-topography flips visibility from 80% to 20%.',
      apply: () => {
        const baseDate = store.targetDate.toISOString().slice(0, 10);
        store.setCompareCombos([
          { siteId: 'shackleton-connecting-ridge', date: baseDate },
          { siteId: 'faustini-rim', date: baseDate }
        ]);
        store.setActiveTab('compare');
      }
    },
    {
      id: 'launch-delay',
      title: 'Launch Delay Impact',
      subtitle: `${site.name} (T+0) vs. (+14-day slip)`,
      description: 'Half a synodic lunar month shifts the subsolar point 180°, swapping daylight into lunar darkness.',
      apply: () => {
        const baseDate = store.targetDate.toISOString().slice(0, 10);
        const slipDate = new Date(store.targetDate.getTime() + 14 * 86400000).toISOString().slice(0, 10);
        store.setCompareCombos([
          { siteId: site.id, date: baseDate },
          { siteId: site.id, date: slipDate }
        ]);
        store.setActiveTab('compare');
      }
    },
    {
      id: 'polar-peaks',
      title: 'Artemis Candidate Highlands',
      subtitle: 'Shackleton Ridge vs. Malapert Massif vs. Mons Mouton',
      description: 'Compare prime candidate landing ridges for continuous illumination and direct Earth line-of-sight.',
      apply: () => {
        const baseDate = store.targetDate.toISOString().slice(0, 10);
        store.setCompareCombos([
          { siteId: 'shackleton-connecting-ridge', date: baseDate },
          { siteId: 'malapert-massif', date: baseDate },
          { siteId: 'mons-mouton', date: baseDate }
        ]);
        store.setActiveTab('compare');
      }
    }
  ];

  return <div className={`almanac tab-${store.activeTab}`}>
    <a className="skip-link" href="#main">Skip to the almanac</a>
    <header className="masthead">
      <a href="#" className="wordmark" onClick={event => { event.preventDefault(); store.setActiveTab('today'); }}>Lunar navigator<span>Sun and Earth at lunar landing sites</span></a>
      <nav aria-label="Main navigation">{(['today', 'timeline', 'compare', ...(store.technical ? ['analysis'] : [])] as const).map(tab =>
        <button type="button" key={tab} aria-current={store.activeTab === tab ? 'page' : undefined} className={store.activeTab === tab ? 'active-tab' : ''}
          onClick={() => store.setActiveTab(tab as typeof store.activeTab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</nav>
      <div className="header-actions"><label className="technical-toggle"><input type="checkbox" checked={store.technical} onChange={event => store.setTechnical(event.target.checked)} />Technical</label>
        <button className="text-button" onClick={() => { setCopyStatus(''); setModal('share'); }}>Share</button>
        <button className="text-button" onClick={() => { exportEphemerisCsv(site, store.synodicSamples, store.siteMetrics); setNotice('CSV exported.'); }}>CSV</button>
        <button className="text-button" onClick={png}>PNG</button></div>
    </header>
    <main id="main" tabIndex={-1}>
      <div className="location-heading"><div><h1>{site.name}</h1><span className="terrain-label">{terrainLabel(site)}{site.terrainSource === 'flat-fallback' ? ' · flat 0.5° fallback' : ''}</span></div>
        <dl className="coordinate-grid"><div><dt>Latitude</dt><dd>{Math.abs(site.lat).toFixed(2)}° {site.lat < 0 ? 'S' : 'N'}</dd></div><div><dt>Longitude</dt><dd>{Math.abs(site.lon).toFixed(2)}° {site.lon < 0 ? 'W' : 'E'}</dd></div><div><dt>Height</dt><dd>{site.elevationKm.toFixed(2)} km</dd></div></dl>
      </div>
      <div className="today-layout">
        {store.activeTab === 'today' && <section className="verdicts" aria-label="Current visibility verdicts">
          <article className="verdict">
            <div className="verdict-header-row">
              <h2>Can it make power?</h2>
              <StudyPopover
                id="sun-low"
                label="Why is the Sun so low?"
                title="Axial Tilt & Solar Elevation"
              >
                <p>
                  The Moon's spin axis is tilted by only <strong>1.54°</strong> relative to the ecliptic plane, compared to Earth's <strong>23.44°</strong> axial tilt.
                </p>
                <p>
                  Without significant tilt, the Moon experiences virtually no seasons. At <strong>{site.name}</strong> ({Math.abs(site.lat).toFixed(2)}° {site.lat < 0 ? 'S' : 'N'}), the Sun never climbs higher than <strong>{maxSunEl.toFixed(1)}°</strong> above the horizontal reference sphere.
                </p>
                <div className="study-data-table">
                  <div><span>Site Latitude</span><strong className="mono">{Math.abs(site.lat).toFixed(2)}° {site.lat < 0 ? 'S' : 'N'}</strong></div>
                  <div><span>Moon Axial Tilt</span><strong className="mono">1.54°</strong></div>
                  <div><span>Theoretical Max Solar El</span><strong className="mono sun-text">{maxSunEl.toFixed(1)}°</strong></div>
                  <div><span>Same Lat on Earth (Summer)</span><strong className="mono">{earthEquivMaxSunEl.toFixed(1)}°</strong></div>
                  <div><span>Live Solar Elevation</span><strong className="mono sun-text">{store.position.sun.el.toFixed(1)}°</strong></div>
                </div>
                <p className="muted">
                  Near the lunar poles, the Sun constantly skims the horizon at 1°–2°, casting elongated multi-kilometer shadows.
                </p>
              </StudyPopover>
            </div>
            <div className="verdict-line">
              <span className={`answer ${sun.answer === 'Yes' ? 'sun-text' : sun.answer === 'No' ? 'blocked-text' : ''}`}>{sun.answer}</span>
              <p>{sun.sentence}</p>
            </div>
            <div className="verdict-sub-row">
              <StudyPopover
                id="no-twilight"
                label="Why is there no twilight?"
                title="Zero Atmospheric Refraction & Twilight"
              >
                <p>
                  The Moon is an airless body with zero atmosphere (&lt; 10⁻¹² bar). Unlike Earth, where air molecules refract sunlight by ~0.5° at the horizon and scatter blue light to create civil, nautical, and astronomical twilight, the lunar sky is in pure vacuum.
                </p>
                <p>
                  When the Sun's 0.53° angular disc dips behind a mountain ridge, illumination terminates instantaneously from ~1361 W/m² direct solar flux to complete pitch blackness.
                </p>
                <div className="study-data-table">
                  <div><span>Atmospheric Refraction</span><strong className="mono">0.00° (Vacuum)</strong></div>
                  <div><span>Terrain Horizon at Sun Az</span><strong className="mono">{store.position.sun.horizonElevation.toFixed(1)}°</strong></div>
                  <div><span>Live Sun Clearance</span><strong className="mono">{(store.position.sun.el - store.position.sun.horizonElevation) >= 0 ? '+' : ''}{(store.position.sun.el - store.position.sun.horizonElevation).toFixed(1)}°</strong></div>
                  <div><span>Current Lighting State</span><strong className={`mono ${store.position.sun.isBlocked ? 'blocked-text' : 'sun-text'}`}>{store.position.sun.isBlocked ? 'Occulted (0 lux)' : 'Full Sun (~1361 W/m²)'}</strong></div>
                </div>
                <p className="muted">
                  There are no gradual sunsets or golden hours on the Moon—solar panels experience an abrupt step-function cutoff.
                </p>
              </StudyPopover>
            </div>
            {/* Solar Array Geometry Study Toggle */}
            <div className="array-study-box">
              <div className="array-toggle-row">
                <div className="array-toggle" role="radiogroup" aria-label="Solar array geometry">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={solarArch === 'vertical'}
                    className={solarArch === 'vertical' ? 'active' : ''}
                    onClick={() => setSolarArch('vertical')}
                  >
                    Vertical polar array
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={solarArch === 'horizontal'}
                    className={solarArch === 'horizontal' ? 'active' : ''}
                    onClick={() => setSolarArch('horizontal')}
                  >
                    Horizontal array
                  </button>
                </div>
                <span className="array-efficiency-readout mono">
                  Collection: <strong className={activeEff > 0 ? 'sun-text' : 'muted'}>{activeEffPercent}%</strong>
                  <small className="muted"> ({formulaLabel})</small>
                </span>
              </div>
              <p className="array-dynamic-note">{arrayNote}</p>
            </div>
          </article>
          <article className="verdict">
            <div className="verdict-header-row">
              <h2>Can it phone home?</h2>
              <StudyPopover
                id="earth-wobble"
                label="Why does Earth wobble in place?"
                title="Tidal Locking & Lunar Libration"
              >
                <p>
                  The Moon is tidally locked to Earth: its rotation period equals its 27.3-day orbital period. As a result, Earth remains pinned in nearly the same patch of sky from any point on the lunar nearside.
                </p>
                <p>
                  However, because the Moon's orbit is elliptical (eccentricity <em>e</em> = 0.0549) and inclined by 5.14°, its orbital speed varies while its rotation rate remains constant. This mismatch causes <strong>lunar libration</strong>: Earth traces a distinct apparent ellipse (±7.9° in longitude, ±6.7° in latitude) over each month.
                </p>
                <div className="study-data-table">
                  <div><span>Sub-Earth Libration Point</span><strong className="mono">{store.position.libration.earthSubLat.toFixed(2)}° lat, {store.position.libration.earthSubLon.toFixed(2)}° lon</strong></div>
                  <div><span>Live Earth Azimuth</span><strong className="mono earth-text">{store.position.earth.az.toFixed(1)}°</strong></div>
                  <div><span>Live Earth Elevation</span><strong className="mono earth-text">{store.position.earth.el.toFixed(1)}°</strong></div>
                  <div><span>Terrain Horizon at Earth Az</span><strong className="mono">{store.position.earth.horizonElevation.toFixed(1)}°</strong></div>
                  <div><span>Terrain Clearance</span><strong className="mono">{(store.position.earth.el - store.position.earth.horizonElevation) >= 0 ? '+' : ''}{(store.position.earth.el - store.position.earth.horizonElevation).toFixed(1)}°</strong></div>
                </div>
                <p className="muted">
                  At low polar elevations, this ~15° libration ellipse regularly dips Earth below local crater rims, creating periodic radio communication blackouts.
                </p>
              </StudyPopover>
            </div>
            <div className="verdict-line">
              <span className={`answer ${earth.answer === 'Yes' ? 'earth-text' : earth.answer === 'No' ? 'blocked-text' : ''}`}>{earth.answer}</span>
              <p>{earth.sentence}</p>
            </div>
          </article>
        </section>}
        <section className="control-row" aria-label="Site, date and playback controls">
          <label className="site-control">Location<select aria-label="Landing site" value={site.id} onChange={event => store.setSite(store.allSites.find(s => s.id === event.target.value)!)}>
            {store.allSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <div className="site-actions-group" ref={studyMenuRef}>
            <button className="text-button custom-site-button" onClick={() => setModal('custom')}>Add site</button>
            <div className="study-menu-container">
              <button
                type="button"
                className="text-button study-examples-button"
                onClick={() => setStudyMenuOpen(prev => !prev)}
                aria-haspopup="menu"
                aria-expanded={studyMenuOpen}
              >
                Study examples ▾
              </button>
              {studyMenuOpen && (
                <div className="study-dropdown-menu floating-dark-popover" role="menu" aria-label="Curated educational presets">
                  <div className="study-menu-header">Educational study presets</div>
                  {STUDY_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      role="menuitem"
                      className="study-menu-item"
                      onClick={() => {
                        preset.apply();
                        setStudyMenuOpen(false);
                      }}
                    >
                      <span className="preset-title">{preset.title}</span>
                      <span className="preset-sites muted">{preset.subtitle}</span>
                      <span className="preset-desc">{preset.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="date-control"><span className="control-label">{formatDate(store.currentEpochDate)} · {store.currentEpochDate.toISOString().slice(11, 16)} UTC</span><div className="date-buttons">
            <button aria-label="Previous day" onClick={() => moveDate(-1)}>←</button><span className="native-date-field"><input aria-label="Select UTC date" type="date" min="1900-01-01" max="2100-12-31" value={store.currentEpochDate.toISOString().slice(0, 10)}
              onChange={event => { if (event.target.value) store.setTargetDate(new Date(event.target.value + 'T00:00:00Z')); }} /><span aria-hidden="true">{formatDate(store.currentEpochDate)}</span></span>
            <button aria-label="Next day" onClick={() => moveDate(1)}>→</button></div></div>
          <div className="playback-control"><span className="control-label mono" title="Elapsed time from the selected start date">Day {store.missionDay.toFixed(1)} of 29.5</span><div className="playback-buttons">
            <button aria-label={store.isPlaying ? 'Pause playback' : 'Play playback'} aria-pressed={store.isPlaying} onClick={() => store.setIsPlaying(!store.isPlaying)}>{store.isPlaying ? 'Pause' : 'Play'}</button>
            <select aria-label="Playback speed" value={store.playbackSpeed} onChange={event => store.setPlaybackSpeed(Number(event.target.value))}><option value={1}>1 h / sec</option><option value={6}>6 h / sec</option><option value={24}>1 d / sec</option></select></div></div>
        </section>
        {store.activeTab === 'today' && <>
          <SkyDomeTab store={store} scene={scene} panoramaRef={panorama} />
          <div className="timeline-section">
            <VisibilityTimeline
              windows={store.siteMetrics.windows}
              date={store.targetDate}
              activeDate={store.currentEpochDate}
              missionDay={store.missionDay}
              onSelectDate={store.setTargetDate}
              onScrub={store.scrubToDay}
              site={site}
              horizon={store.horizonManager}
            />
          </div>
          {store.technical && <Technical position={store.position} metrics={store.siteMetrics} site={site} />}
        </>}
        {store.activeTab === 'timeline' && <div className="tab-content"><VisibilityTimeline windows={store.siteMetrics.windows} date={store.targetDate} activeDate={store.currentEpochDate} missionDay={store.missionDay} onSelectDate={store.setTargetDate} onScrub={store.scrubToDay} site={site} horizon={store.horizonManager} expanded /></div>}
        {store.activeTab === 'compare' && <div className="tab-content"><Compare sites={store.allSites} currentSite={site} date={store.currentEpochDate} compareCombos={store.compareCombos} onUpdateCombos={store.setCompareCombos} /></div>}
        {store.activeTab === 'analysis' && store.technical && <div className="tab-content"><Analysis sites={store.allSites} date={store.currentEpochDate} /></div>}
      </div>
      <p className="site-note">{site.description}</p>
    </main>
    <footer><p>Ephemeris from astronomy-engine, checked against JPL Horizons. Terrain is approximate. Not affiliated with or endorsed by NASA. <button className="inline-button" onClick={() => setModal('about')}>About the data</button></p>
      <button className="text-button story-link" onClick={onWatchStory}>Watch the launch story</button></footer>
    <span role="status" className={notice ? 'export-notice' : 'sr-only'}>{notice}{notice && <button aria-label="Dismiss export notice" onClick={() => setNotice('')}>Dismiss</button>}</span>
    <AboutDataModal isOpen={modal === 'about'} onClose={() => setModal(null)} />
    {modal === 'custom' && <CustomSiteModal isOpen onClose={() => setModal(null)} onAddCustomSite={store.addCustomSite} />}
    {modal === 'share' && <Dialog title="Share this view" onClose={() => setModal(null)}><p>The link includes the selected site and UTC time. Custom links include the supplied profile.</p>
      <label>View link<textarea readOnly rows={3} value={shareUrl(site, store.currentEpochDate)} onFocus={event => event.target.select()} /></label>
      <button onClick={async () => { try { await navigator.clipboard.writeText(shareUrl(site, store.currentEpochDate)); setCopyStatus('Link copied.'); } catch { setCopyStatus('Select and copy the link above.'); } }}>Copy link</button><p role="status">{copyStatus}</p></Dialog>}
  </div>;
}
