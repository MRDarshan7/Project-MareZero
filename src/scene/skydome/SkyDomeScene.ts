import * as THREE from 'three';
import { EphemerisSample, CelestialBodyPos } from '../../types';

const MAX_PATH_SEGMENTS = 2048;
const _scratchVecA = new THREE.Vector3();
const _scratchVecB = new THREE.Vector3();
const _scratchPos = new THREE.Vector3();

interface PathGeometrySet {
  upGeo: THREE.BufferGeometry;
  upPositions: Float32Array;
  upLine: THREE.LineSegments;
  blockedGeo: THREE.BufferGeometry;
  blockedPositions: Float32Array;
  blockedLine: THREE.LineSegments;
}

/** A flat-colour lunar sky instrument. Angles are input data; only their display height is exaggerated. */
export class SkyDomeScene {
  public group = new THREE.Group();
  public domeWireframeGroup = new THREE.Group();
  public sunPathGroup = new THREE.Group();
  public earthPathGroup = new THREE.Group();
  public sunMarker: THREE.Group;
  public earthMarker: THREE.Group;
  public sunRay = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  public earthRay = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  public occlusionCrosshair = new THREE.Group();
  public hudLabelsGroup = new THREE.Group();
  public heightExaggeration = 8;
  private radius = 16;
  private terrain = new THREE.Group();
  private profile: number[] = new Array(360).fill(0.5);
  private samples: EphemerisSample[] = [];
  private sun?: CelestialBodyPos;
  private earth?: CelestialBodyPos;

  // Pre-allocated fixed buffers for terrain horizon edge and wall (Zero GC)
  private edgePositions = new Float32Array(361 * 3);
  private edgeGeometry = new THREE.BufferGeometry();
  private edgeLine: THREE.Line;

  private wallPositions = new Float32Array(360 * 6 * 3);
  private wallGeometry = new THREE.BufferGeometry();
  private wallMesh: THREE.Mesh;

  // Pre-allocated fixed buffers for Sun and Earth paths (Zero GC)
  private sunPaths: PathGeometrySet;
  private earthPaths: PathGeometrySet;

  constructor() {
    this.group.name = 'SkyDomeElements';
    this.buildGraticule();

    // Pre-allocated horizon edge and wall
    this.edgeGeometry.setAttribute('position', new THREE.BufferAttribute(this.edgePositions, 3));
    this.edgeLine = new THREE.Line(this.edgeGeometry, new THREE.LineBasicMaterial({ color: '#8F8B80', toneMapped: false }));
    this.terrain.add(this.edgeLine);

    this.wallGeometry.setAttribute('position', new THREE.BufferAttribute(this.wallPositions, 3));
    this.wallMesh = new THREE.Mesh(this.wallGeometry, new THREE.MeshBasicMaterial({ color: '#0C0D0B', toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
    this.wallMesh.renderOrder = -1;
    this.terrain.add(this.wallMesh);

    this.domeWireframeGroup.add(this.terrain);

    // Pre-allocated paths for Sun & Earth
    this.sunPaths = this.createPathSet('#F2B84B');
    this.sunPathGroup.add(this.sunPaths.upLine, this.sunPaths.blockedLine);

    this.earthPaths = this.createPathSet('#5FA8D3');
    this.earthPathGroup.add(this.earthPaths.upLine, this.earthPaths.blockedLine);

    this.sunMarker = this.marker('#F2B84B');
    this.earthMarker = this.marker('#5FA8D3');

    // Add dark semi-transparent inner dome curtain below the horizon silhouette line
    const curtainGeo = new THREE.SphereGeometry(
      this.radius * 0.995,
      48,
      24,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    );
    const curtainMat = new THREE.MeshBasicMaterial({
      color: 0x06080c,
      transparent: true,
      opacity: 0.28,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false
    });
    const curtainMesh = new THREE.Mesh(curtainGeo, curtainMat);
    curtainMesh.name = 'InnerDomeCurtain';
    curtainMesh.renderOrder = -2;
    this.domeWireframeGroup.add(curtainMesh);

    // Reparent all celestial elements inside domeWireframeGroup so they scale and lock together
    this.domeWireframeGroup.add(
      this.terrain,
      this.sunPathGroup,
      this.earthPathGroup,
      this.sunMarker,
      this.earthMarker,
      this.sunRay,
      this.earthRay,
      this.occlusionCrosshair
    );

    this.group.add(
      this.domeWireframeGroup,
      this.hudLabelsGroup
    );

    this.sunRay.visible = false;
    this.earthRay.visible = false;
    this.occlusionCrosshair.visible = false;
    this.group.visible = false;

    this.updateHorizon(this.profile);
  }

  private createPathSet(color: string): PathGeometrySet {
    const upPositions = new Float32Array(MAX_PATH_SEGMENTS * 2 * 3);
    const upGeo = new THREE.BufferGeometry();
    upGeo.setAttribute('position', new THREE.BufferAttribute(upPositions, 3));
    upGeo.setDrawRange(0, 0);
    const upLine = new THREE.LineSegments(
      upGeo,
      new THREE.LineBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.3 })
    );

    const blockedPositions = new Float32Array(MAX_PATH_SEGMENTS * 2 * 3);
    const blockedGeo = new THREE.BufferGeometry();
    blockedGeo.setAttribute('position', new THREE.BufferAttribute(blockedPositions, 3));
    blockedGeo.setDrawRange(0, 0);
    const blockedLine = new THREE.LineSegments(
      blockedGeo,
      new THREE.LineBasicMaterial({ color: '#C4483A', toneMapped: false, transparent: true, opacity: 0.3 })
    );

    return { upGeo, upPositions, upLine, blockedGeo, blockedPositions, blockedLine };
  }

  /** Physical spherical conversion, unchanged: north +Z, east +X, zenith +Y. */
  public toCartesian(azDeg: number, elDeg: number, r = this.radius, target?: THREE.Vector3): THREE.Vector3 {
    const el = (elDeg * Math.PI) / 180;
    const az = (azDeg * Math.PI) / 180;
    const x = r * Math.cos(el) * Math.sin(az);
    const y = r * Math.sin(el);
    const z = r * Math.cos(el) * Math.cos(az);
    return target ? target.set(x, y, z) : new THREE.Vector3(x, y, z);
  }

  public displayElevation(elevation: number): number {
    return (Math.atan(Math.tan((elevation * Math.PI) / 180) * this.heightExaggeration) * 180) / Math.PI;
  }

  public setHeightExaggeration(factor: number): void {
    if (factor === this.heightExaggeration) return;
    this.heightExaggeration = factor;
    this.updateHorizon(this.profile);
    this.updatePaths(this.samples);
    if (this.sun && this.earth) this.updatePositions(this.sun, this.earth);
  }

  private marker(color: string): THREE.Group {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false })
    );
    disc.renderOrder = 10;
    group.add(disc);

    const points = Array.from({ length: 97 }, (_, i) => {
      const angle = (i / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    });
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({
        color,
        toneMapped: false,
        dashSize: 0.18,
        gapSize: 0.12,
        transparent: true,
        opacity: 0.65,
        depthTest: false
      })
    );
    outline.computeLineDistances();
    outline.renderOrder = 11;
    outline.visible = false;
    group.add(outline);
    return group;
  }

  private buildGraticule(): void {
    const material = new THREE.LineBasicMaterial({ color: '#ECE8DD', toneMapped: false, transparent: true, opacity: 0.14 });
    const baseCircleMat = new THREE.LineBasicMaterial({ color: '#ECE8DD', toneMapped: false, transparent: true, opacity: 0.38 });

    // Elevation parallel rings (0° is accentuated as base boundary)
    for (const elevation of [0, 5, 10, 20, 30, 45, 60, 75]) {
      const isBase = elevation === 0;
      const points = Array.from({ length: 97 }, (_, i) => this.toCartesian((i / 96) * 360, elevation));
      this.domeWireframeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), isBase ? baseCircleMat : material));
    }

    // Dense azimuth meridians every 15° so celestial bodies are visibly anchored to wireframe arcs
    for (let az = 0; az < 360; az += 15) {
      const isMajor = az % 90 === 0;
      const azMat = isMajor ? baseCircleMat : material;
      const points = Array.from({ length: 31 }, (_, i) => this.toCartesian(az, i * 3));
      this.domeWireframeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), azMat));
    }
  }

  public updateHorizon(profile: number[]): void {
    this.profile = [...profile];

    // Update edge positions in place (361 points: 0 to 359, then wrap to 0)
    let eIdx = 0;
    for (let az = 0; az <= 360; az++) {
      const el = profile[az % 360];
      this.toCartesian(az, this.displayElevation(el), this.radius, _scratchPos);
      this.edgePositions[eIdx++] = _scratchPos.x;
      this.edgePositions[eIdx++] = _scratchPos.y;
      this.edgePositions[eIdx++] = _scratchPos.z;
    }
    this.edgeGeometry.attributes.position.needsUpdate = true;

    // Update wall mesh positions in place (360 quads = 360 * 6 vertices)
    let wIdx = 0;
    for (let az = 0; az < 360; az++) {
      const elA = profile[az];
      const elB = profile[(az + 1) % 360];
      this.toCartesian(az, this.displayElevation(elA), this.radius, _scratchVecA);
      this.toCartesian(az + 1, this.displayElevation(elB), this.radius, _scratchVecB);

      // Vertex 1: a.x, -0.25, a.z
      this.wallPositions[wIdx++] = _scratchVecA.x; this.wallPositions[wIdx++] = -0.25; this.wallPositions[wIdx++] = _scratchVecA.z;
      // Vertex 2: b.x, -0.25, b.z
      this.wallPositions[wIdx++] = _scratchVecB.x; this.wallPositions[wIdx++] = -0.25; this.wallPositions[wIdx++] = _scratchVecB.z;
      // Vertex 3: b.x, b.y, b.z
      this.wallPositions[wIdx++] = _scratchVecB.x; this.wallPositions[wIdx++] = _scratchVecB.y; this.wallPositions[wIdx++] = _scratchVecB.z;

      // Vertex 4: a.x, -0.25, a.z
      this.wallPositions[wIdx++] = _scratchVecA.x; this.wallPositions[wIdx++] = -0.25; this.wallPositions[wIdx++] = _scratchVecA.z;
      // Vertex 5: b.x, b.y, b.z
      this.wallPositions[wIdx++] = _scratchVecB.x; this.wallPositions[wIdx++] = _scratchVecB.y; this.wallPositions[wIdx++] = _scratchVecB.z;
      // Vertex 6: a.x, a.y, a.z
      this.wallPositions[wIdx++] = _scratchVecA.x; this.wallPositions[wIdx++] = _scratchVecA.y; this.wallPositions[wIdx++] = _scratchVecA.z;
    }
    this.wallGeometry.attributes.position.needsUpdate = true;
  }

  public updatePaths(samples: EphemerisSample[]): void {
    this.samples = samples;
    const len = samples.length;
    if (len < 2) {
      this.sunPaths.upGeo.setDrawRange(0, 0);
      this.sunPaths.blockedGeo.setDrawRange(0, 0);
      this.earthPaths.upGeo.setDrawRange(0, 0);
      this.earthPaths.blockedGeo.setDrawRange(0, 0);
      return;
    }

    for (const body of ['sun', 'earth'] as const) {
      const paths = body === 'sun' ? this.sunPaths : this.earthPaths;
      let upIdx = 0;
      let blockedIdx = 0;

      for (let i = 1; i < len; i++) {
        const a = samples[i - 1][body];
        const b = samples[i][body];
        const isBlocked = a.isBlocked || b.isBlocked;

        this.toCartesian(a.az, this.displayElevation(a.el), this.radius, _scratchVecA);
        this.toCartesian(b.az, this.displayElevation(b.el), this.radius, _scratchVecB);

        if (isBlocked) {
          if (blockedIdx + 6 <= paths.blockedPositions.length) {
            paths.blockedPositions[blockedIdx++] = _scratchVecA.x;
            paths.blockedPositions[blockedIdx++] = _scratchVecA.y;
            paths.blockedPositions[blockedIdx++] = _scratchVecA.z;
            paths.blockedPositions[blockedIdx++] = _scratchVecB.x;
            paths.blockedPositions[blockedIdx++] = _scratchVecB.y;
            paths.blockedPositions[blockedIdx++] = _scratchVecB.z;
          }
        } else {
          if (upIdx + 6 <= paths.upPositions.length) {
            paths.upPositions[upIdx++] = _scratchVecA.x;
            paths.upPositions[upIdx++] = _scratchVecA.y;
            paths.upPositions[upIdx++] = _scratchVecA.z;
            paths.upPositions[upIdx++] = _scratchVecB.x;
            paths.upPositions[upIdx++] = _scratchVecB.y;
            paths.upPositions[upIdx++] = _scratchVecB.z;
          }
        }
      }

      paths.upGeo.attributes.position.needsUpdate = true;
      paths.upGeo.setDrawRange(0, upIdx / 3);

      paths.blockedGeo.attributes.position.needsUpdate = true;
      paths.blockedGeo.setDrawRange(0, blockedIdx / 3);
    }
  }

  public updatePositions(sun: CelestialBodyPos, earth: CelestialBodyPos): void {
    this.sun = sun;
    this.earth = earth;

    // Clamp display elevation to >= 0.1° so markers strictly lock to the dome surface
    // and never plunge below the ground plane disc
    const sunEl = Math.max(0.1, this.displayElevation(sun.el));
    const earthEl = Math.max(0.1, this.displayElevation(earth.el));

    // Sun Marker
    this.toCartesian(sun.az, sunEl, this.radius, _scratchPos);
    this.sunMarker.position.copy(_scratchPos);
    this.sunMarker.visible = true;
    const sunMat = (this.sunMarker.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    sunMat.color.set(sun.isBlocked ? '#0C0D0B' : '#F2B84B');
    sunMat.transparent = sun.isBlocked;
    sunMat.opacity = sun.isBlocked ? 0.65 : 1;
    this.sunMarker.children[1].visible = sun.isBlocked;

    // Earth Marker
    this.toCartesian(earth.az, earthEl, this.radius, _scratchPos);
    this.earthMarker.position.copy(_scratchPos);
    this.earthMarker.visible = true;
    const earthMat = (this.earthMarker.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    earthMat.color.set(earth.isBlocked ? '#0C0D0B' : '#5FA8D3');
    earthMat.transparent = earth.isBlocked;
    earthMat.opacity = earth.isBlocked ? 0.65 : 1;
    this.earthMarker.children[1].visible = earth.isBlocked;
  }

  /** Common angular magnification preserves the 1.9 / 0.53 diameter ratio at a readable minimum. */
  public prepareView(camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    const sunPixels = Math.max(5.5, (viewportHeight * 0.53) / camera.fov / 2);
    const vh = Math.max(1, viewportHeight);
    const tanFov = Math.tan((camera.fov * Math.PI) / 360);

    // Sun marker (ratio 1)
    this.sunMarker.getWorldPosition(_scratchPos);
    const sunDist = camera.position.distanceTo(_scratchPos);
    const sunUnitsPerPixel = (2 * sunDist * tanFov) / vh;
    this.sunMarker.scale.setScalar(sunUnitsPerPixel * sunPixels);
    this.sunMarker.children[1].quaternion.copy(camera.quaternion);

    // Earth marker (ratio 1.9 / 0.53)
    this.earthMarker.getWorldPosition(_scratchPos);
    const earthDist = camera.position.distanceTo(_scratchPos);
    const earthUnitsPerPixel = (2 * earthDist * tanFov) / vh;
    this.earthMarker.scale.setScalar(earthUnitsPerPixel * sunPixels * (1.9 / 0.53));
    this.earthMarker.children[1].quaternion.copy(camera.quaternion);
  }

  /**
   * Explicit cleanup of all geometries, materials, and children
   */
  public destroy(): void {
    const disposeObject = (object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else if (object.material) {
          object.material.dispose();
        }
      }
    };

    this.group.traverse(disposeObject);
    this.terrain.clear();
    this.sunPathGroup.clear();
    this.earthPathGroup.clear();
    this.domeWireframeGroup.clear();
  }
}
