import * as THREE from 'three';
import { RocketModel } from './models/RocketModel';
import { LanderModel } from './models/LanderModel';
import { LunarSurface } from './models/LunarSurface';
import { AtmosphereStars } from './models/AtmosphereStars';
import { ParticleSystems } from './models/ParticleSystems';
import { SkyDomeScene } from './skydome/SkyDomeScene';
import { HorizonManager } from '../terrain/horizon';
import { EphemerisSample, CelestialBodyPos } from '../types';
import {
  computeCraftState,
  computeCameraState,
  RocketDimensions,
  CraftState,
  CameraState,
  ROCKET_DIMS,
  seg,
  ease
} from './kinematics/flightKinematics';

export class ThreeConductor {
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;

  // Scene Components (One unified craft rig)
  public rocket: RocketModel;
  public lander: LanderModel;
  public surface: LunarSurface;
  public atmosphere: AtmosphereStars;
  public particles: ParticleSystems;
  public skyDome: SkyDomeScene;

  // Progress state
  public scrollProgress: number = 0; // Target progress (driven by scroll)
  public currentProgress: number = 0; // Frame-rate independent exponential damped progress
  private isDestroyed: boolean = false;
  private isContextLost: boolean = false;
  private animFrameId: number | null = null;
  private lastTimeMs: number = 0;
  public simTimeSec: number = 0;
  public isTestingDeterministic: boolean = false;
  private width: number = 0;
  private height: number = 0;
  private resizeObserver: ResizeObserver | null = null;
  private containerObserver: ResizeObserver | null = null;

  // Orbit / Interaction in Sky-Dome mode
  public isDomeInteractive: boolean = false;
  public domeYaw: number = 0.5;   // Radians
  public domePitch: number = 0.38; // Radians
  public domeZoom: number = 32.0; // Camera distance
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  // GPU & Shadow tracking
  private lastRenderedProgress: number = -1;
  private shadowNeedsUpdate: boolean = true;

  // Decoupled frame progress listener callback
  public onFrameProgress?: (currentP: number, targetP: number) => void;
  public onBeforeRender?: (currentP: number) => void;

  // Pre-allocated scratch objects for zero GC in the render loop
  private readonly craftDims: RocketDimensions;
  private readonly _craftState: CraftState;
  private readonly _cameraState: CameraState;
  private readonly _craftWorldPos = new THREE.Vector3();
  private readonly _craftWorldQuat = new THREE.Quaternion();
  private readonly _sunDir = new THREE.Vector3();
  private readonly _skyColor = new THREE.Color();
  private readonly _dawnColor = new THREE.Color(0x070b14);
  private readonly _spaceColor = new THREE.Color(0x020306);
  private readonly _earthSunDir = new THREE.Vector3();
  private readonly _domeOrbit = { yaw: 0.5, pitch: 0.38, zoom: 32.0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.width = canvas.clientWidth || window.innerWidth;
    this.height = canvas.clientHeight || window.innerHeight;

    // Renderer: clamp pixel ratio to 2 to prevent 4K/Retina fill-rate bottlenecks
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Shadow maps: autoUpdate disabled during static orbital phases to conserve GPU fill rate
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b14);
    this.scene.fog = new THREE.FogExp2(0x070b14, 0.0032);

    this.camera = new THREE.PerspectiveCamera(46, this.width / (this.height || 1), 0.1, 1500);
    this.camera.position.set(0, 5, 24);

    // Single Lander instance shared across entire journey & Sky-Dome
    this.lander = new LanderModel();

    // Single Craft Rig with lander stowed inside from frame 0
    this.rocket = new RocketModel(this.lander);
    this.rocket.registerScene(this.scene);

    this.surface = new LunarSurface();
    this.atmosphere = new AtmosphereStars();
    this.particles = new ParticleSystems();
    this.skyDome = new SkyDomeScene();

    this.scene.add(this.atmosphere.group);
    this.scene.add(this.particles.group);
    this.scene.add(this.surface.group);
    this.scene.add(this.rocket.craftRig);
    this.scene.add(this.skyDome.group);

    // Pre-allocate dimensions and scratch state objects
    this.craftDims = {
      boosterHeight: this.rocket.boosterHeight,
      boosterRadius: this.rocket.boosterRadius,
      interstageHeight: this.rocket.interstageHeight,
      upperStageHeight: this.rocket.upperStageHeight,
      adapterHeight: this.rocket.adapterHeight,
      fairingHeight: this.rocket.fairingHeight,
      fairingRadius: this.rocket.fairingRadius,
      totalHeight: this.rocket.totalHeight,
      stackLanderOffset: this.rocket.stackLanderOffset
    };

    this._craftState = computeCraftState(0, this.craftDims);
    this._cameraState = computeCameraState(0, this.craftDims, 46, this.width / (this.height || 1), false);

    // Warm up and precompile all shaders
    this.precompileShaders();

    this.bindEvents();
    this.renderCinematicSequence(0, 0);
    this.animFrameId = requestAnimationFrame(this.animate);
  }

  /**
   * Pre-compile all shaders and textures on initialization so stage separations
   * and Sky-Dome morphs never cause first-frame shader stalls.
   */
  public precompileShaders(): void {
    if (this.isDestroyed || !this.renderer) return;

    // Temporarily make all components visible for shader warmup
    const prevVis = {
      surface: this.surface.group.visible,
      landingTerrain: this.surface.landingTerrain.visible,
      domeBaseDisc: this.surface.domeBaseDisc.visible,
      horizonWall: this.surface.horizonWallMesh ? this.surface.horizonWallMesh.visible : false,
      skyDome: this.skyDome.group.visible,
      approachMoon: this.atmosphere.approachMoon.visible,
      distantEarth: this.atmosphere.distantEarth.visible,
      cloudLayers: this.atmosphere.cloudLayers.visible,
      launchGround: this.atmosphere.launchGround.visible
    };

    this.surface.group.visible = true;
    this.surface.landingTerrain.visible = true;
    this.surface.domeBaseDisc.visible = true;
    if (this.surface.horizonWallMesh) this.surface.horizonWallMesh.visible = true;
    this.skyDome.group.visible = true;
    this.atmosphere.approachMoon.visible = true;
    this.atmosphere.distantEarth.visible = true;
    this.atmosphere.cloudLayers.visible = true;
    this.atmosphere.launchGround.visible = true;

    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);

    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      // Safe fallback if headless test mock
    }

    // Restore nominal initial visibility for p = 0
    this.surface.group.visible = prevVis.surface;
    this.surface.landingTerrain.visible = prevVis.landingTerrain;
    this.surface.domeBaseDisc.visible = prevVis.domeBaseDisc;
    if (this.surface.horizonWallMesh) this.surface.horizonWallMesh.visible = prevVis.horizonWall;
    this.skyDome.group.visible = prevVis.skyDome;
    this.atmosphere.approachMoon.visible = prevVis.approachMoon;
    this.atmosphere.distantEarth.visible = prevVis.distantEarth;
    this.atmosphere.cloudLayers.visible = prevVis.cloudLayers;
    this.atmosphere.launchGround.visible = prevVis.launchGround;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.currentProgress >= 0.86) {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    this.domeYaw += dx * 0.007;
    this.domePitch = Math.max(-0.08, Math.min(1.4, this.domePitch + dy * 0.007));
    this.shadowNeedsUpdate = true;
  };

  private stopDrag = (): void => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.currentProgress >= 0.86) {
      e.preventDefault();
      this.domeZoom = Math.max(16, Math.min(50, this.domeZoom + (e.deltaY > 0 ? 1.8 : -1.8)));
      this.shadowNeedsUpdate = true;
    }
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.isContextLost = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    console.warn('[ThreeConductor] WebGL Context Lost: rendering paused');
  };

  private onContextRestored = (): void => {
    console.info('[ThreeConductor] WebGL Context Restored: re-initializing WebGL pipeline');
    this.isContextLost = false;
    this.onResize();
    this.precompileShaders();
    this.shadowNeedsUpdate = true;
    this.ensureAnimationLoop();
  };

  private bindEvents(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.onResize();
      });
      this.resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener('resize', this.onResize);
    }

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.stopDrag);
    this.canvas.addEventListener('pointercancel', this.stopDrag);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // WebGL Context Lost / Restored reliability handlers
    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
  }

  /**
   * Re-bind ResizeObserver to the active parent container (e.g. storyHost or domeHost).
   * Ensures that view toggles ('Dome' / 'Both') and responsive grid changes trigger smooth scaling.
   */
  public updateContainerObserver(container: HTMLElement | null): void {
    if (this.isDestroyed || typeof ResizeObserver === 'undefined') return;
    if (this.containerObserver) {
      this.containerObserver.disconnect();
      this.containerObserver = null;
    }
    if (container) {
      this.containerObserver = new ResizeObserver(() => {
        this.onResize();
        this.ensureAnimationLoop();
      });
      this.containerObserver.observe(container);
    }
  }

  /**
   * Ensures the requestAnimationFrame render loop is actively running and not stalled.
   */
  public ensureAnimationLoop(): void {
    if (this.isDestroyed || this.isContextLost) return;
    if (this.animFrameId === null) {
      this.lastTimeMs = performance.now();
      this.animFrameId = requestAnimationFrame(this.animate);
    }
  }

  public onResize = (): void => {
    if (this.isDestroyed || !this.canvas) return;
    const parent = this.canvas.parentElement;
    let w = 0;
    let h = 0;

    if (parent) {
      const rect = parent.getBoundingClientRect();
      w = Math.round(rect.width) || parent.clientWidth;
      h = Math.round(rect.height) || parent.clientHeight;
    }

    if (w <= 0 || h <= 0) {
      w = this.canvas.clientWidth;
      h = this.canvas.clientHeight;
    }

    // If still 0, only fallback to window if the canvas has no parent container
    if (w <= 0 || h <= 0) {
      if (!parent) {
        w = window.innerWidth;
        h = window.innerHeight;
      } else {
        return; // Container is currently hidden or collapsed; keep existing valid projection
      }
    }

    if (this.width === w && this.height === h) return;

    this.width = w;
    this.height = h;
    this.camera.aspect = this.width / (this.height || 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.shadowNeedsUpdate = true;
  };

  /**
   * Explicitly set dimensions during animated FLIP container transitions
   */
  public setExplicitSize(w: number, h: number): void {
    if (this.isDestroyed || !this.canvas || (this.width === w && this.height === h)) return;
    this.width = w;
    this.height = h;
    this.camera.aspect = this.width / (this.height || 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.shadowNeedsUpdate = true;
  };

  /**
   * Set target scroll progress (0.0 to 1.0)
   */
  public setScrollProgress(progress: number): void {
    this.scrollProgress = Math.max(0, Math.min(1, progress));
  }

  public setSimTime(timeSec: number): void {
    this.simTimeSec = timeSec;
  }

  /**
   * Set progress immediately without damping (100% deterministic for tests & scrub)
   */
  public setProgressImmediate(progress: number): void {
    this.scrollProgress = Math.max(0, Math.min(1, progress));
    this.currentProgress = this.scrollProgress;
    this.simTimeSec = this.scrollProgress * 20.0;
    this.shadowNeedsUpdate = true;
    this.renderCinematicSequence(this.currentProgress, 0);
    this.onBeforeRender?.(this.currentProgress);
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    if (this.onFrameProgress) {
      this.onFrameProgress(this.currentProgress, this.scrollProgress);
    }
  }

  /**
   * Alias for setProgressImmediate
   */
  public setProgressInstant(progress: number): void {
    this.setProgressImmediate(progress);
  }

  public updateHorizonProfile(hm: HorizonManager): void {
    this.surface.updateHorizonWall(hm);
    this.skyDome.updateHorizon(hm.getProfile());
    this.shadowNeedsUpdate = true;
  }

  public updateSkyDomePaths(samples: EphemerisSample[]): void {
    this.skyDome.updatePaths(samples);
  }

  public updateSkyDomePositions(sun: CelestialBodyPos, earth: CelestialBodyPos): void {
    this.skyDome.updatePositions(sun, earth);
    if (this.currentProgress >= 0.86 && sun.el > -4) {
      this.skyDome.toCartesian(sun.az, Math.max(0.5, sun.el), 45, this._sunDir);
      this.atmosphere.directionalSun.position.copy(this._sunDir);
      this.shadowNeedsUpdate = true;
    }
  }

  /**
   * Animation & Render Loop with Exponential Damping & Zero GC
   */
  private animate = (timeMs: number): void => {
    if (this.isDestroyed || this.isContextLost) return;
    this.animFrameId = requestAnimationFrame(this.animate);

    const dt = this.lastTimeMs > 0 ? Math.min((timeMs - this.lastTimeMs) / 1000, 0.1) : 0.016;
    this.lastTimeMs = timeMs;
    if (this.isTestingDeterministic) {
      this.simTimeSec = this.currentProgress * 20.0;
    } else {
      this.simTimeSec += dt;
    }

    // Frame-rate independent exponential damping for buttery-smooth camera and craft interpolation
    // currentP += (targetP - currentP) * (1 - Math.exp(-lambda * dt))
    const lambda = 10.0;
    const factor = 1 - Math.exp(-lambda * dt);
    this.currentProgress += (this.scrollProgress - this.currentProgress) * factor;

    if (Math.abs(this.scrollProgress - this.currentProgress) < 0.0001) {
      this.currentProgress = this.scrollProgress;
    }

    // Dynamic shadow updates: only when craft or light vectors actively change
    // Render the final settled shadow at the exact p too; a threshold can retain a history-dependent shadow.
    const hasProgressMoved = this.currentProgress !== this.lastRenderedProgress;
    const isShadowPhase = this.currentProgress < 0.38 || this.currentProgress >= 0.70;

    if (hasProgressMoved && isShadowPhase) {
      this.renderer.shadowMap.needsUpdate = true;
    } else if (this.shadowNeedsUpdate) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowNeedsUpdate = false;
    }

    this.renderCinematicSequence(this.currentProgress, timeMs);
    this.onBeforeRender?.(this.currentProgress);
    this.renderer.render(this.scene, this.camera);
    this.lastRenderedProgress = this.currentProgress;

    // Notify decoupled React UI subscribers
    if (this.onFrameProgress) {
      this.onFrameProgress(this.currentProgress, this.scrollProgress);
    }
  };

  /**
   * Orchestrates the 8 continuous flight beats along p in [0, 1].
   * Pure deterministic function of p for 100% reversible scrubbing.
   * Zero GC: no object allocations in loop!
   */
  public renderCinematicSequence(p: number, _timeMs: number = 0): void {
    // ----------------------------------------------------
    // Dynamic Sky Atmosphere & Lighting Transition
    // ----------------------------------------------------
    // 0-35%: Dawn atmosphere (#1e3a8a) -> Space black (#030712)
    const atmoMix = ease(seg(p, 0.12, 0.35));
    this._skyColor.copy(this._dawnColor).lerp(this._spaceColor, atmoMix);
    this.scene.background = this._skyColor;

    // Subtle distance fog: softens the night-launch horizon at Beat 0 (#070b14)
    // and dissolves into vacuum during ascent (p = 0.12 -> 0.32)
    if (this.scene.fog) {
      const atmoFade = 1.0 - seg(p, 0.12, 0.32);
      (this.scene.fog as THREE.FogExp2).density = 0.0032 * atmoFade;
      (this.scene.fog as THREE.FogExp2).color.copy(this._skyColor);
    }

    // Stars: visible at Beat 0 night launch (#070b14 fading into a faint starfield), staying crisp in space
    const nightStars = 0.38 * (1 - seg(p, 0.06, 0.16));
    const spaceStars = seg(p, 0.18, 0.40) * (1 - seg(p, 0.88, 0.98) * 0.3);
    const starsOpacity = Math.max(nightStars, spaceStars);
    (this.atmosphere.starfield.material as THREE.PointsMaterial).opacity = starsOpacity;

    // Hard vacuum lighting transition (harsh contrast, near-zero ambient, pure solar key)
    if (p < 0.55) {
      const atmoTrans = seg(p, 0.12, 0.35);
      this.atmosphere.ambientLight.color.setHex(0xece8dd);
      this.atmosphere.ambientLight.intensity = THREE.MathUtils.lerp(0.55, 0.18, atmoTrans);
      this.atmosphere.directionalSun.color.setHex(0xece8dd);
      this.atmosphere.directionalSun.intensity = THREE.MathUtils.lerp(2.5, 3.5, atmoTrans);
      this.atmosphere.directionalSun.position.set(35, 45, 25);
      this.atmosphere.rimLight.intensity = (1 - seg(p, 0.20, 0.45)) * 0.8;
    } else {
      // Hard vacuum lunar phase: deep inky space shadow, harsh directional solar beam
      const moonTrans = seg(p, 0.55, 0.65);
      this.atmosphere.ambientLight.color.setHex(0x8f8b80);
      this.atmosphere.ambientLight.intensity = THREE.MathUtils.lerp(0.18, 0.012, moonTrans);
      this.atmosphere.directionalSun.color.setHex(0xfffaed);
      this.atmosphere.directionalSun.intensity = THREE.MathUtils.lerp(3.5, 4.8, moonTrans);
      // Subtle upward-facing soft fill light (Moon-bounce light under the lander)
      this.atmosphere.moonBounceLight.intensity = THREE.MathUtils.lerp(0.0, 0.45, moonTrans);
      if (p < 0.75) {
        // Oblique dramatic space sun angle for high-relief terminator shadows across Moon globe
        this.atmosphere.directionalSun.position.set(48, 22, 10);
      } else {
        // Low grazing polar sunlight angle (~7.5° elevation) for dramatic black shadows across regolith
        this.atmosphere.directionalSun.position.set(38, 5.8, 22);
      }
      this.atmosphere.rimLight.intensity = 0.0;
    }

    if (p < 0.55) {
      this.atmosphere.moonBounceLight.intensity = 0.0;
    }

    // ----------------------------------------------------
    // UNIFIED CRAFT & STAGE KINEMATICS (Zero Allocations)
    // ----------------------------------------------------
    computeCraftState(p, this.craftDims, this._craftState);

    // Dynamic upward-facing Moon-bounce light follows directly beneath lander
    if (p >= 0.55) {
      this.atmosphere.moonBounceLight.target.position.copy(this._craftState.landerWorldPos);
      this.atmosphere.moonBounceLight.position.set(
        this._craftState.landerWorldPos.x,
        this._craftState.landerWorldPos.y - 20,
        this._craftState.landerWorldPos.z
      );
    }

    // Apply rig position & orientation
    this.rocket.craftRig.position.copy(this._craftState.craftRigPos);
    this.rocket.craftRig.rotation.copy(this._craftState.craftRigRot);

    this.rocket.craftRig.getWorldPosition(this._craftWorldPos);
    this.rocket.craftRig.getWorldQuaternion(this._craftWorldQuat);

    // Deterministic staging separations (booster, fairings, upper stage)
    this.rocket.updateSeparations(p, this._craftWorldPos, this._craftWorldQuat);

    // Animate launch pad (swing arms, clamps, vapor venting, floodlights, ignition light)
    this.atmosphere.updatePad(p, this.simTimeSec);

    // Launch ground pad & gantry tower recede below during ascent
    const padDrop = ease(seg(p, 0.08, 0.35)) * 50;
    this.atmosphere.launchGround.position.set(this._craftState.craftRigPos.x, -padDrop, 0);
    this.atmosphere.launchGround.visible = p < 0.38;

    // Clouds thin and drop with parallax
    const cloudDrop = ease(seg(p, 0.12, 0.35)) * 40;
    this.atmosphere.cloudLayers.position.y = -cloudDrop;
    this.atmosphere.cloudLayers.visible = p < 0.38;

    // ----------------------------------------------------
    // BEAT 1 & 2: LIFTOFF & ASCENT (0.06 - 0.35)
    // ----------------------------------------------------
    // Ignition begins at p = 0.06 on pad, spools to full thrust, MECO at p = 0.35
    const boosterThrust = seg(p, 0.06, 0.12) * (1 - seg(p, 0.33, 0.35));
    this.rocket.setBoosterThrust(boosterThrust);

    // Earth launch fire and smoke simulation (booster flame jet, expanding grey plumes, pad steam & ascent wake)
    this.particles.updateEarthLaunch(
      p,
      this._craftState.craftRigPos.x,
      this._craftState.craftRigPos.y,
      this._craftState.craftRigPos.z,
      boosterThrust,
      padDrop,
      this.simTimeSec
    );

    // ----------------------------------------------------
    // BEAT 3: BOOSTER MECO & VACUUM IGNITION (0.35 - 0.45)
    // ----------------------------------------------------
    const upperThrust = seg(p, 0.35, 0.39) * (1 - seg(p, 0.53, 0.55));
    this.rocket.setUpperThrust(upperThrust);

    // Receding photorealistic Blue Marble Earth in the distant background (Beats 3/4 to 5, p: 0.38 to 0.68)
    // Strictly hidden during Launch and Ascent (Beats 0-2, p < 0.38) while booster ascends above ground horizon
    const isEarthVisible = p >= 0.38 && p < 0.68;
    this.atmosphere.distantEarth.visible = isEarthVisible;

    if (isEarthVisible) {
      const earthProgress = seg(p, 0.38, 0.68);
      const earthScale = THREE.MathUtils.lerp(1.10, 0.22, ease(earthProgress));
      const earthX = THREE.MathUtils.lerp(-16, -34, earthProgress);
      const earthY = THREE.MathUtils.lerp(this._craftState.landerWorldPos.y - 8, this._craftState.landerWorldPos.y + 12, earthProgress);
      const earthZ = THREE.MathUtils.lerp(-55, -260, ease(earthProgress));
      this.atmosphere.distantEarth.scale.set(earthScale, earthScale, earthScale);
      this.atmosphere.distantEarth.position.set(earthX, earthY, earthZ);

      // Smooth fade-in as spacecraft climbs out of Earth orbit into deep space
      const fadeIn = seg(p, 0.38, 0.44);

      // Continuous axial rotation for Earth and atmospheric clouds (clouds drift slightly faster)
      if (this.atmosphere.distantEarthMesh) {
        this.atmosphere.distantEarthMesh.rotation.y = -Math.PI * 0.35 + this.simTimeSec * 0.008;
      }
      if (this.atmosphere.earthCloudsMesh) {
        this.atmosphere.earthCloudsMesh.rotation.y = -Math.PI * 0.35 + this.simTimeSec * 0.012;
      }

      // Update atmospheric Fresnel halo shader uniforms with Sun direction and opacity
      this._earthSunDir.set(45 - earthX, 50 - earthY, 35 - earthZ).normalize();
      this.atmosphere.distantEarth.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
          if (obj.material.uniforms?.uSunDirection) {
            obj.material.uniforms.uSunDirection.value.copy(this._earthSunDir);
          }
          if (obj.material.uniforms?.uOpacity) {
            obj.material.uniforms.uOpacity.value = fadeIn;
          }
        }
      });
    }

    // ----------------------------------------------------
    // BEAT 4, 5 & 6: APPROACH MOON & POWERED DESCENT (0.50 - 0.82)
    // ----------------------------------------------------
    // Photorealistic NASA LRO Moon globe: grows in deep space during translunar cruise (0.50 - 0.62)
    // and scales up smoothly during low-altitude descent, crossfading into the detailed 3D landing site
    this.atmosphere.approachMoon.visible = p >= 0.50 && p < 0.82;
    if (this.atmosphere.approachMoon.visible) {
      let moonScale = 0.20;
      let moonY = 0;
      let moonZ = -240.0;

      if (p < 0.62) {
        // Deep-space translunar approach (0.50 -> 0.62):
        // Moon globe grows from distant speck to lunar orbit entry
        const approachT = seg(p, 0.50, 0.62);
        moonScale = THREE.MathUtils.lerp(0.20, 2.0, Math.pow(approachT, 1.5));
        const moonR = 22.0 * moonScale;
        const crestOffsetY = THREE.MathUtils.lerp(18.0, 7.5, ease(approachT));
        const horizonCrestY = this._craftState.landerWorldPos.y - crestOffsetY;
        moonY = horizonCrestY - moonR;
        moonZ = THREE.MathUtils.lerp(-240.0, -95.0, ease(approachT));
        if (this.atmosphere.moonMat) this.atmosphere.moonMat.opacity = 1.0;
      } else {
        // Beat 6: Low-altitude lunar powered descent (0.62 -> 0.80, altitude 15.0 km -> 500 m)
        // Scale up Moon sphere to fill the lower half of the viewport while preventing texture blur
        const descentT = seg(p, 0.62, 0.80);
        moonScale = THREE.MathUtils.lerp(2.0, 6.2, ease(descentT));
        const moonR = 22.0 * moonScale;

        // Crest of the lunar horizon stays framed directly below the descending lander and matches local terrain
        const crestOffsetY = THREE.MathUtils.lerp(7.5, 0.35, ease(descentT));
        const horizonCrestY = this._craftState.landerWorldPos.y - crestOffsetY;
        moonY = horizonCrestY - moonR;

        // Front of lunar globe stays at optimal focus distance to preserve high-res crater details
        const targetMoonZ = this._craftState.landerWorldPos.z - 18.0 - moonR * 0.15;
        moonZ = THREE.MathUtils.lerp(-95.0, targetMoonZ, ease(descentT));

        // Seamless crossfade across the final 30% of Beat 6 into Beat 7 (0.74 -> 0.82)
        if (p >= 0.74) {
          const crossfade = seg(p, 0.74, 0.82);
          if (this.atmosphere.moonMat) {
            this.atmosphere.moonMat.opacity = Math.max(0.0, 1.0 - ease(crossfade));
          }
        } else {
          if (this.atmosphere.moonMat) this.atmosphere.moonMat.opacity = 1.0;
        }
      }

      this.atmosphere.approachMoon.scale.set(moonScale, moonScale, moonScale);
      this.atmosphere.approachMoon.position.set(0, moonY, moonZ);
    }

    // Subtle dashed orbital trajectory arc during trans-lunar cruise
    const isCruise = p >= 0.48 && p < 0.65;
    this.atmosphere.translunarTrajectory.visible = isCruise;
    if (isCruise) {
      const trajFade = seg(p, 0.48, 0.53) * (1 - seg(p, 0.61, 0.65));
      (this.atmosphere.translunarTrajectory.material as THREE.LineDashedMaterial).opacity = 0.45 * trajFade;
    }

    // Gentle starfield parallax during deep-space travel (10,000+ km/h)
    if (p >= 0.45 && p <= 0.65) {
      const cruiseT = seg(p, 0.45, 0.65);
      this.atmosphere.starfield.position.z = -(cruiseT - 0.5) * 55.0;
      this.atmosphere.starfield.position.y = -(cruiseT - 0.5) * 18.0;
    } else {
      this.atmosphere.starfield.position.set(0, 0, 0);
    }

    // Lander deployment state
    this.lander.setDeploy(this._craftState.deployProgress);
    this.lander.setEngineFacing(this._craftState.engineFacing);
    this.lander.setThrottle(this._craftState.throttle);
    this.lander.setLegCompression(this._craftState.legCompression);

    // Dynamic spacecraft rim lighting: subtle fill during Beat 5 coasting so dark solar wings,
    // engine bell, and gold foil facets remain crisp against deep space
    if (p < 0.45) {
      this.lander.spacecraftRimLight.intensity = 0.0;
    } else if (p < 0.70) {
      this.lander.spacecraftRimLight.intensity = THREE.MathUtils.lerp(0.6, 1.25, seg(p, 0.45, 0.58));
    } else if (p < 0.86) {
      this.lander.spacecraftRimLight.intensity = THREE.MathUtils.lerp(1.25, 0.65, seg(p, 0.70, 0.85));
    } else {
      this.lander.spacecraftRimLight.intensity = 0.65;
    }

    // ----------------------------------------------------
    // BEAT 6 & 7: SEAMLESS CROSSFADE TO DETAILED 3D LANDING SITE TERRAIN
    // ----------------------------------------------------
    // Smooth crossfade across final 30% of Beat 6 into Beat 7 (0.74 -> 0.82)
    this.surface.group.visible = p >= 0.74;
    this.surface.landingTerrain.position.y = 0;

    if (p >= 0.74 && p < 0.82) {
      const terrainFade = ease(seg(p, 0.74, 0.81));
      (this.surface.landingTerrain.material as THREE.Material).opacity = terrainFade;
      if (this.surface.boulderMesh) {
        (this.surface.boulderMesh.material as THREE.Material).opacity = terrainFade;
      }
    } else if (p >= 0.82) {
      (this.surface.landingTerrain.material as THREE.Material).opacity = 1.0;
      if (this.surface.boulderMesh) {
        (this.surface.boulderMesh.material as THREE.Material).opacity = 1.0;
      }
    }

    // ----------------------------------------------------
    // BEAT 7: TOUCHDOWN & SOFT STREAMING REGOLITH DUST (0.80 - 0.86)
    // ----------------------------------------------------
    this.particles.updateDust(p >= 0.80 && p < 0.86, 0, 0.05, 0, this.simTimeSec);

    // ----------------------------------------------------
    // BEAT 8: SKY-DOME DASHBOARD MORPH (0.86 - 1.00)
    // ----------------------------------------------------
    const domeMorph = ease(seg(p, 0.86, 0.98));
    this.surface.setMorphProgress(domeMorph);
    this.skyDome.group.visible = domeMorph > 0.05;
    // Keep dome wireframe fully expanded so it never crushes/shrinks around the lander
    this.skyDome.domeWireframeGroup.scale.set(1.0, 1.0, 1.0);
    this.isDomeInteractive = p >= 0.86;

    // Reparent lander preserving single persistent instance
    if (p >= 0.86) {
      if (this.lander.group.parent !== this.skyDome.group) {
        this.skyDome.group.add(this.lander.group);
      }
      const landerY = THREE.MathUtils.lerp(0.85, 0.085, domeMorph);
      this.lander.group.position.set(0, landerY, 0);
      this.lander.group.rotation.set(0, 0, 0);
      this.lander.group.scale.set(this._craftState.landerScale, this._craftState.landerScale, this._craftState.landerScale);
    } else if (p >= 0.55) {
      if (this.lander.group.parent !== this.scene) {
        this.scene.add(this.lander.group);
      }
      this.lander.group.position.copy(this._craftState.landerWorldPos);
      this.lander.group.rotation.copy(this._craftState.landerWorldRot);
      this.lander.group.scale.set(1.0, 1.0, 1.0);
    } else {
      if (this.lander.group.parent !== this.rocket.payloadAdapter) {
        this.rocket.payloadAdapter.add(this.lander.group);
      }
      this.lander.group.position.set(0, this.rocket.adapterHeight + 0.3, 0);
      this.lander.group.rotation.set(0, 0, 0);
      this.lander.group.scale.set(1.0, 1.0, 1.0);
    }

    // ----------------------------------------------------
    // CAMERA CHOREOGRAPHY (Zero Allocations)
    // ----------------------------------------------------
    const isPortrait = this.width < this.height;
    const aspect = this.width / (this.height || 1);
    this._domeOrbit.yaw = this.domeYaw;
    this._domeOrbit.pitch = this.domePitch;
    this._domeOrbit.zoom = this.domeZoom;

    computeCameraState(
      p,
      this.craftDims,
      46,
      aspect,
      isPortrait,
      this._domeOrbit,
      this._cameraState
    );

    this.camera.position.copy(this._cameraState.position);
    this.camera.lookAt(this._cameraState.lookAt);
  }

  private disposeMaterial(mat: THREE.Material): void {
    const m = mat as any;
    if (m.map) m.map.dispose();
    if (m.lightMap) m.lightMap.dispose();
    if (m.bumpMap) m.bumpMap.dispose();
    if (m.normalMap) m.normalMap.dispose();
    if (m.specularMap) m.specularMap.dispose();
    if (m.roughnessMap) m.roughnessMap.dispose();
    if (m.metalnessMap) m.metalnessMap.dispose();
    if (m.alphaMap) m.alphaMap.dispose();
    mat.dispose();
  }

  public destroy(): void {
    this.isDestroyed = true;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Unbind window & canvas listeners
    if (this.containerObserver) {
      this.containerObserver.disconnect();
      this.containerObserver = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    } else {
      window.removeEventListener('resize', this.onResize);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.canvas.removeEventListener('pointermove', this.onPointerMove);
      this.canvas.removeEventListener('pointerup', this.stopDrag);
      this.canvas.removeEventListener('pointercancel', this.stopDrag);
      this.canvas.removeEventListener('wheel', this.onWheel);
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    }

    // Recursively dispose all GPU geometries, materials, and textures
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => this.disposeMaterial(m));
        } else {
          this.disposeMaterial(mesh.material);
        }
      }
    });

    this.particles.destroy();
    this.skyDome.destroy();
    this.lander.destroy();
    this.renderer.dispose();
  }
}
