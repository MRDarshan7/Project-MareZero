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
  const indices: number[] = [];

  // Top surface: center vertex
  positions.push(0, 0, 0);
  uvs.push(0.5, 0.5);

  // Top concentric rings
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * radius;
    for (let s = 0; s < segments; s++) {
      const th = (s / segments) * Math.PI * 2;
      const x = Math.cos(th) * rad;
      const z = Math.sin(th) * rad;
      positions.push(x, 0, z);
      uvs.push((x / radius) * 0.5 + 0.5, (z / radius) * 0.5 + 0.5);
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
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
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
    const regolithMaterial = createLunarRegolithMaterial();

    // ========================================================
    // 2. MULTI-OCTAVE PROCEDURAL TERRAIN (CIRCULAR DISC)
    // ========================================================
    const terrainRadius = 16.0;
    const terrainGeo = createCircularTerrainDisc(terrainRadius, 48, 96, 0.45);

    const pos = terrainGeo.attributes.position;
    const topCount = 1 + 48 * 96;
    for (let i = 0; i < topCount; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Multi-octave harmonic lunar topography
      let y = Math.sin(x * 0.08) * 0.55 + Math.cos(z * 0.09) * 0.45;
      y += Math.sin(x * 0.22 + z * 0.18) * 0.28;
      y += Math.sin(x * 0.55 - z * 0.42) * 0.12; // micro-undulation

      const dCenter = Math.hypot(x, z);

      // Ensure stable, flat touchdown zone at coordinates (0, 0)
      if (dCenter < 3.2) {
        y *= Math.pow(dCenter / 3.2, 2.0);
      } else {
        // Natural depression crater 1
        const c1Dist = Math.hypot(x - 8, z - 6);
        if (c1Dist < 6) {
          const normDist = c1Dist / 6;
          if (normDist < 0.75) {
            y -= Math.cos((normDist / 0.75) * (Math.PI / 2)) * 1.5;
          } else {
            const rimFactor = Math.sin(((normDist - 0.75) / 0.25) * Math.PI);
            y += rimFactor * 0.35;
          }
        }

        // Natural depression crater 2
        const c2Dist = Math.hypot(x + 9, z + 7);
        if (c2Dist < 6.5) {
          const normDist = c2Dist / 6.5;
          if (normDist < 0.78) {
            y -= Math.cos((normDist / 0.78) * (Math.PI / 2)) * 1.8;
          } else {
            const rimFactor = Math.sin(((normDist - 0.78) / 0.22) * Math.PI);
            y += rimFactor * 0.40;
          }
        }
      }

      // Smooth radial falloff so terrain perimeter cleanly flushes with the 16.0m boundary
      const edgeFactor = Math.max(0, Math.min(1, (16.0 - dCenter) / 2.5));
      y *= edgeFactor;

      pos.setY(i, y);
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
    // Micro-deform boulder vertices for faceted rock appearance
    const bPos = boulderGeo.attributes.position;
    for (let b = 0; b < bPos.count; b++) {
      const vx = bPos.getX(b);
      const vy = bPos.getY(b);
      const vz = bPos.getZ(b);
      const jitter = 0.85 + ((b * 13) % 7) * 0.05;
      bPos.setXYZ(b, vx * jitter, vy * (0.8 + ((b * 17) % 5) * 0.08), vz * jitter);
    }
    boulderGeo.computeVertexNormals();

    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0x484b54,
      roughness: 0.92,
      metalness: 0.05
    });

    this.boulderMesh = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderCount);
    this.boulderMesh.castShadow = true;
    this.boulderMesh.receiveShadow = true;

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

      // Approximate surface elevation
      const by = Math.sin(bx * 0.08) * 0.55 + Math.cos(bz * 0.09) * 0.45;
      const scale = 0.35 + rnd() * 0.75;

      dummy.position.set(bx, by + scale * 0.15, bz);
      dummy.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      dummy.scale.set(scale, scale * (0.7 + rnd() * 0.5), scale);
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
          const dist = Math.hypot(x - c.x, z - c.z);
          const u = dist / c.r;
          if (u < 2.0) {
            y -= c.depth * Math.exp(-2.8 * u * u);
            y += 0.14 * c.depth * Math.exp(-12.0 * Math.pow(u - 1.05, 2));
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

    const discMat = createLunarRegolithMaterial(4, 4);
    discMat.color.setHex(0x16181f); // Darkened matte lunar regolith for crisp wireframe and label contrast
    discMat.roughness = 0.96;
    discMat.metalness = 0.02;

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
    this.landingTerrain.visible = p < 0.3;
    this.landingTerrain.scale.set(1 - p * 0.7, 1 - p * 0.7, 1 - p * 0.7);

    this.domeBaseDisc.visible = p > 0.05;
    this.domeBaseDisc.scale.set(p, p, p);

    if (this.horizonWallMesh) {
      this.horizonWallMesh.visible = p > 0.05;
      this.horizonWallMesh.scale.set(p, p, p);
    }
  }
}
