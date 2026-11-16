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

/**
 * High-performance, zero-allocation particle system for Earth launch liftoff
 * (roaring engine flame jet, ground launch pad steam & smoke, and atmospheric ascent wake).
 * 
 * 100% deterministic spatial functions of scroll progress p guarantee identical forward & backward
 * scrubbing without non-deterministic frame drift.
 */
export class ParticleSystems {
  public group: THREE.Group;

  // 1. High-Velocity Booster Flame Jet
  private firePoints: THREE.Points;
  private firePositions: Float32Array;
  private fireColors: Float32Array;
  private fireCount = 450;
  private fireMat: THREE.PointsMaterial;

  // 2. Launch Pad Ground Smoke & Steam Cloud (Flame trench & concrete pad)
  private padSmokePoints: THREE.Points;
  private padSmokePositions: Float32Array;
  private padSmokeColors: Float32Array;
  private padSmokeCount = 450;
  private padSmokeMat: THREE.PointsMaterial;

  // 3. Atmospheric Ascent Smoke Column (Rocket's wake)
  private ascentSmokePoints: THREE.Points;
  private ascentSmokePositions: Float32Array;
  private ascentSmokeColors: Float32Array;
  private ascentSmokeCount = 400;
  private ascentSmokeMat: THREE.PointsMaterial;

  // 4. Legacy Booster Plume (Backward compatibility)
  public plumePoints: THREE.Points;
  private plumePositions: Float32Array;
  private plumeCount = 150;
  private plumeMat: THREE.PointsMaterial;

  // 5. Lunar Touchdown Dust Particles
  public dustPoints: THREE.Points;
  private dustPositions: Float32Array;
  private dustCount = 250;
  private dustMat: THREE.PointsMaterial;

  // Reusable procedural textures
  private fireTexture: THREE.Texture | null = null;
  private smokeTexture: THREE.Texture | null = null;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ParticleSystems';

    // Procedural Soft Sprites
    this.fireTexture = createRadialTexture(64, [
      [0.0, 'rgba(255, 255, 255, 1.0)'],
      [0.2, 'rgba(255, 235, 120, 0.95)'],
      [0.45, 'rgba(255, 130, 25, 0.75)'],
      [0.75, 'rgba(220, 45, 10, 0.25)'],
      [1.0, 'rgba(180, 10, 0, 0.0)']
    ]);

    this.smokeTexture = createRadialTexture(64, [
      [0.0, 'rgba(255, 255, 255, 0.92)'],
      [0.25, 'rgba(242, 245, 250, 0.75)'],
      [0.55, 'rgba(220, 226, 236, 0.35)'],
      [0.85, 'rgba(195, 205, 220, 0.08)'],
      [1.0, 'rgba(180, 195, 210, 0.0)']
    ]);

    // ----------------------------------------------------
    // 1. Fire Exhaust Jet
    // ----------------------------------------------------
    const fireGeo = new THREE.BufferGeometry();
    this.firePositions = new Float32Array(this.fireCount * 3);
    this.fireColors = new Float32Array(this.fireCount * 3);
    fireGeo.setAttribute('position', new THREE.BufferAttribute(this.firePositions, 3));
    fireGeo.setAttribute('color', new THREE.BufferAttribute(this.fireColors, 3));

    this.fireMat = new THREE.PointsMaterial({
      size: 1.6,
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
    // 2. Pad Ground Smoke & Steam
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
    // 3. Ascent Atmospheric Smoke Wake
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
    // 4. Legacy Booster Plume Points
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
    // 5. Lunar Touchdown Dust Particles
    // ----------------------------------------------------
    const dustGeo = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(this.dustCount * 3);
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: 0x9fa4ae,
      size: 0.65,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    this.dustPoints = new THREE.Points(dustGeo, this.dustMat);
    this.dustPoints.frustumCulled = false;
    this.dustPoints.visible = false;
    this.group.add(this.dustPoints);
  }

  /**
   * Deterministic Earth launch smoke and fire updater across progress p in [0.05, 0.38].
   * Evaluates closed-form spatial formulas for zero-allocation, 100% reversible forward & backward scrubbing.
   */
  public updateEarthLaunch(
    p: number,
    craftRigX: number,
    craftRigY: number,
    craftRigZ: number,
    thrust: number,
    padDrop: number
  ): void {
    if (p < 0.05 || p > 0.38) {
      this.firePoints.visible = false;
      this.padSmokePoints.visible = false;
      this.ascentSmokePoints.visible = false;
      return;
    }

    // ----------------------------------------------------
    // 1. High-Velocity Booster Flame Exhaust Jet
    // ----------------------------------------------------
    const isFireActive = thrust > 0.02 && p >= 0.06 && p <= 0.355;
    this.firePoints.visible = isFireActive;
    if (isFireActive) {
      const firePos = this.firePositions;
      const fireCol = this.fireColors;
      const maxLen = 3.5 + 4.8 * thrust;
      const nozzleY = craftRigY - 0.25;

      for (let i = 0; i < this.fireCount; i++) {
        const idx = i * 3;
        const s = i / this.fireCount;
        // Deterministic high-frequency flow along the exhaust stream
        const phase = (p * 95.0 + s) % 1.0;
        const dist = phase * maxLen;

        // Supersonic bell expansion profile
        const spread = 0.35 + dist * 0.24;
        const theta = i * 2.3999632 + phase * 4.2;
        const turb = 0.78 + 0.22 * Math.sin(i * 11.73 + p * 50.0);

        firePos[idx] = craftRigX + Math.cos(theta) * spread * turb;
        firePos[idx + 1] = nozzleY - dist;
        firePos[idx + 2] = craftRigZ + Math.sin(theta) * spread * turb;

        // Color thermal gradient: white-hot throat -> brilliant yellow -> fiery orange -> dark crimson
        if (phase < 0.18) {
          const t = phase / 0.18;
          fireCol[idx] = 1.0;
          fireCol[idx + 1] = 1.0 - t * 0.1;
          fireCol[idx + 2] = 1.0 - t * 0.8;
        } else if (phase < 0.55) {
          const t = (phase - 0.18) / 0.37;
          fireCol[idx] = 1.0;
          fireCol[idx + 1] = 0.9 - t * 0.45;
          fireCol[idx + 2] = 0.2 * (1.0 - t);
        } else {
          const t = (phase - 0.55) / 0.45;
          fireCol[idx] = 1.0 - t * 0.35;
          fireCol[idx + 1] = 0.45 - t * 0.38;
          fireCol[idx + 2] = 0.02;
        }
      }
      this.firePoints.geometry.attributes.position.needsUpdate = true;
      (this.firePoints.geometry.attributes as any).color.needsUpdate = true;
    }

    // ----------------------------------------------------
    // 2. Launch Pad Ground Smoke & Deluge Steam Cloud
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
        const puffH = (1.0 - frac * 0.55) * maxH * (0.75 + 0.25 * Math.sin(i * 8.43 + p * 20.0));

        padPos[idx] = 3.5 + Math.cos(theta) * r * 0.85;
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
    // 3. Atmospheric Ascent Smoke Wake / Column
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
        const turb = 0.76 + 0.24 * Math.sin(i * 12.87 + p * 28.0);

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
   * Deterministic lunar touchdown dust simulation
   */
  public updateDust(active: boolean, originX: number, originY: number, originZ: number): void {
    this.dustPoints.visible = active;
    if (!active) return;

    for (let i = 0; i < this.dustCount; i++) {
      const idx = i * 3;
      const angle = i * 2.3999632;
      const frac = ((i * 19) % 100) / 100;
      const dist = 0.8 + frac * 6.5;
      const h = Math.sin(frac * Math.PI) * 0.9;

      this.dustPositions[idx] = originX + Math.cos(angle) * dist;
      this.dustPositions[idx + 1] = originY + h;
      this.dustPositions[idx + 2] = originZ + Math.sin(angle) * dist;
    }
    this.dustPoints.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Disposes all GPU resources
   */
  public destroy(): void {
    if (this.fireTexture) this.fireTexture.dispose();
    if (this.smokeTexture) this.smokeTexture.dispose();

    this.firePoints.geometry.dispose();
    this.fireMat.dispose();

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
