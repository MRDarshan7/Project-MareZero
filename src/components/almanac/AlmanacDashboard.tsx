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
import { exportEphemerisCsv } from '../../utils/exportCsv';
import { exportCanvasPng, exportSvgPng } from '../../utils/exportPng';
import { formatDate, terrainLabel, verdict, shareUrl } from '../../utils/almanac';


export default function AlmanacDashboard({ store, scene, onWatchStory }: {
  store: ReturnType<typeof useNavigatorStore>; scene: SceneBridge; onWatchStory: () => void;
}) {
  const [modal, setModal] = useState<'about' | 'custom' | 'share' | null>(null);
  const [notice, setNotice] = useState('');
  const panorama = useRef<SVGSVGElement>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const sun = verdict('Sun', store.position.sun, store.countdownEvents.nextSolarEvent);
  const earth = verdict('Earth', store.position.earth, store.countdownEvents.nextEarthEvent);
  useEffect(() => {
    if (!store.technical && store.activeTab === 'analysis') store.setActiveTab('today');
  }, [store.technical, store.activeTab]);
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
          <article className="verdict"><h2>Can it make power?</h2><div className="verdict-line"><span className={`answer ${sun.answer === 'Yes' ? 'sun-text' : sun.answer === 'No' ? 'blocked-text' : ''}`}>{sun.answer}</span><p>{sun.sentence}</p></div></article>
          <article className="verdict"><h2>Can it phone home?</h2><div className="verdict-line"><span className={`answer ${earth.answer === 'Yes' ? 'earth-text' : earth.answer === 'No' ? 'blocked-text' : ''}`}>{earth.answer}</span><p>{earth.sentence}</p></div></article>
        </section>}
        <section className="control-row" aria-label="Site, date and playback controls">
          <label className="site-control">Location<select aria-label="Landing site" value={site.id} onChange={event => store.setSite(store.allSites.find(s => s.id === event.target.value)!)}>
            {store.allSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <button className="text-button custom-site-button" onClick={() => setModal('custom')}>Add site</button>
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
          <div className="timeline-section"><VisibilityTimeline windows={store.siteMetrics.windows} date={store.currentEpochDate} onSelectDate={store.setTargetDate} /></div>
          {store.technical && <Technical position={store.position} metrics={store.siteMetrics} site={site} />}
        </>}
        {store.activeTab === 'timeline' && <div className="tab-content"><VisibilityTimeline windows={store.siteMetrics.windows} date={store.currentEpochDate} onSelectDate={store.setTargetDate} expanded /></div>}
        {store.activeTab === 'compare' && <div className="tab-content"><Compare sites={store.allSites} currentSite={site} date={store.currentEpochDate} /></div>}
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
