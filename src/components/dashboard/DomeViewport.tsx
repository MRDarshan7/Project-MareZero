import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SceneBridge } from '../almanac/SceneBridge';
import { TopocentricResult } from '../../ephemeris/engine';

const _labelPoint = new THREE.Vector3();
const CARDINAL_AZ = [0, 90, 180, 270] as const;

export function DomeLabels({ scene, position, story = false }: { scene: SceneBridge; position: TopocentricResult; story?: boolean }) {
  const overlay = useRef<HTMLDivElement>(null);
  const sunLabel = useRef<HTMLSpanElement>(null);
  const earthLabel = useRef<HTMLSpanElement>(null);
  const cardinals = useRef<Array<HTMLSpanElement | null>>([]);
  const factor = useRef<HTMLSpanElement>(null);
  const labelWidths = useRef({ sun: 100, earth: 100 });
  const lastExaggeration = useRef<number>(-1);

  // Measure label widths when position changes without layout thrashing during animation frames
  useEffect(() => {
    if (sunLabel.current) labelWidths.current.sun = sunLabel.current.offsetWidth || 100;
    if (earthLabel.current) labelWidths.current.earth = earthLabel.current.offsetWidth || 100;
  }, [position]);

  useEffect(() => {
    if (!scene.conductor) return;
    const conductor = scene.conductor;

    const update = () => {
      const host = overlay.current;
      if (!host) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;

      host.style.visibility = story && conductor.currentProgress < 0.88 ? 'hidden' : 'visible';

      // 1. Sun Label
      if (sunLabel.current) {
        conductor.skyDome.sunMarker.getWorldPosition(_labelPoint);
        _labelPoint.project(conductor.camera);
        const x = ((_labelPoint.x + 1) / 2) * width;
        const y = ((1 - _labelPoint.y) / 2) * height;
        const lw = labelWidths.current.sun;
        const offsetX = x < width * 0.45 ? 10 : (x > width * 0.55 ? -lw - 10 : -lw / 2);
        const offsetY = x < width * 0.45 ? -40 : -28;
        sunLabel.current.style.left = Math.max(12, Math.min(width - lw - 12, x + offsetX)) + 'px';
        sunLabel.current.style.top = Math.max(12, Math.min(height - 34, y + offsetY)) + 'px';
      }

      // 2. Earth Label
      if (earthLabel.current) {
        conductor.skyDome.earthMarker.getWorldPosition(_labelPoint);
        _labelPoint.project(conductor.camera);
        const x = ((_labelPoint.x + 1) / 2) * width;
        const y = ((1 - _labelPoint.y) / 2) * height;
        const lw = labelWidths.current.earth;
        const offsetX = x < width * 0.45 ? 14 : (x > width * 0.55 ? -lw - 14 : -lw / 2);
        earthLabel.current.style.left = Math.max(12, Math.min(width - lw - 12, x + offsetX)) + 'px';
        earthLabel.current.style.top = Math.max(12, Math.min(height - 34, y + 26)) + 'px';
      }

      // 3. Cardinal Direction Markers
      for (let index = 0; index < 4; index++) {
        const node = cardinals.current[index];
        if (!node) continue;
        conductor.skyDome.toCartesian(CARDINAL_AZ[index], 0, 16.2, _labelPoint);
        _labelPoint.applyMatrix4(conductor.skyDome.domeWireframeGroup.matrixWorld);
        _labelPoint.project(conductor.camera);
        node.style.left = Math.max(12, Math.min(width - 24, ((_labelPoint.x + 1) / 2) * width)) + 'px';
        node.style.top = Math.max(12, Math.min(height - 24, ((1 - _labelPoint.y) / 2) * height)) + 'px';
      }

      // 4. Height Exaggeration Note
      if (factor.current && conductor.skyDome.heightExaggeration !== lastExaggeration.current) {
        lastExaggeration.current = conductor.skyDome.heightExaggeration;
        factor.current.textContent = conductor.skyDome.heightExaggeration > 1
          ? `Heights exaggerated ${conductor.skyDome.heightExaggeration.toFixed(0)}x` : 'Heights at actual scale (1x)';
      }
    };

    update();
    return scene.subscribeFrame(update);
  }, [scene.conductor, scene.subscribeFrame, position, story]);
  return <div ref={overlay} className="dome-labels" aria-label={`Sun ${position.sun.el.toFixed(1)} degrees, ${position.sun.isBlocked ? 'hidden' : 'visible'}. Earth ${position.earth.el.toFixed(1)} degrees, ${position.earth.isBlocked ? 'hidden' : 'visible'}.`}>
    <span ref={sunLabel} className="celestial-label sun-text">Sun {position.sun.el.toFixed(1)}°{position.sun.isBlocked ? ' · hidden' : ''}</span>
    <span ref={earthLabel} className="celestial-label earth-text">Earth {position.earth.el.toFixed(1)}°{position.earth.isBlocked ? ' · hidden' : ''}</span>
    {['N','E','S','W'].map((label,i) => <span className="dome-cardinal" key={label} ref={node => { cardinals.current[i] = node; }}>{label}</span>)}
    <span ref={factor} className="dome-height-note">Heights exaggerated 8x</span>
  </div>;
}

export function DomeViewport({ scene, position }: { scene: SceneBridge; position: TopocentricResult }) {
  const stage = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    scene.registerDomeHost(host);
    return () => {
      scene.registerDomeHost(null);
    };
  }, [scene.registerDomeHost]);

  useEffect(() => {
    const host = stage.current;
    if (!host || !scene.conductor) return;
    const resize = new ResizeObserver(() => {
      if (host.clientWidth && host.clientHeight) {
        scene.conductor?.onResize();
        scene.conductor?.ensureAnimationLoop();
      }
    });
    resize.observe(host);
    return () => resize.disconnect();
  }, [scene.conductor]);
  const orbit = (delta: number) => { if (scene.conductor) scene.conductor.domeYaw += delta; };
  return <section className="dome-viewport" aria-label="Interactive 3D sky dome">
    <div className="dome-stage" ref={node => { stage.current = node; scene.registerDomeHost(node); }}>
      {scene.error && <p className="scene-error" role="status">{scene.error}</p>}
      {scene.conductor ? <DomeLabels scene={scene} position={position} /> : !scene.error && <p className="scene-error">Loading the 3D view…</p>}
    </div>
    <div className="dome-controls"><span className="muted">Drag to orbit · scroll to zoom</span>
      <button onClick={() => orbit(-0.25)}>Orbit left</button><button onClick={() => orbit(0.25)}>Orbit right</button>
      <button onClick={() => { if (scene.conductor) { scene.conductor.domeYaw = 0.5; scene.conductor.domePitch = 0.38; scene.conductor.domeZoom = 44; } }}>Reset view</button></div>
    <p className="dome-size-note">Discs enlarged equally; Earth is about 3.6x the Sun's diameter.</p>
  </section>;
}
