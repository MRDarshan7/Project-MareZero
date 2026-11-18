import * as THREE from 'three';
import { HorizonManager } from '../../terrain/horizon';
import { createLunarRegolithMaterial } from '../materials/RocketTextures';
import { DeterministicPRNG } from '../materials/CelestialTextures';

/**
 * Creates a precision circular disc BufferGeometry with concentric rings and a downward side skirt.
 * Perfectly matches the circular radius of the Sky-Dome base with zero sharp square corners.
 */
function createCircularTerrainDisc(radius: number, rings: number, segments: number, depth: number = 0.45): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // Top surface: center vertex
  positions.push(0, 0, 0);
  uvs.push(0.5, 0.5);
  colors.push(0.345, 0.337, 0.325); // Mid-tone lunar soil

  // Top concentric rings
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * radius;
    for (let s = 0; s < segments; s++) {
      const th = (s / segments) * Math.PI * 2;
      const x = Math.cos(th) * rad;
      const z = Math.sin(th) * rad;
      positions.push(x, 0, z);
      uvs.push((x / radius) * 0.5 + 0.5, (z / radius) * 0.5 + 0.5);
      colors.push(0.345, 0.337, 0.325);
    }
  }

  // Inner ring faces
  for (let s = 0; s < segments; s++) {
    const nextS = (s + 1) % segments;
    indices.push(0, 1 + nextS, 1 + s);
  }

  // Subsequent concentric rings
  for (let r = 1; r < rings; r++) {
    const rowA = 1 + (r - 1) * segments;
    const rowB = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const nextS = (s + 1) % segments;
      indices.push(rowA + s, rowA + nextS, rowB + nextS);
      indices.push(rowA + s, rowB + nextS, rowB + s);
    }
  }

  // Outer rim side skirt
  const outerRow = 1 + (rings - 1) * segments;
  const bottomOffset = positions.length / 3;
  for (let s = 0; s < segments; s++) {
    const th = (s / segments) * Math.PI * 2;
    positions.push(Math.cos(th) * radius, -depth, Math.sin(th) * radius);
    uvs.push(s / segments, 0);
    colors.push(0.18, 0.17, 0.16); // Darkened skirt perimeter
  }

  for (let s = 0; s < segments; s++) {
    const nextS = (s + 1) % segments;
    const topA = outerRow + s;
    const topB = outerRow + nextS;
    const botA = bottomOffset + s;
    const botB = bottomOffset + nextS;
    indices.push(topA, topB, botB);
    indices.push(topA, botB, botA);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  // Explicit analytic tangents for smooth tangent-space normal mapping without screen-derivative aliasing
  const numVerts = positions.length / 3;
  const tangents = new Float32Array(numVerts * 4);
  for (let i = 0; i < numVerts; i++) {
    tangents[i * 4] = 1.0;
    tangents[i * 4 + 1] = 0.0;
    tangents[i * 4 + 2] = 0.0;
    tangents[i * 4 + 3] = 1.0;
  }
  geo.setAttribute('tangent', new THREE.BufferAttribute(tangents, 4));

  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface OrganicCraterDef {
  cx: number;
  cz: number;
  r: number;
  depth: number;
  rimHeight: number;
  seed: number;
}

const LANDING_CRATERS: OrganicCraterDef[] = [
  { cx: 8.0, cz: 6.0, r: 5.8, depth: 1.6, rimHeight: 0.38, seed: 1.25 },
  { cx: -8.8, cz: -6.5, r: 6.2, depth: 1.85, rimHeight: 0.42, seed: 2.85 },
  { cx: -7.2, cz: 6.8, r: 3.8, depth: 0.95, rimHeight: 0.28, seed: 4.12 },
  { cx: 7.5, cz: -7.0, r: 4.2, depth: 1.10, rimHeight: 0.30, seed: 0.74 },
  { cx: 1.5, cz: 9.8, r: 2.4, depth: 0.60, rimHeight: 0.18, seed: 3.44 },
  { cx: -3.5, cz: -10.2, r: 2.2, depth: 0.55, rimHeight: 0.16, seed: 5.18 },
];

/**
 * Calculates organic cratered lunar terrain elevation and surface cavity/rim attributes.
 * Removes uniform circular stamp rings by perturbing radii with multi-harmonic angular noise
 * and smoothly blending outer ejecta slopes into surrounding topography.
 */
export function calculateTerrainSample(x: number, z: number): { y: number; cavity: number; rim: number } {
  // 1. Isotropic multi-harmonic lunar topography rotated by non-axis-aligned angles
  let y = 0;
  // Direction 19°
  const u1 = x * 0.945 + z * 0.326;
  y += Math.sin(u1 * 0.085) * 0.55;
  // Direction 73°
  const u2 = x * 0.292 + z * 0.956;
  y += Math.sin(u2 * 0.11 + 1.2) * 0.42;
  // Direction 137°
  const u3 = -x * 0.731 + z * 0.682;
  y += Math.sin(u3 * 0.22 - 0.7) * 0.25;
  // Direction 211°
  const u4 = -x * 0.857 - z * 0.515;
  y += Math.sin(u4 * 0.46 + 2.1) * 0.12;
  // Direction 289°
  const u5 = x * 0.326 - z * 0.945;
  y += Math.sin(u5 * 0.92 - 1.4) * 0.04;

  let cavity = 0;
  let rim = 0;

  // 2. Organic Impact Craters with Non-uniform Rims & Smooth Ejecta Slopes
  for (const c of LANDING_CRATERS) {
    const dx = x - c.cx;
    const dz = z - c.cz;
    const dist = Math.hypot(dx, dz);
    const th = Math.atan2(dz, dx);

    // Organic radius distortion breaking up circular stamp rings
    const distortion = 1.0
      + 0.15 * Math.sin(3 * th + c.seed)
      + 0.08 * Math.cos(5 * th - c.seed * 0.7)
      + 0.05 * Math.sin(7 * th + c.seed * 1.3)
      + 0.03 * Math.cos(x * 0.94 - z * 0.34);

    const effR = c.r * distortion;
    const u = dist / effR;

    if (u < 0.82) {
      // Excavation cavity (bowl depression)
      const bowlFactor = Math.cos((u / 0.82) * (Math.PI / 2));
      const bowlDrop = c.depth * Math.pow(bowlFactor, 1.3);
      y -= bowlDrop;
      cavity += bowlFactor;
    } else if (u < 2.4) {
      // Organic raised rim & smoothly blended outer ejecta blanket
      let rimFactor: number;
      if (u < 0.92) {
        // Inner rim wall rise
        rimFactor = Math.sin(((u - 0.82) / 0.10) * (Math.PI / 2));
      } else {
        // Outer ejecta slope: smooth exponential decay without sharp cutoff
        const ejectaU = (u - 0.92) / 1.25;
        rimFactor = Math.exp(-4.2 * ejectaU * ejectaU);
      }
      const lobeFactor = 1.0 + 0.18 * Math.sin(2 * th + c.seed * 0.6);
      y += c.rimHeight * rimFactor * lobeFactor;
      if (u >= 0.84 && u <= 1.08) {
        rim = Math.max(rim, rimFactor);
      }
    }
  }

  // 3. Flat Touchdown Pad at Coordinates (0, 0)
  const dCenter = Math.hypot(x, z);
  if (dCenter < 3.2) {
    const padFactor = Math.pow(dCenter / 3.2, 2.2);
    y *= padFactor;
    cavity *= padFactor;
    rim *= padFactor;
  }

  // 4. Smooth Radial Falloff at Disc Boundary (R = 16.0)
  const edgeFactor = Math.max(0, Math.min(1, (16.0 - dCenter) / 2.5));
  y *= edgeFactor;
  cavity *= edgeFactor;
  rim *= edgeFactor;

  return { y, cavity, rim };
}

/**
 * 3D Photorealistic Lunar Terrain & Precision Sky-Dome Base Disc
 * 
 * Features:
 * - Multi-octave cratered regolith with raised ejecta rims & micro-relief
 * - Hapke / Lommel-Seeliger scattering characteristics (high roughness 0.95, zero metalness)
 * - Instanced procedural boulder field (`THREE.InstancedMesh`) around the landing zone
 * - 3D extruded LOLA terrain skyline silhouette wall with ridge crest highlighting
 * - Seamless morph into circular base disc for interactive Sky-Dome mode
 */
export class LunarSurface {
  public group: THREE.Group;
  public landingTerrain: THREE.Mesh;
  public domeBaseDisc: THREE.Mesh;
  public horizonWallMesh: THREE.Mesh;
  public craterGroup: THREE.Group;
  public boulderMesh: THREE.InstancedMesh | null = null;
  private horizonManager: HorizonManager;

  // Pre-allocated fixed buffers for zero-GC horizon wall updates
  private horizonPositions: Float32Array;
  private horizonColors: Float32Array;
  private horizonWallGeo: THREE.BufferGeometry;
  private static sinTable: Float32Array | null = null;
  private static cosTable: Float32Array | null = null;

  constructor(horizonManager?: HorizonManager) {
    this.group = new THREE.Group();
    this.group.name = 'LunarSurface';
    this.horizonManager = horizonManager || new HorizonManager();

    // Initialize lookup tables once
    if (!LunarSurface.sinTable) {
      LunarSurface.sinTable = new Float32Array(360);
      LunarSurface.cosTable = new Float32Array(360);
      for (let a = 0; a < 360; a++) {
        const rad = (a * Math.PI) / 180;
        LunarSurface.sinTable[a] = Math.sin(rad);
        LunarSurface.cosTable[a] = Math.cos(rad);
      }
    }

    // Fixed-size pre-allocated buffers for 360 segments (6 vertices each)
    const vertexCount = 360 * 6;
    this.horizonPositions = new Float32Array(vertexCount * 3);
    this.horizonColors = new Float32Array(vertexCount * 3);

    // Pre-fill fixed color gradient: base dark slate -> crest amber highlight
    let cIdx = 0;
    for (let a = 0; a < 360; a++) {
      // Triangle 1: base, base, crest
      this.horizonColors[cIdx++] = 0.08; this.horizonColors[cIdx++] = 0.10; this.horizonColors[cIdx++] = 0.14;
      this.horizonColors[cIdx++] = 0.08; this.horizonColors[cIdx++] = 0.10; this.horizonColors[cIdx++] = 0.14;
      this.horizonColors[cIdx++] = 0.95; this.horizonColors[cIdx++] = 0.72; this.horizonColors[cIdx++] = 0.22;

      // Triangle 2: base, crest, crest
      this.horizonColors[cIdx++] = 0.08; this.horizonColors[cIdx++] = 0.10; this.horizonColors[cIdx++] = 0.14;
      this.horizonColors[cIdx++] = 0.95; this.horizonColors[cIdx++] = 0.72; this.horizonColors[cIdx++] = 0.22;
      this.horizonColors[cIdx++] = 0.95; this.horizonColors[cIdx++] = 0.72; this.horizonColors[cIdx++] = 0.22;
    }

    this.horizonWallGeo = new THREE.BufferGeometry();
    this.horizonWallGeo.setAttribute('position', new THREE.BufferAttribute(this.horizonPositions, 3));
    this.horizonWallGeo.setAttribute('color', new THREE.BufferAttribute(this.horizonColors, 3));

    const wallMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.2,
      side: THREE.DoubleSide
    });

    this.horizonWallMesh = new THREE.Mesh(this.horizonWallGeo, wallMat);
    this.horizonWallMesh.castShadow = true;
    this.horizonWallMesh.receiveShadow = true;
    this.horizonWallMesh.visible = false;
    this.group.add(this.horizonWallMesh);

    // --- 1. Authentic Hapke / Lommel-Seeliger Regolith Material ---
    const regolithMaterial = createLunarRegolithMaterial(8, 8);
    regolithMaterial.vertexColors = true;
    regolithMaterial.roughness = 0.96;
    regolithMaterial.metalness = 0.0;
    regolithMaterial.transparent = true;
    regolithMaterial.opacity = 1.0;

    // ========================================================
    // 2. MULTI-OCTAVE PROCEDURAL TERRAIN (CIRCULAR DISC)
    // ========================================================
    const terrainRadius = 16.0;
    const terrainGeo = createCircularTerrainDisc(terrainRadius, 48, 96, 0.45);

    const pos = terrainGeo.attributes.position;
    const col = terrainGeo.attributes.color;
    const topCount = 1 + 48 * 96;
    for (let i = 0; i < topCount; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const sample = calculateTerrainSample(x, z);
      pos.setY(i, sample.y);

      // Albedo mottling:
      // Dark basaltic grey #3b3a38 in crater floors blending to lighter highland dust #7d7b76 on ridges
      let tone = 0.5 + (sample.y * 0.25) + (sample.rim * 0.40) - (sample.cavity * 0.50);
      const microNoise = (Math.sin(x * 7.3 + z * 12.1) + Math.cos(x * 13.7 - z * 5.9)) * 0.025;
      tone = Math.max(0.0, Math.min(1.0, tone + microNoise));

      let cr: number, cg: number, cb: number;
      if (tone < 0.5) {
        // Blend from dark basaltic grey (#3b3a38 = 0.231, 0.227, 0.220) to nominal regolith (0.345, 0.337, 0.325)
        const t = tone / 0.5;
        cr = THREE.MathUtils.lerp(0.231, 0.345, t);
        cg = THREE.MathUtils.lerp(0.227, 0.337, t);
        cb = THREE.MathUtils.lerp(0.220, 0.325, t);
      } else {
        // Blend from nominal regolith to lighter highland dust (#7d7b76 = 0.490, 0.482, 0.463)
        const t = (tone - 0.5) / 0.5;
        cr = THREE.MathUtils.lerp(0.345, 0.490, t);
        cg = THREE.MathUtils.lerp(0.337, 0.482, t);
        cb = THREE.MathUtils.lerp(0.325, 0.463, t);
      }

      col.setXYZ(i, cr, cg, cb);
    }
    terrainGeo.computeVertexNormals();

    this.landingTerrain = new THREE.Mesh(terrainGeo, regolithMaterial);
    this.landingTerrain.receiveShadow = true;
    this.landingTerrain.castShadow = true;
    this.group.add(this.landingTerrain);

    // ========================================================
    // 3. PROCEDURAL BOULDER FIELD (INSTANCED MESH)
    // ========================================================
    const boulderCount = 90;
    const boulderGeo = new THREE.DodecahedronGeometry(0.35, 1);
    // Micro-deform boulder vertices for faceted, weathered rock appearance
    const bPos = boulderGeo.attributes.position;
    for (let b = 0; b < bPos.count; b++) {
      const vx = bPos.getX(b);
      const vy = bPos.getY(b);
      const vz = bPos.getZ(b);
      const jitter = 0.90 + ((b * 13) % 7) * 0.03;
      bPos.setXYZ(b, vx * jitter, vy * (0.75 + ((b * 17) % 5) * 0.05), vz * jitter);
    }
    boulderGeo.computeVertexNormals();

    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0x5a5d66,
      roughness: 0.95,
      metalness: 0.02,
      transparent: true,
      opacity: 1.0
    });

    this.boulderMesh = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderCount);
    this.boulderMesh.castShadow = true;
    this.boulderMesh.receiveShadow = true;

    // Helper to evaluate exact surface height so boulders never float above ground
    const getExactTerrainY = (x: number, z: number): number => {
      return calculateTerrainSample(x, z).y;
    };

    const dummy = new THREE.Object3D();
    let seed = 42;
    const rnd = () => {
      seed = (seed * 16807 + 12345) % 2147483647;
      return seed / 2147483647;
    };

    for (let i = 0; i < boulderCount; i++) {
      // Scatter outside 3.8m radius from landing center and strictly inside 14.2m
      const rad = 3.8 + Math.pow(rnd(), 1.5) * 10.4;
      const th = rnd() * Math.PI * 2;
      const bx = Math.sin(th) * rad;
      const bz = Math.cos(th) * rad;

      // Exact surface elevation from crater terrain function
      const by = getExactTerrainY(bx, bz);
      // Realistic, smooth scale distribution (20-45 cm rocks)
      const scale = 0.18 + rnd() * 0.27;

      // Lower boulder position so its base sits partially embedded in regolith rather than floating
      dummy.position.set(bx, by - scale * 0.28, bz);
      dummy.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      dummy.scale.set(scale, scale * (0.65 + rnd() * 0.25), scale);
      dummy.updateMatrix();

      this.boulderMesh.setMatrixAt(i, dummy.matrix);
    }
    this.boulderMesh.instanceMatrix.needsUpdate = true;
    this.landingTerrain.add(this.boulderMesh);

    // ========================================================
    // 4. CIRCULAR SKY-DOME BASE DISC
    // ========================================================
    const discRadius = 16.0;
    const discGeo = createCircularTerrainDisc(discRadius, 48, 96, 0.45);
    const discPos = discGeo.attributes.position;
    const discTopCount = 1 + 48 * 96;

    // Natural geological impact crater depressions (replaces artificial torus rings)
    const domeCraters = [
      { x: -5.6, z: 4.8, r: 2.2, depth: 0.38 },
      { x: 6.2, z: 5.1, r: 2.0, depth: 0.35 },
      { x: 7.5, z: -4.5, r: 2.5, depth: 0.42 },
      { x: -7.0, z: -5.2, r: 1.8, depth: 0.32 },
      { x: 1.2, z: 8.5, r: 1.6, depth: 0.28 },
      { x: -2.8, z: 9.8, r: 1.4, depth: 0.24 },
      { x: 10.2, z: 1.5, r: 1.9, depth: 0.34 },
      { x: -9.8, z: 2.2, r: 1.7, depth: 0.30 },
      { x: -4.2, z: -9.5, r: 1.5, depth: 0.26 },
      { x: 4.5, z: -9.2, r: 1.6, depth: 0.28 },
      { x: 8.8, z: 7.2, r: 1.3, depth: 0.22 },
      { x: -8.5, z: -8.0, r: 1.4, depth: 0.22 }
    ];

    for (let i = 0; i < discTopCount; i++) {
      const x = discPos.getX(i);
      const z = discPos.getZ(i);
      const dCenter = Math.hypot(x, z);

      if (dCenter <= 3.8) {
        // Completely flat pad for lander footprint: zero clipping into legs
        discPos.setY(i, 0);
      } else {
        let y = Math.sin(x * 0.35 + z * 0.28) * 0.05 + Math.cos(x * 0.65 - z * 0.52) * 0.035;

        for (const c of domeCraters) {
          const dx = x - c.x;
          const dz = z - c.z;
          const dist = Math.hypot(dx, dz);
          const th = Math.atan2(dz, dx);
          // Organic rim distortion
          const distortion = 1.0 + 0.12 * Math.sin(3 * th + c.depth * 10) + 0.07 * Math.cos(5 * th);
          const effR = c.r * distortion;
          const u = dist / effR;
          if (u < 2.4) {
            y -= c.depth * Math.exp(-2.8 * u * u);
            // Smoothly blended organic ejecta slope
            if (u > 0.8) {
              const ejectaU = (u - 0.95);
              y += 0.16 * c.depth * Math.exp(-5.5 * ejectaU * ejectaU);
            }
          }
        }

        // Smooth transition outside landing pad
        const padFactor = Math.min(1.0, Math.max(0.0, (dCenter - 3.8) / 1.0));
        y *= padFactor;

        // Smooth edge falloff to disc boundary
        const rimEdgeFactor = Math.min(1.0, Math.max(0.0, (16.0 - dCenter) / 1.8));
        y *= rimEdgeFactor;

        discPos.setY(i, y);
      }
    }
    discGeo.computeVertexNormals();

    const discMat = createLunarRegolithMaterial(8, 8);
    discMat.color.setHex(0x16181f); // Darkened matte lunar regolith for crisp wireframe and label contrast
    discMat.roughness = 0.96;
    discMat.metalness = 0.0;

    this.domeBaseDisc = new THREE.Mesh(discGeo, discMat);
    this.domeBaseDisc.name = 'DomeBaseDisc';
    this.domeBaseDisc.position.set(0, 0, 0);
    this.domeBaseDisc.receiveShadow = true;
    this.domeBaseDisc.castShadow = true;
    this.domeBaseDisc.visible = false;
    this.group.add(this.domeBaseDisc);

    // Empty CraterGroup preserved for backwards compatibility and theme triggers
    this.craterGroup = new THREE.Group();
    this.craterGroup.name = 'CraterGroup';
    this.domeBaseDisc.add(this.craterGroup);

    // Build the 3D extruded LOLA terrain skyline wall
    this.updateHorizonWall();
  }

  /**
   * Rebuild the 3D extruded terrain horizon wall based on current LOLA data
   * Updates pre-allocated buffers in-place with zero GC allocations.
   */
  public updateHorizonWall(hm?: HorizonManager): void {
    if (hm) this.horizonManager = hm;

    const radius = 16.0;
    const sinT = LunarSurface.sinTable!;
    const cosT = LunarSurface.cosTable!;

    // Scale elevation degrees to 3D dome height (10° elevation ~ 2.8 units height)
    const elToY = (elDeg: number) => Math.tan((elDeg * Math.PI) / 180) * radius;

    let vIdx = 0;
    for (let a = 0; a < 360; a++) {
      const a0 = a;
      const a1 = (a + 1) % 360;

      // Azimuth 0 = North (+Z), Azimuth 90 = East (+X)
      const x0 = radius * sinT[a0];
      const z0 = radius * cosT[a0];
      const x1 = radius * sinT[a1];
      const z1 = radius * cosT[a1];

      const yTop0 = Math.max(0.06, elToY(this.horizonManager.getElevationAtAzimuth(a0)));
      const yTop1 = Math.max(0.06, elToY(this.horizonManager.getElevationAtAzimuth(a1)));

      // Triangle 1: (x0, 0, z0) -> (x1, 0, z1) -> (x1, yTop1, z1)
      this.horizonPositions[vIdx++] = x0; this.horizonPositions[vIdx++] = 0; this.horizonPositions[vIdx++] = z0;
      this.horizonPositions[vIdx++] = x1; this.horizonPositions[vIdx++] = 0; this.horizonPositions[vIdx++] = z1;
      this.horizonPositions[vIdx++] = x1; this.horizonPositions[vIdx++] = yTop1; this.horizonPositions[vIdx++] = z1;

      // Triangle 2: (x0, 0, z0) -> (x1, yTop1, z1) -> (x0, yTop0, z0)
      this.horizonPositions[vIdx++] = x0; this.horizonPositions[vIdx++] = 0; this.horizonPositions[vIdx++] = z0;
      this.horizonPositions[vIdx++] = x1; this.horizonPositions[vIdx++] = yTop1; this.horizonPositions[vIdx++] = z1;
      this.horizonPositions[vIdx++] = x0; this.horizonPositions[vIdx++] = yTop0; this.horizonPositions[vIdx++] = z0;
    }

    this.horizonWallGeo.attributes.position.needsUpdate = true;
    this.horizonWallGeo.computeVertexNormals();
  }

  /**
   * Set transition morph progress: 0 (local ground) to 1 (dome disc with horizon wall)
   */
  public setMorphProgress(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    this.landingTerrain.visible = p < 0.5;
    this.landingTerrain.scale.set(1.0, 1.0, 1.0);

    this.domeBaseDisc.visible = p >= 0.2;
    this.domeBaseDisc.scale.set(1.0, 1.0, 1.0);

    if (this.horizonWallMesh) {
      this.horizonWallMesh.visible = p > 0.05;
      this.horizonWallMesh.scale.set(1.0, 1.0, 1.0);
    }
  }
}
