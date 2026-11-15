import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SceneBridge } from '../almanac/SceneBridge';
import { TopocentricResult } from '../../ephemeris/engine';

export function DomeLabels({ scene, position, story = false }: { scene: SceneBridge; position: TopocentricResult; story?: boolean }) {
  const overlay = useRef<HTMLDivElement>(null);
  const sunLabel = useRef<HTMLSpanElement>(null);
  const earthLabel = useRef<HTMLSpanElement>(null);
  const cardinals = useRef<Array<HTMLSpanElement | null>>([]);
  const factor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!scene.conductor) return;
    const conductor = scene.conductor;
    const point = new THREE.Vector3();
    const update = () => {
      if (!overlay.current) return;
      const width = overlay.current.clientWidth, height = overlay.current.clientHeight;
      overlay.current.style.visibility = story && conductor.currentProgress < 0.88 ? 'hidden' : 'visible';
      for (const [node, marker, offset] of [[sunLabel.current, conductor.skyDome.sunMarker, -28], [earthLabel.current, conductor.skyDome.earthMarker, 26]] as const) {
        if (!node) continue;
        marker.getWorldPosition(point); point.project(conductor.camera);
        const x = (point.x + 1) / 2 * width, y = (1 - point.y) / 2 * height;
        const labelWidth = node.offsetWidth;
        node.style.left = Math.max(12, Math.min(width - labelWidth - 12, x - labelWidth / 2)) + 'px';
        node.style.top = Math.max(12, Math.min(height - 34, y + offset)) + 'px';
      }
      [0,90,180,270].forEach((az, index) => {
        const node = cardinals.current[index]; if (!node) return;
        conductor.skyDome.toCartesian(az, 0, 17.4, point); point.project(conductor.camera);
        node.style.left = Math.max(10, Math.min(width - 20, (point.x + 1) / 2 * width)) + 'px';
        node.style.top = Math.max(10, Math.min(height - 20, (1 - point.y) / 2 * height)) + 'px';
      });
      if (factor.current) factor.current.textContent = conductor.skyDome.heightExaggeration > 1
        ? `Heights exaggerated ${conductor.skyDome.heightExaggeration.toFixed(0)}x` : 'Heights at actual scale (1x)';
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
    if (!host || !scene.conductor) return;
    const resize = new ResizeObserver(() => {
      if (host.clientWidth && host.clientHeight && host.querySelector('canvas')) scene.conductor?.onResize();
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
