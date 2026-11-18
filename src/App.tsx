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

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function App() {
  const store = useNavigatorStore();
  const latest = useRef(store); latest.current = store;
  const [skipInitially] = useState(initialSkip);
  const [storyEnabled, setStoryEnabled] = useState(!skipInitially);
  const [dashboardVisible, setDashboardVisible] = useState(skipInitially);
  const [isTransitioning, setIsTransitioning] = useState(false);
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
  const isMorphing = useRef(false);
  const animFrameId = useRef<number | null>(null);
  const debug = new URLSearchParams(window.location.search).get('debug') === '1';

  const renderNow = useCallback((p: number) => {
    const current = conductorRef.current; if (!current) return;
    current.setProgressImmediate(p);
    current.renderer.shadowMap.needsUpdate = true;
    current.renderer.render(current.scene, current.camera);
  }, []);
  const registerDomeHost = useCallback((host: HTMLDivElement | null) => {
    domeHost.current = host;
    if (isMorphing.current) return;
    const current = conductorRef.current;
    const canvas = canvasRef.current;
    if (phase.current && host && canvas) {
      if (canvas.parentElement !== host) {
        host.appendChild(canvas);
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '';
        canvas.style.pointerEvents = 'auto';
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', 'Interactive 3D sky dome; drag to orbit and scroll to zoom.');
      }
      if (current) {
        current.updateContainerObserver(host);
        current.onResize();
        current.ensureAnimationLoop();
        renderNow(1);
      }
    }
  }, [renderNow]);
  const subscribeFrame = useCallback((listener: () => void) => { subscribers.current.add(listener); return () => { subscribers.current.delete(listener); }; }, []);
  const scene: SceneBridge = useMemo(() => ({ conductor, error, registerDomeHost, subscribeFrame }), [conductor, error, registerDomeHost, subscribeFrame]);
  const attachCanvas = useCallback(() => {
    if (isMorphing.current) return;
    const current = conductorRef.current, canvas = canvasRef.current;
    const host = phase.current ? domeHost.current : storyHost.current;
    if (!current || !canvas || !host) return;
    if (canvas.parentElement !== host) host.appendChild(canvas);
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '';
    canvas.style.pointerEvents = phase.current ? 'auto' : 'none';
    canvas.tabIndex = phase.current ? 0 : -1;
    canvas.setAttribute('aria-label', phase.current ? 'Interactive 3D sky dome; drag to orbit and scroll to zoom.' : 'Scroll-driven rocket launch story.');
    current.updateContainerObserver(host);
    current.onResize();
    current.ensureAnimationLoop();
    renderNow(phase.current ? 1 : target.current);
  }, [renderNow]);

  useEffect(() => {
    const canvas = document.createElement('canvas'); canvas.className = 'shared-scene-canvas'; canvas.tabIndex = 0;
    canvasRef.current = canvas;
    const host = phase.current ? domeHost.current : storyHost.current;
    if (host) host.appendChild(canvas);
    let current: ThreeConductor;
    try { current = new ThreeConductor(canvas); } catch {
      setError('3D is unavailable in this browser. The panorama and computed readouts remain available.'); canvas.remove(); return;
    }
    conductorRef.current = current;
    // This is the instrument's orbit framing; the flight/camera kinematic functions remain unchanged.
    current.domeZoom = 44;
    applyFieldTheme(current);
    if (host) current.updateContainerObserver(host);
    current.onBeforeRender = () => {
      current.atmosphere.starfield.visible = current.currentProgress < 0.86;
      const vh = canvas.parentElement?.clientHeight || canvas.clientHeight || window.innerHeight;
      current.skyDome.prepareView(current.camera, vh);
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
      if (enabled.current && !phase.current && p === 1 && target.current === 1 && !holdHandoff.current && !isMorphing.current) {
        startTransitionToDashboard();
      }
    };
    renderNow(target.current); setConductor(current);
    if (skipInitially) rememberDashboard(true);
    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      current.destroy();
      canvas.remove();
      conductorRef.current = null;
    };
  }, []);

  useLayoutEffect(attachCanvas, [dashboardVisible, storyEnabled, conductor, store.activeTab, attachCanvas]);

  // Decoupled sub-effects: horizon profile updates only when site changes
  useLayoutEffect(() => {
    if (!conductor) return;
    conductor.skyDome.setHeightExaggeration(Math.abs(store.currentSite.lat) > 80 ? 8 : 1);
    conductor.updateHorizonProfile(store.horizonManager);
    renderNow(phase.current ? 1 : target.current);
  }, [conductor, store.currentSite, store.horizonManager, renderNow]);

  // Trail path updates only when store.trail changes
  useLayoutEffect(() => {
    if (!conductor) return;
    conductor.updateSkyDomePaths(store.trail);
    renderNow(phase.current ? 1 : target.current);
  }, [conductor, store.trail, renderNow]);

  // Sky dome positions update when store.position changes
  useLayoutEffect(() => {
    if (!conductor) return;
    conductor.updateSkyDomePositions(store.position.sun, store.position.earth);
    renderNow(phase.current ? 1 : target.current);
  }, [conductor, store.position, renderNow]);

  useEffect(() => {
    const scroll = () => {
      if (isMorphing.current) return;
      if (!enabled.current || !track.current) return;
      const range = track.current.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, range > 0 ? window.scrollY / range : 0));
      target.current = p;
      if (p < 1 && phase.current) { phase.current = false; setDashboardVisible(false); }
      const current = conductorRef.current;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) renderNow(p);
      else current?.setScrollProgress(p);
    };

    const origScrollTo = window.scrollTo.bind(window);
    window.scrollTo = function(...args: any[]) {
      origScrollTo.apply(window, args as any);
      scroll();
    };

    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', scroll);
    return () => {
      window.scrollTo = origScrollTo;
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', scroll);
    };
  }, [renderNow]);

  const skipImmediate = useCallback(() => {
    if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    isMorphing.current = false;
    setIsTransitioning(false);
    rememberDashboard(true);
    store.setIsPlaying(false);
    enabled.current = false;
    phase.current = true;
    target.current = 1;

    const canvas = canvasRef.current;
    const dome = domeHost.current;
    if (canvas && dome && canvas.parentElement !== dome) {
      dome.appendChild(canvas);
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.zIndex = '';
      canvas.style.pointerEvents = 'auto';
      canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', 'Interactive 3D sky dome; drag to orbit and scroll to zoom.');
    }

    setStoryEnabled(false);
    setDashboardVisible(true);

    const current = conductorRef.current;
    if (current) {
      if (dome) current.updateContainerObserver(dome);
      current.setProgressImmediate(1);
      current.onResize();
      current.ensureAnimationLoop();
      renderNow(1);
    }

    window.scrollTo(0, 0);
  }, [renderNow, store]);

  const startTransitionToDashboard = useCallback(() => {
    if (isMorphing.current || phase.current) return;

    const current = conductorRef.current;
    const canvas = canvasRef.current;
    const dome = domeHost.current;
    if (!current || !canvas || !dome) {
      skipImmediate();
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      skipImmediate();
      return;
    }

    isMorphing.current = true;
    setIsTransitioning(true);
    rememberDashboard(true);
    store.setIsPlaying(false);
    enabled.current = false;
    phase.current = true;
    target.current = 1;

    // 1. Advance scene directly to Beat 8 Sky-Dome view
    current.setProgressImmediate(1);

    // 2. Make dashboard visible so DOM measures destination card
    setDashboardVisible(true);

    // 3. Float canvas above all elements in fixed viewport coordinates
    const startTop = 0;
    const startLeft = 0;
    const startWidth = window.innerWidth;
    const startHeight = window.innerHeight;

    if (canvas.parentElement !== document.body) {
      document.body.appendChild(canvas);
    }
    canvas.style.position = 'fixed';
    canvas.style.zIndex = '90';
    canvas.style.pointerEvents = 'none';
    canvas.style.top = `${startTop}px`;
    canvas.style.left = `${startLeft}px`;
    canvas.style.width = `${startWidth}px`;
    canvas.style.height = `${startHeight}px`;

    // 4. Scroll window to top so dashboard header aligns with top
    window.scrollTo(0, 0);

    const duration = 700;
    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / duration);
      const eased = easeInOutCubic(p);

      // Measure target dome bounding box on each frame to accommodate responsive reflow
      const targetRect = dome.getBoundingClientRect();
      const endTop = targetRect && targetRect.width > 0 ? targetRect.top : 240;
      const endLeft = targetRect && targetRect.width > 0 ? targetRect.left : (window.innerWidth - 600) / 2;
      const endWidth = targetRect && targetRect.width > 0 ? targetRect.width : 600;
      const endHeight = targetRect && targetRect.height > 0 ? targetRect.height : 360;

      const curTop = startTop + (endTop - startTop) * eased;
      const curLeft = startLeft + (endLeft - startLeft) * eased;
      const curWidth = Math.max(1, Math.round(startWidth + (endWidth - startWidth) * eased));
      const curHeight = Math.max(1, Math.round(startHeight + (endHeight - startHeight) * eased));

      canvas.style.top = `${curTop}px`;
      canvas.style.left = `${curLeft}px`;
      canvas.style.width = `${curWidth}px`;
      canvas.style.height = `${curHeight}px`;

      current.setExplicitSize(curWidth, curHeight);
      current.skyDome.prepareView(current.camera, curHeight);
      current.renderCinematicSequence(1.0, now);
      current.renderer.render(current.scene, current.camera);

      if (p < 1) {
        animFrameId.current = requestAnimationFrame(frame);
      } else {
        // FLIP complete: dock cleanly into domeHost container
        isMorphing.current = false;
        setIsTransitioning(false);
        setStoryEnabled(false);

        if (dome && canvas.parentElement !== dome) {
          dome.appendChild(canvas);
        }
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '';
        canvas.style.pointerEvents = 'auto';
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', 'Interactive 3D sky dome; drag to orbit and scroll to zoom.');

        current.updateContainerObserver(dome);
        current.onResize();
        current.ensureAnimationLoop();
        renderNow(1);
      }
    };

    animFrameId.current = requestAnimationFrame(frame);
  }, [renderNow, store, skipImmediate]);

  const skip = useCallback(() => {
    startTransitionToDashboard();
  }, [startTransitionToDashboard]);

  const replay = useCallback(() => {
    if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    isMorphing.current = false;
    setIsTransitioning(false);
    rememberDashboard(false);
    store.setIsPlaying(false);
    enabled.current = true;
    phase.current = false;
    target.current = 0;

    const canvas = canvasRef.current;
    const story = storyHost.current;
    if (canvas && story && canvas.parentElement !== story) {
      story.appendChild(canvas);
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.zIndex = '';
      canvas.style.pointerEvents = 'none';
      canvas.tabIndex = -1;
      canvas.setAttribute('aria-label', 'Scroll-driven rocket launch story.');
    }

    setStoryEnabled(true);
    setDashboardVisible(false);
    window.scrollTo(0, 0);

    const current = conductorRef.current;
    if (current) {
      if (story) current.updateContainerObserver(story);
      current.setProgressImmediate(0);
      current.onResize();
      current.ensureAnimationLoop();
      renderNow(0);
    }
  }, [renderNow, store]);

  useEffect(() => {
    if (!debug) return;
    const api = {
      holdHandoff: (hold: boolean) => {
        holdHandoff.current = hold;
        if (conductorRef.current) {
          conductorRef.current.isTestingDeterministic = hold;
        }
      },
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
        if (current) {
          current.setSimTime(current.currentProgress * 20.0);
          current.renderCinematicSequence(current.currentProgress, current.currentProgress * 20000);
          current.renderer.render(current.scene, current.camera);
        }
        current?.scene.updateMatrixWorld(true); current?.camera.updateMatrixWorld(true);
        return { p: current?.currentProgress, target: target.current, site: latest.current.currentSite.id,
          date: latest.current.currentEpochDate.toISOString(), dashboard: phase.current,
          lander: current?.lander.group.matrixWorld.elements.slice(), camera: current?.camera.matrixWorld.elements.slice(),
          canvasCount: document.querySelectorAll('.shared-scene-canvas').length,
          factor: current?.skyDome.heightExaggeration };
      }
    };
    (window as any).__lunarDebug = api;
    (window as any).__lunarConductor = conductorRef.current;
    return () => {
      delete (window as any).__lunarDebug;
      delete (window as any).__lunarConductor;
    };
  }, [debug, renderNow]);

  return <div className={`lunar-experience ${dashboardVisible ? 'at-dashboard' : 'in-story'} ${isTransitioning ? 'is-morphing-to-dashboard' : ''}`} data-story-enabled={storyEnabled}>
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
