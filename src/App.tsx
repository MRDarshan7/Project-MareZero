import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ThreeConductor } from './scene/ThreeConductor';
import { applyFieldTheme } from './scene/fieldTheme';
import { useNavigatorStore } from './state/useNavigatorStore';
import AlmanacDashboard from './components/almanac/AlmanacDashboard';
import { SceneBridge } from './components/almanac/SceneBridge';
import { HeroOverlay, HeroOverlayHandle } from './components/scroll/HeroOverlay';
import { ScrollTelemetryHud, ScrollTelemetryHudHandle } from './components/scroll/ScrollTelemetryHud';
import { MissionCaptionPill, MissionCaptionPillHandle } from './components/scroll/MissionCaptionPill';
import { DomeLabels } from './components/dashboard/DomeViewport';

const SESSION_KEY = 'lunar-dashboard-choice';
function initialSkip(): boolean {
  const query = new URLSearchParams(window.location.search);
  if (query.get('story') === '1') return false;
  if (query.get('skip') === '1') return true;
  try { return sessionStorage.getItem(SESSION_KEY) === 'dashboard'; } catch { return false; }
}
function rememberDashboard(value: boolean) {
  try { if (value) sessionStorage.setItem(SESSION_KEY, 'dashboard'); else sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage is optional. */ }
}

export default function App() {
  const store = useNavigatorStore();
  const latest = useRef(store); latest.current = store;
  const [skipInitially] = useState(initialSkip);
  const [storyEnabled, setStoryEnabled] = useState(!skipInitially);
  const [dashboardVisible, setDashboardVisible] = useState(skipInitially);
  const [conductor, setConductor] = useState<ThreeConductor | null>(null);
  const [error, setError] = useState('');
  const conductorRef = useRef<ThreeConductor | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const storyHost = useRef<HTMLDivElement>(null);
  const domeHost = useRef<HTMLDivElement | null>(null);
  const hero = useRef<HeroOverlayHandle>(null);
  const telemetry = useRef<ScrollTelemetryHudHandle>(null);
  const caption = useRef<MissionCaptionPillHandle>(null);
  const debugSlider = useRef<HTMLInputElement>(null);
  const debugValue = useRef<HTMLOutputElement>(null);
  const subscribers = useRef(new Set<() => void>());
  const phase = useRef(dashboardVisible); phase.current = dashboardVisible;
  const enabled = useRef(storyEnabled); enabled.current = storyEnabled;
  const target = useRef(skipInitially ? 1 : 0);
  const holdHandoff = useRef(false);
  const debug = new URLSearchParams(window.location.search).get('debug') === '1';

  const registerDomeHost = useCallback((host: HTMLDivElement | null) => { domeHost.current = host; }, []);
  const subscribeFrame = useCallback((listener: () => void) => { subscribers.current.add(listener); return () => { subscribers.current.delete(listener); }; }, []);
  const scene: SceneBridge = useMemo(() => ({ conductor, error, registerDomeHost, subscribeFrame }), [conductor, error, registerDomeHost, subscribeFrame]);
  const renderNow = useCallback((p: number) => {
    const current = conductorRef.current; if (!current) return;
    current.setProgressImmediate(p);
    current.renderer.shadowMap.needsUpdate = true;
    current.renderer.render(current.scene, current.camera);
  }, []);
  const attachCanvas = useCallback(() => {
    const current = conductorRef.current, canvas = canvasRef.current;
    const host = phase.current ? domeHost.current : storyHost.current;
    if (!current || !canvas || !host) return;
    if (canvas.parentElement !== host) host.appendChild(canvas);
    canvas.style.pointerEvents = phase.current ? 'auto' : 'none';
    canvas.tabIndex = phase.current ? 0 : -1;
    canvas.setAttribute('aria-label', phase.current ? 'Interactive 3D sky dome; drag to orbit and scroll to zoom.' : 'Scroll-driven rocket launch story.');
    current.onResize(); renderNow(phase.current ? 1 : target.current);
  }, [renderNow]);

  useEffect(() => {
    const canvas = document.createElement('canvas'); canvas.className = 'shared-scene-canvas'; canvas.tabIndex = 0;
    canvasRef.current = canvas;
    const host = phase.current ? domeHost.current : storyHost.current;
    if (!host) return;
    host.appendChild(canvas);
    let current: ThreeConductor;
    try { current = new ThreeConductor(canvas); } catch {
      setError('3D is unavailable in this browser. The panorama and computed readouts remain available.'); canvas.remove(); return;
    }
    conductorRef.current = current;
    // This is the instrument's orbit framing; the flight/camera kinematic functions remain unchanged.
    current.domeZoom = 44;
    applyFieldTheme(current);
    current.onBeforeRender = () => {
      current.atmosphere.starfield.visible = current.currentProgress < 0.86;
      current.skyDome.prepareView(current.camera, canvas.clientHeight);
    };
    const data = latest.current;
    current.skyDome.setHeightExaggeration(Math.abs(data.currentSite.lat) > 80 ? 8 : 1);
    current.updateHorizonProfile(data.horizonManager); current.updateSkyDomePaths(data.trail);
    current.updateSkyDomePositions(data.position.sun, data.position.earth);
    current.onFrameProgress = p => {
      hero.current?.update(p); telemetry.current?.update(p); caption.current?.update(p);
      if (debugSlider.current) debugSlider.current.value = String(p);
      if (debugValue.current) debugValue.current.value = p.toFixed(3);
      document.documentElement.dataset.storyProgress = p.toFixed(5);
      subscribers.current.forEach(listener => listener());
      if (enabled.current && !phase.current && p === 1 && target.current === 1 && !holdHandoff.current) {
        phase.current = true; rememberDashboard(true); setDashboardVisible(true);
      }
    };
    renderNow(target.current); setConductor(current);
    if (skipInitially) rememberDashboard(true);
    return () => { current.destroy(); canvas.remove(); conductorRef.current = null; };
  }, []);

  useLayoutEffect(attachCanvas, [dashboardVisible, storyEnabled, conductor, store.activeTab, attachCanvas]);
  useLayoutEffect(() => {
    if (!conductor) return;
    conductor.skyDome.setHeightExaggeration(Math.abs(store.currentSite.lat) > 80 ? 8 : 1);
    conductor.updateHorizonProfile(store.horizonManager); conductor.updateSkyDomePaths(store.trail);
    conductor.updateSkyDomePositions(store.position.sun, store.position.earth);
    renderNow(phase.current ? 1 : target.current);
  }, [conductor, store.currentSite, store.horizonManager, store.trail, store.position, renderNow]);

  useEffect(() => {
    const scroll = () => {
      if (!enabled.current || !track.current) return;
      const range = track.current.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, range > 0 ? window.scrollY / range : 0));
      target.current = p;
      if (p < 1 && phase.current) { phase.current = false; setDashboardVisible(false); }
      const current = conductorRef.current;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) renderNow(p);
      else current?.setScrollProgress(p);
    };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', scroll);
    return () => { window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll); };
  }, [renderNow]);

  const skip = () => {
    rememberDashboard(true); store.setIsPlaying(false);
    enabled.current = false; phase.current = true; target.current = 1;
    setStoryEnabled(false); setDashboardVisible(true); renderNow(1); window.scrollTo(0, 0);
  };
  const replay = () => {
    rememberDashboard(false); store.setIsPlaying(false);
    enabled.current = true; phase.current = false; target.current = 0;
    setStoryEnabled(true); setDashboardVisible(false); window.scrollTo(0, 0); renderNow(0);
  };

  useEffect(() => {
    if (!debug) return;
    const api = {
      holdHandoff: (hold: boolean) => { holdHandoff.current = hold; },
      setProgress: (p: number) => {
        if (!track.current) return;
        const range = track.current.offsetHeight - window.innerHeight;
        window.scrollTo(0, Math.max(0, Math.min(1, p)) * range);
        target.current = Math.max(0, Math.min(1, window.scrollY / range));
        if (target.current < 1 && phase.current) { phase.current = false; setDashboardVisible(false); }
        renderNow(target.current);
      },
      snapshot: () => {
        const current = conductorRef.current;
        current?.scene.updateMatrixWorld(true); current?.camera.updateMatrixWorld(true);
        return { p: current?.currentProgress, target: target.current, site: latest.current.currentSite.id,
          date: latest.current.currentEpochDate.toISOString(), dashboard: phase.current,
          lander: current?.lander.group.matrixWorld.elements.slice(), camera: current?.camera.matrixWorld.elements.slice(),
          canvasCount: document.querySelectorAll('.shared-scene-canvas').length,
          factor: current?.skyDome.heightExaggeration };
      }
    };
    (window as any).__lunarDebug = api;
    return () => { delete (window as any).__lunarDebug; };
  }, [debug, renderNow]);

  return <div className={`lunar-experience ${dashboardVisible ? 'at-dashboard' : 'in-story'}`} data-story-enabled={storyEnabled}>
    {storyEnabled && <div ref={track} className="intro-track"><div className="intro-pin">
      <div ref={storyHost} className="intro-scene-host" />
      <HeroOverlay ref={hero} onSkipToDashboard={skip} />
      <ScrollTelemetryHud ref={telemetry} /><MissionCaptionPill ref={caption} />
      <div className="story-dome-labels"><DomeLabels scene={scene} position={store.position} story /></div>
      {error && <p className="story-graphics-error">{error}</p>}
    </div></div>}
    <div className={`dashboard-entry ${storyEnabled ? 'after-story' : ''}`} aria-hidden={!dashboardVisible} ref={node => { if (node) node.inert = !dashboardVisible; }}>
      <AlmanacDashboard store={store} scene={scene} onWatchStory={replay} />
    </div>
    {!dashboardVisible && <a className="story-skip" href="#main" onClick={event => { event.preventDefault(); skip(); }}>Skip to the dashboard</a>}
    {debug && storyEnabled && !dashboardVisible && <label className="story-debug">Scroll progress <output ref={debugValue}>0.000</output><input ref={debugSlider} aria-label="Story progress" type="range" min="0" max="1" step="0.001" defaultValue="0" onChange={event => (window as any).__lunarDebug?.setProgress(Number(event.target.value))} /></label>}
  </div>;
}
