import * as THREE from 'three';
import { EphemerisSample, CelestialBodyPos } from '../../types';

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

  constructor() {
    this.group.name = 'SkyDomeElements';
    this.buildGraticule();
    this.domeWireframeGroup.add(this.terrain);
    this.sunMarker = this.marker('#F2B84B'); this.earthMarker = this.marker('#5FA8D3');
    this.group.add(this.domeWireframeGroup, this.sunPathGroup, this.earthPathGroup, this.sunMarker, this.earthMarker, this.sunRay, this.earthRay, this.occlusionCrosshair, this.hudLabelsGroup);
    this.sunRay.visible = false; this.earthRay.visible = false; this.occlusionCrosshair.visible = false;
    this.group.visible = false;
    this.updateHorizon(this.profile);
  }

  /** Physical spherical conversion, unchanged: north +Z, east +X, zenith +Y. */
  public toCartesian(azDeg: number, elDeg: number, r = this.radius, target?: THREE.Vector3): THREE.Vector3 {
    const el = elDeg * Math.PI / 180, az = azDeg * Math.PI / 180;
    const x = r * Math.cos(el) * Math.sin(az), y = r * Math.sin(el), z = r * Math.cos(el) * Math.cos(az);
    return target ? target.set(x, y, z) : new THREE.Vector3(x, y, z);
  }

  public displayElevation(elevation: number): number {
    return Math.atan(Math.tan(elevation * Math.PI / 180) * this.heightExaggeration) * 180 / Math.PI;
  }

  public setHeightExaggeration(factor: number): void {
    if (factor === this.heightExaggeration) return;
    this.heightExaggeration = factor;
    this.updateHorizon(this.profile); this.updatePaths(this.samples);
    if (this.sun && this.earth) this.updatePositions(this.sun, this.earth);
  }

  private marker(color: string): THREE.Group {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false }));
    disc.renderOrder = 10; group.add(disc);
    const points = Array.from({ length: 97 }, (_, i) => {
      const angle = i / 96 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    });
    const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color, toneMapped: false, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.65, depthTest: false }));
    outline.computeLineDistances(); outline.renderOrder = 11; outline.visible = false; group.add(outline);
    return group;
  }

  private buildGraticule(): void {
    const material = new THREE.LineBasicMaterial({ color: '#ECE8DD', toneMapped: false, transparent: true, opacity: 0.14 });
    for (const elevation of [0, 10, 20, 30, 60]) {
      const points = Array.from({ length: 97 }, (_, i) => this.toCartesian(i / 96 * 360, elevation));
      this.domeWireframeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
    for (let az = 0; az < 360; az += 30) {
      const points = Array.from({ length: 31 }, (_, i) => this.toCartesian(az, i * 3));
      this.domeWireframeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
  }

  private clear(group: THREE.Group): void {
    group.children.slice().forEach(object => {
      group.remove(object);
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
      }
    });
  }

  public updateHorizon(profile: number[]): void {
    this.profile = [...profile]; this.clear(this.terrain);
    const points = [...profile, profile[0]].map((el, az) => this.toCartesian(az, this.displayElevation(el)));
    const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#8F8B80', toneMapped: false }));
    this.terrain.add(edge);
    const vertices: number[] = [];
    for (let i = 0; i < 360; i++) {
      const a = points[i], b = points[i + 1];
      vertices.push(a.x, -0.25, a.z, b.x, -0.25, b.z, b.x, b.y, b.z, a.x, -0.25, a.z, b.x, b.y, b.z, a.x, a.y, a.z);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const wall = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#0C0D0B', toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
    wall.renderOrder = -1;
    this.terrain.add(wall);
  }

  public updatePaths(samples: EphemerisSample[]): void {
    this.samples = samples;
    for (const body of ['sun', 'earth'] as const) {
      const group = body === 'sun' ? this.sunPathGroup : this.earthPathGroup;
      this.clear(group);
      const up: THREE.Vector3[] = [], blocked: THREE.Vector3[] = [];
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1][body], b = samples[i][body];
        const points = a.isBlocked || b.isBlocked ? blocked : up;
        points.push(this.toCartesian(a.az, this.displayElevation(a.el)), this.toCartesian(b.az, this.displayElevation(b.el)));
      }
      for (const [points, color] of [[up, body === 'sun' ? '#F2B84B' : '#5FA8D3'], [blocked, '#C4483A']] as const) {
        group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.3 })));
      }
    }
  }

  public updatePositions(sun: CelestialBodyPos, earth: CelestialBodyPos): void {
    this.sun = sun; this.earth = earth;
    for (const [marker, point, color] of [[this.sunMarker, sun, '#F2B84B'], [this.earthMarker, earth, '#5FA8D3']] as const) {
      marker.position.copy(this.toCartesian(point.az, this.displayElevation(point.el)));
      marker.visible = true;
      const material = (marker.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.color.set(point.isBlocked ? '#0C0D0B' : color);
      material.transparent = point.isBlocked; material.opacity = point.isBlocked ? 0.65 : 1;
      marker.children[1].visible = point.isBlocked;
    }
  }

  /** Common angular magnification preserves the 1.9 / 0.53 diameter ratio at a readable minimum. */
  public prepareView(camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    const sunPixels = Math.max(5.5, viewportHeight * 0.53 / camera.fov / 2);
    for (const [marker, ratio] of [[this.sunMarker, 1], [this.earthMarker, 1.9 / 0.53]] as const) {
      const distance = camera.position.distanceTo(marker.position);
      const unitsPerPixel = 2 * distance * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, viewportHeight);
      marker.scale.setScalar(unitsPerPixel * sunPixels * ratio);
      marker.children[1].quaternion.copy(camera.quaternion);
    }
  }
}
