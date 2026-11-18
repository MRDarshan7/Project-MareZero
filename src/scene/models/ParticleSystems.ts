import * as THREE from 'three';

/**
 * Creates soft, anti-aliased billboarded radial gradient textures
 * for realistic smoke puffs and glowing fire particles.
 */
function createRadialTexture(
  size: number,
  stops: Array<[number, string]>
): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    for (const [offset, color] of stops) {
      grad.addColorStop(offset, color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  } catch {
    return new THREE.Texture();
  }
}

// Fixed relative nozzle coordinates for the 9 booster engines (1 center + 8 outer)
const NOZZLE_OFFSETS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [0.85, 0],
  [-0.85, 0],
  [0, 0.85],
  [0, -0.85],
  [0.6, 0.6],
  [-0.6, 0.6],
  [0.6, -0.6],
  [-0.6, -0.6]
];

/**
 * High-performance, zero-allocation real-time particle system for rocket launch:
 * 1. Glowing orange/yellow flame particles shooting downward from the 9 engine nozzles.
 * 2. Expanding, semi-transparent grey smoke plumes billowing downward in the rocket's wake.
 * 3. Launch pad flame trench steam & ground smoke.
 * 4. Atmospheric ascent column smoke wake.
 * 5. Lunar touchdown dust.
 */
export class ParticleSystems {
  public group: THREE.Group;

  // 1. Glowing Orange/Yellow Flame Particles (Booster Nozzle Exhaust)
  private firePoints: THREE.Points;
  private firePositions: Float32Array;
  private fireColors: Float32Array;
  private fireCount = 550;
  private fireMat: THREE.PointsMaterial;

  // 2. Expanding, Semi-Transparent Grey Smoke Plumes (Exhaust Plume Wake)
  private smokePlumePoints: THREE.Points;
  private smokePlumePositions: Float32Array;
  private smokePlumeColors: Float32Array;
  private smokePlumeCount = 650;
  private smokePlumeMat: THREE.PointsMaterial;

  // 3. Launch Pad Ground Smoke & Steam Cloud (Flame trench & concrete pad)
  private padSmokePoints: THREE.Points;
  private padSmokePositions: Float32Array;
  private padSmokeColors: Float32Array;
  private padSmokeCount = 450;
  private padSmokeMat: THREE.PointsMaterial;

  // 4. Atmospheric Ascent Column Smoke Wake
  private ascentSmokePoints: THREE.Points;
  private ascentSmokePositions: Float32Array;
  private ascentSmokeColors: Float32Array;
  private ascentSmokeCount = 400;
  private ascentSmokeMat: THREE.PointsMaterial;

  // 5. Legacy Booster Plume (Backward compatibility)
  public plumePoints: THREE.Points;
  private plumePositions: Float32Array;
  private plumeCount = 150;
  private plumeMat: THREE.PointsMaterial;

  // 6. Lunar Touchdown Dust Particles
  public dustPoints: THREE.Points;
  private dustPositions: Float32Array;
  private dustCount = 250;
  private dustMat: THREE.PointsMaterial;

  // Reusable procedural textures
  private fireTexture: THREE.Texture | null = null;
  private smokeTexture: THREE.Texture | null = null;
  private dustTexture: THREE.Texture | null = null;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ParticleSystems';

    // Procedural Soft Sprites
    this.fireTexture = createRadialTexture(64, [
      [0.0, 'rgba(255, 255, 255, 1.0)'],
      [0.18, 'rgba(255, 240, 140, 0.98)'],
      [0.45, 'rgba(255, 145, 25, 0.85)'],
      [0.75, 'rgba(235, 55, 10, 0.35)'],
      [1.0, 'rgba(180, 10, 0, 0.0)']
    ]);

    this.smokeTexture = createRadialTexture(64, [
      [0.0, 'rgba(255, 255, 255, 0.92)'],
      [0.25, 'rgba(240, 243, 248, 0.75)'],
      [0.55, 'rgba(215, 222, 232, 0.38)'],
      [0.85, 'rgba(190, 200, 215, 0.08)'],
      [1.0, 'rgba(180, 195, 210, 0.0)']
    ]);

    // Soft Radial Alpha-Gradient Lunar Regolith Dust Sprite
    this.dustTexture = createRadialTexture(64, [
      [0.0, 'rgba(215, 212, 205, 0.95)'],
      [0.25, 'rgba(195, 192, 185, 0.65)'],
      [0.55, 'rgba(184, 180, 172, 0.32)'],
      [0.80, 'rgba(165, 160, 150, 0.10)'],
      [1.0, 'rgba(140, 135, 125, 0.0)']
    ]);

    // ----------------------------------------------------
    // 1. Glowing Orange/Yellow Flame Particles
    // ----------------------------------------------------
    const fireGeo = new THREE.BufferGeometry();
    this.firePositions = new Float32Array(this.fireCount * 3);
    this.fireColors = new Float32Array(this.fireCount * 3);
    fireGeo.setAttribute('position', new THREE.BufferAttribute(this.firePositions, 3));
    fireGeo.setAttribute('color', new THREE.BufferAttribute(this.fireColors, 3));

    this.fireMat = new THREE.PointsMaterial({
      size: 1.85,
      vertexColors: true,
      map: this.fireTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.firePoints = new THREE.Points(fireGeo, this.fireMat);
    this.firePoints.frustumCulled = false;
    this.firePoints.visible = false;
    this.group.add(this.firePoints);

    // ----------------------------------------------------
    // 2. Expanding Semi-Transparent Grey Smoke Plumes
    // ----------------------------------------------------
    const smokePlumeGeo = new THREE.BufferGeometry();
    this.smokePlumePositions = new Float32Array(this.smokePlumeCount * 3);
    this.smokePlumeColors = new Float32Array(this.smokePlumeCount * 3);
    smokePlumeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePlumePositions, 3));
    smokePlumeGeo.setAttribute('color', new THREE.BufferAttribute(this.smokePlumeColors, 3));

    this.smokePlumeMat = new THREE.PointsMaterial({
      size: 5.8,
      vertexColors: true,
      map: this.smokeTexture,
      transparent: true,
      opacity: 0.68,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    this.smokePlumePoints = new THREE.Points(smokePlumeGeo, this.smokePlumeMat);
    this.smokePlumePoints.frustumCulled = false;
    this.smokePlumePoints.visible = false;
    this.group.add(this.smokePlumePoints);

    // ----------------------------------------------------
    // 3. Pad Ground Smoke & Deluge Steam
    // ----------------------------------------------------
    const padSmokeGeo = new THREE.BufferGeometry();
    this.padSmokePositions = new Float32Array(this.padSmokeCount * 3);
    this.padSmokeColors = new Float32Array(this.padSmokeCount * 3);
    padSmokeGeo.setAttribute('position', new THREE.BufferAttribute(this.padSmokePositions, 3));
    padSmokeGeo.setAttribute('color', new THREE.BufferAttribute(this.padSmokeColors, 3));

    this.padSmokeMat = new THREE.PointsMaterial({
      size: 5.5,
      vertexColors: true,
      map: this.smokeTexture,
      transparent: true,
      opacity: 0.72,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    this.padSmokePoints = new THREE.Points(padSmokeGeo, this.padSmokeMat);
    this.padSmokePoints.frustumCulled = false;
    this.padSmokePoints.visible = false;
    this.group.add(this.padSmokePoints);

    // ----------------------------------------------------
    // 4. Atmospheric Ascent Column Smoke Wake
    // ----------------------------------------------------
    const ascSmokeGeo = new THREE.BufferGeometry();
    this.ascentSmokePositions = new Float32Array(this.ascentSmokeCount * 3);
    this.ascentSmokeColors = new Float32Array(this.ascentSmokeCount * 3);
    ascSmokeGeo.setAttribute('position', new THREE.BufferAttribute(this.ascentSmokePositions, 3));
    ascSmokeGeo.setAttribute('color', new THREE.BufferAttribute(this.ascentSmokeColors, 3));

    this.ascentSmokeMat = new THREE.PointsMaterial({
      size: 4.2,
      vertexColors: true,
      map: this.smokeTexture,
      transparent: true,
      opacity: 0.62,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    this.ascentSmokePoints = new THREE.Points(ascSmokeGeo, this.ascentSmokeMat);
    this.ascentSmokePoints.frustumCulled = false;
    this.ascentSmokePoints.visible = false;
    this.group.add(this.ascentSmokePoints);

    // ----------------------------------------------------
    // 5. Legacy Booster Plume Points
    // ----------------------------------------------------
    const plumeGeo = new THREE.BufferGeometry();
    this.plumePositions = new Float32Array(this.plumeCount * 3);
    plumeGeo.setAttribute('position', new THREE.BufferAttribute(this.plumePositions, 3));
    this.plumeMat = new THREE.PointsMaterial({
      color: 0xff8811,
      size: 1.0,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.plumePoints = new THREE.Points(plumeGeo, this.plumeMat);
    this.plumePoints.frustumCulled = false;
    this.plumePoints.visible = false;
    this.group.add(this.plumePoints);

    // ----------------------------------------------------
    // 6. Lunar Touchdown Dust Particles (Soft Radial Regolith Plumes)
    // ----------------------------------------------------
    const dustGeo = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(this.dustCount * 3);
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    this.dustMat = new THREE.PointsMaterial({
      map: this.dustTexture,
      color: 0xb8b4ac, // warm lunar-grey tint
      size: 2.2, // soft billboarding sprite particle size
      transparent: true,
      opacity: 0.28, // low opacity 0.18–0.35
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    this.dustPoints = new THREE.Points(dustGeo, this.dustMat);
    this.dustPoints.frustumCulled = false;
    this.dustPoints.visible = false;
    this.group.add(this.dustPoints);
  }

  /**
   * Real-time particle-based rocket engine fire and exhaust smoke updater.
   * Emits glowing orange/yellow flame particles and expanding, semi-transparent grey smoke plumes
   * downward from the 9 engine nozzles during liftoff and ascent.
   * 
   * Zero GC runtime: updates pre-allocated Float32Array buffers in-place every frame.
   */
  public updateEarthLaunch(
    p: number,
    craftRigX: number,
    craftRigY: number,
    craftRigZ: number,
    thrust: number,
    padDrop: number,
    simTimeSec: number = 0
  ): void {
    if (p < 0.05 || p > 0.38) {
      this.firePoints.visible = false;
      this.smokePlumePoints.visible = false;
      this.padSmokePoints.visible = false;
      this.ascentSmokePoints.visible = false;
      return;
    }

    const t = simTimeSec;
    const nozzleExitY = craftRigY - 0.25;

    // ----------------------------------------------------
    // 1. Glowing Orange/Yellow Flame Particles (Engine Nozzles)
    // ----------------------------------------------------
    const isFireActive = thrust > 0.02 && p >= 0.06 && p <= 0.355;
    this.firePoints.visible = isFireActive;
    if (isFireActive) {
      const firePos = this.firePositions;
      const fireCol = this.fireColors;
      const maxFlameLen = (3.8 + 4.2 * thrust);

      for (let i = 0; i < this.fireCount; i++) {
        const idx = i * 3;
        // Assign particle to one of the 9 booster engine nozzles
        const nCoords = NOZZLE_OFFSETS[i % NOZZLE_OFFSETS.length];
        const nX = craftRigX + nCoords[0];
        const nZ = craftRigZ + nCoords[1];

        // Real-time downward flow along the flame jet
        const s = i / this.fireCount;
        const phase = (t * 26.0 + s) % 1.0;
        const dist = phase * maxFlameLen;

        // Plume radius: narrow at nozzle exit, expanding slightly downstream
        const spread = 0.22 + dist * 0.18;
        const theta = i * 2.3999632 + phase * 5.5;
        const turb = 0.82 + 0.18 * Math.sin(i * 12.31 + t * 40.0);

        firePos[idx] = nX + Math.cos(theta) * spread * turb;
        firePos[idx + 1] = nozzleExitY - dist;
        firePos[idx + 2] = nZ + Math.sin(theta) * spread * turb;

        // Authentic thermal gradient: incandescent white-hot throat -> glowing yellow -> vibrant orange -> flame red
        if (phase < 0.15) {
          // White-hot core at nozzle throat
          const u = phase / 0.15;
          fireCol[idx] = 1.0;
          fireCol[idx + 1] = 1.0 - u * 0.08;
          fireCol[idx + 2] = 0.95 - u * 0.75;
        } else if (phase < 0.48) {
          // Glowing bright yellow to golden amber
          const u = (phase - 0.15) / 0.33;
          fireCol[idx] = 1.0;
          fireCol[idx + 1] = 0.92 - u * 0.42;
          fireCol[idx + 2] = 0.20 * (1.0 - u);
        } else if (phase < 0.80) {
          // Glowing vibrant orange flame
          const u = (phase - 0.48) / 0.32;
          fireCol[idx] = 1.0;
          fireCol[idx + 1] = 0.50 - u * 0.35;
          fireCol[idx + 2] = 0.04;
        } else {
          // Flame tip / cooling red-orange embers
          const u = (phase - 0.80) / 0.20;
          fireCol[idx] = 1.0 - u * 0.25;
          fireCol[idx + 1] = 0.15 - u * 0.12;
          fireCol[idx + 2] = 0.01;
        }
      }
      this.firePoints.geometry.attributes.position.needsUpdate = true;
      (this.firePoints.geometry.attributes as any).color.needsUpdate = true;
    }

    // ----------------------------------------------------
    // 2. Expanding, Semi-Transparent Grey Smoke Plumes (Downward from Nozzles)
    // ----------------------------------------------------
    const isSmokePlumeActive = thrust > 0.02 && p >= 0.065 && p <= 0.36;
    this.smokePlumePoints.visible = isSmokePlumeActive;
    if (isSmokePlumeActive) {
      const smokePos = this.smokePlumePositions;
      const smokeCol = this.smokePlumeColors;

      // Throttle opacity with flight envelope
      const rampIn = Math.max(0, Math.min(1, (p - 0.065) / 0.03));
      const rampOut = 1.0 - Math.max(0, Math.min(1, (p - 0.31) / 0.05));
      this.smokePlumeMat.opacity = 0.70 * rampIn * rampOut;

      for (let i = 0; i < this.smokePlumeCount; i++) {
        const idx = i * 3;
        const s = i / this.smokePlumeCount;
        // Real-time expansion cycle downward
        const phase = (t * 5.2 + s) % 1.0;
        const dist = 1.8 + phase * 26.0;

        // Exponential aerodynamic expansion as smoke entrains air
        const plumeRadius = 0.85 + Math.pow(phase, 0.75) * 8.5;
        const angle = i * 2.3999632 + phase * 3.8;
        const turb = 0.78 + 0.22 * Math.sin(i * 9.47 + t * 14.0);

        smokePos[idx] = craftRigX + Math.cos(angle) * plumeRadius * turb;
        smokePos[idx + 1] = nozzleExitY - dist;
        smokePos[idx + 2] = craftRigZ + Math.sin(angle) * plumeRadius * turb;

        // Color transition: warm fiery underglow near nozzle -> semi-transparent cool grey smoke
        if (phase < 0.22) {
          // Warm amber-orange glow reflecting engine fire
          const u = phase / 0.22;
          smokeCol[idx] = 0.95 * (1.0 - u) + 0.75 * u;
          smokeCol[idx + 1] = 0.75 * (1.0 - u) + 0.77 * u;
          smokeCol[idx + 2] = 0.45 * (1.0 - u) + 0.80 * u;
        } else {
          // Atmospheric semi-transparent neutral-to-cool grey
          const shade = 0.72 + 0.16 * Math.sin(i * 4.19);
          smokeCol[idx] = 0.72 * shade;
          smokeCol[idx + 1] = 0.75 * shade;
          smokeCol[idx + 2] = 0.79 * shade;
        }
      }
      this.smokePlumePoints.geometry.attributes.position.needsUpdate = true;
      (this.smokePlumePoints.geometry.attributes as any).color.needsUpdate = true;
    }

    // ----------------------------------------------------
    // 3. Launch Pad Ground Smoke & Deluge Steam Cloud
    // ----------------------------------------------------
    const isPadSmokeActive = p >= 0.055 && p <= 0.24;
    this.padSmokePoints.visible = isPadSmokeActive;
    if (isPadSmokeActive) {
      const padPos = this.padSmokePositions;
      const padCol = this.padSmokeColors;

      // Cloud volume expansion from engine ignition (0.06) up to mature cloud (0.16)
      const grow = Math.max(0, Math.min(1, (p - 0.06) / 0.10));
      const padRamp = Math.max(0, Math.min(1, (p - 0.055) / 0.025));
      const padFade = 1.0 - Math.max(0, Math.min(1, (p - 0.16) / 0.08));
      this.padSmokeMat.opacity = 0.72 * padRamp * padFade;

      const maxR = 3.5 + grow * 25.0;
      const maxH = 0.8 + grow * 8.5;

      for (let i = 0; i < this.padSmokeCount; i++) {
        const idx = i * 3;
        const theta = i * 2.3999632;
        const frac = Math.sqrt((i + 0.5) / this.padSmokeCount);

        // Flame trench exhaust deflector channels massive billows North-South (Z axis)
        const zStretch = 1.0 + 1.8 * Math.pow(Math.abs(Math.sin(theta)), 1.5);
        const r = frac * maxR;
        const puffH = (1.0 - frac * 0.55) * maxH * (0.75 + 0.25 * Math.sin(i * 8.43 + t * 6.0));

        padPos[idx] = craftRigX + Math.cos(theta) * r * 0.85;
        padPos[idx + 1] = -padDrop + 0.2 + puffH;
        padPos[idx + 2] = Math.sin(theta) * r * zStretch;

        // Fiery underglow near flame trench center during active firing
        const fireDist = r;
        const fireGlow = Math.max(0, 1.0 - fireDist / 6.0) * (p < 0.14 ? 1.0 : (1.0 - Math.min(1, (p - 0.14) / 0.06)));
        const baseShade = 0.82 + 0.16 * Math.sin(i * 4.31);

        padCol[idx] = (0.95 * (1.0 - fireGlow) + 1.0 * fireGlow) * baseShade;
        padCol[idx + 1] = (0.95 * (1.0 - fireGlow) + 0.62 * fireGlow) * baseShade;
        padCol[idx + 2] = (0.98 * (1.0 - fireGlow) + 0.22 * fireGlow) * baseShade;
      }
      this.padSmokePoints.geometry.attributes.position.needsUpdate = true;
      (this.padSmokePoints.geometry.attributes as any).color.needsUpdate = true;
    }

    // ----------------------------------------------------
    // 4. Atmospheric Ascent Column Smoke Wake
    // ----------------------------------------------------
    const isAscentSmokeActive = p >= 0.08 && p <= 0.355;
    this.ascentSmokePoints.visible = isAscentSmokeActive;
    if (isAscentSmokeActive) {
      const ascPos = this.ascentSmokePositions;
      const ascCol = this.ascentSmokeColors;

      const ascRamp = Math.max(0, Math.min(1, (p - 0.08) / 0.035));
      const ascFade = 1.0 - Math.max(0, Math.min(1, (p - 0.30) / 0.055));
      this.ascentSmokeMat.opacity = 0.62 * ascRamp * ascFade;

      const basePadY = -padDrop;
      const craftY = craftRigY - 0.6;
      const totalSpanY = Math.max(0.5, craftY - basePadY);

      for (let i = 0; i < this.ascentSmokeCount; i++) {
        const idx = i * 3;
        // u = 1.0 is at the rocket base, u = 0.0 is down at the ground
        const u = i / (this.ascentSmokeCount - 1);

        const py = basePadY + u * totalSpanY;
        const pxMid = 3.5 + u * (craftRigX - 3.5);
        const pzMid = u * craftRigZ;

        // Plume widens as it falls behind the climbing rocket due to atmospheric dispersion
        const plumeRadius = 0.95 + (1.0 - u) * (3.5 + Math.min(1, (p - 0.08) / 0.20) * 3.8);
        const spiralAng = i * 2.3999632 + u * 14.0;
        const turb = 0.76 + 0.24 * Math.sin(i * 12.87 + t * 8.0);

        ascPos[idx] = pxMid + Math.cos(spiralAng) * plumeRadius * turb;
        ascPos[idx + 1] = py;
        ascPos[idx + 2] = pzMid + Math.sin(spiralAng) * plumeRadius * turb;

        // Warm illuminated exhaust near rocket base -> white/light-gray cloud wake
        if (u > 0.88) {
          const warm = (u - 0.88) / 0.12;
          ascCol[idx] = 0.94 + 0.06 * warm;
          ascCol[idx + 1] = 0.86 - 0.12 * warm;
          ascCol[idx + 2] = 0.74 - 0.35 * warm;
        } else {
          const shade = 0.84 + 0.14 * Math.sin(i * 3.71);
          ascCol[idx] = 0.90 * shade;
          ascCol[idx + 1] = 0.92 * shade;
          ascCol[idx + 2] = 0.95 * shade;
        }
      }
      this.ascentSmokePoints.geometry.attributes.position.needsUpdate = true;
      (this.ascentSmokePoints.geometry.attributes as any).color.needsUpdate = true;
    }
  }

  /**
   * Deterministic fallback for legacy booster plume points
   */
  public updatePlume(active: boolean, originX: number, originY: number, originZ: number): void {
    this.plumePoints.visible = active;
    if (!active) return;

    for (let i = 0; i < this.plumeCount; i++) {
      const idx = i * 3;
      const u = (i / this.plumeCount);
      const angle = i * 2.3999632;
      const spread = (0.2 + u * 0.8);
      const distY = u * 6.5;

      this.plumePositions[idx] = originX + Math.cos(angle) * spread;
      this.plumePositions[idx + 1] = originY - distY;
      this.plumePositions[idx + 2] = originZ + Math.sin(angle) * spread;
    }
    this.plumePoints.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Deterministic lunar touchdown regolith dust simulation:
   * Soft radial plumes streaming outward horizontally along the ground from the engine impingement point.
   */
  public updateDust(active: boolean, originX: number, originY: number, originZ: number, timeSec: number = 0): void {
    this.dustPoints.visible = active;
    if (!active) return;

    for (let i = 0; i < this.dustCount; i++) {
      const idx = i * 3;
      // Uniform radial angle dispersion using golden ratio spiral + micro perturbation (zero concentric rings)
      const angle = (i * 0.61803398875) * Math.PI * 2 + Math.sin(i * 3.7) * 0.15;
      const u = ((i / this.dustCount) + timeSec * 0.65) % 1.0;
      // Stream outward horizontally along the ground from the engine plume impingement point
      const dist = 0.35 + Math.pow(u, 0.70) * 8.5;
      const h = Math.pow(u, 0.5) * (1 - u) * 0.35;
      const jitter = Math.sin(i * 11.3) * (0.12 * u);

      this.dustPositions[idx] = originX + Math.cos(angle) * dist + jitter;
      this.dustPositions[idx + 1] = originY + h;
      this.dustPositions[idx + 2] = originZ + Math.sin(angle) * dist + jitter;
    }
    this.dustPoints.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Disposes all GPU resources
   */
  public destroy(): void {
    if (this.fireTexture) this.fireTexture.dispose();
    if (this.smokeTexture) this.smokeTexture.dispose();
    if (this.dustTexture) this.dustTexture.dispose();

    this.firePoints.geometry.dispose();
    this.fireMat.dispose();

    this.smokePlumePoints.geometry.dispose();
    this.smokePlumeMat.dispose();

    this.padSmokePoints.geometry.dispose();
    this.padSmokeMat.dispose();

    this.ascentSmokePoints.geometry.dispose();
    this.ascentSmokeMat.dispose();

    this.plumePoints.geometry.dispose();
    this.plumeMat.dispose();

    this.dustPoints.geometry.dispose();
    this.dustMat.dispose();
  }
}
