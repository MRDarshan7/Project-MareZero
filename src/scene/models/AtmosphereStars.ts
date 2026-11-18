import * as THREE from 'three';
import { CelestialTextures } from '../materials/CelestialTextures';

interface FloodlightAssembly {
  light: THREE.SpotLight;
  beamMesh: THREE.Mesh;
  baseIntensity: number;
  baseBeamOpacity: number;
}

/**
 * Creates soft, anti-aliased billboarded radial gradient texture
 * for realistic cryogenic liquid oxygen boil-off vapor.
 */
function createVaporTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  try {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.18, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.42, 'rgba(240, 248, 255, 0.65)');
    grad.addColorStop(0.72, 'rgba(220, 238, 255, 0.22)');
    grad.addColorStop(1.0, 'rgba(210, 230, 250, 0.0)');
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
 * Creates vertical atmospheric horizon gradient for night launchpad
 * (#070b14 deep indigo blending smoothly into the dark ground plane).
 */
function createHorizonTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  try {
    const w = 128;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0.0, '#070b14');
    grad.addColorStop(0.12, '#070b14');
    grad.addColorStop(0.32, '#0c152a');
    grad.addColorStop(0.55, '#070b14');
    grad.addColorStop(1.0, 'rgba(7, 11, 20, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(4, 1);
    tex.needsUpdate = true;
    return tex;
  } catch {
    return new THREE.Texture();
  }
}

/**
 * Helper to build an oriented volumetric cone beam between light source and target
 */
function createBeamCone(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radiusFrom: number,
  radiusTo: number,
  colorHex: number,
  opacity: number
): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radiusTo, radiusFrom, len, 16, 1, true);

  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: opacity,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geo, mat);
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return { mesh, mat };
}

export class AtmosphereStars {
  public group: THREE.Group;
  public launchGround: THREE.Group;
  public cloudLayers: THREE.Group;
  public distantEarth: THREE.Group;
  public approachMoon: THREE.Group;
  public starfield: THREE.Points;
  public directionalSun: THREE.DirectionalLight;
  public ambientLight: THREE.AmbientLight;
  public rimLight: THREE.DirectionalLight;
  public moonBounceLight: THREE.DirectionalLight;

  // Launch pad interactive elements
  public swingArm: THREE.Group;
  public boosterSwingArm: THREE.Group;
  public holdDownClamps: THREE.Group[] = [];
  public ignitionLight: THREE.PointLight;
  public vaporPoints: THREE.Points;
  private vaporPositions: Float32Array;
  private vaporCount = 120;
  private vaporMat: THREE.PointsMaterial;

  // Night launch enhancements
  public floodlights: FloodlightAssembly[] = [];
  public beaconMaterials: THREE.MeshBasicMaterial[] = [];
  public horizonGlow: THREE.Mesh;
  public translunarTrajectory: THREE.Line;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'AtmosphereStars';

    // 1. Lighting (Sunlight + Rim Light)
    this.ambientLight = new THREE.AmbientLight(0xdde5f5, 0.65);
    this.group.add(this.ambientLight);

    this.directionalSun = new THREE.DirectionalLight(0xfff5e6, 2.8);
    this.directionalSun.position.set(45, 50, 35);
    this.directionalSun.castShadow = true;
    this.directionalSun.shadow.mapSize.width = 2048;
    this.directionalSun.shadow.mapSize.height = 2048;
    this.directionalSun.shadow.camera.near = 0.5;
    this.directionalSun.shadow.camera.far = 250;
    this.directionalSun.shadow.camera.left = -32;
    this.directionalSun.shadow.camera.right = 32;
    this.directionalSun.shadow.camera.top = 32;
    this.directionalSun.shadow.camera.bottom = -32;
    this.directionalSun.shadow.bias = -0.0005;
    this.group.add(this.directionalSun);

    // Rim light for dramatic aerospace edge highlighting
    this.rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.9);
    this.rimLight.position.set(-35, 25, -40);
    this.group.add(this.rimLight);

    // Subtle upward-facing soft fill light (Moon-bounce albedo light under the lander)
    this.moonBounceLight = new THREE.DirectionalLight(0xb4bcc8, 0.0);
    this.moonBounceLight.position.set(0, -25, 0);
    this.moonBounceLight.target.position.set(0, 0, 0);
    this.group.add(this.moonBounceLight);
    this.group.add(this.moonBounceLight.target);

    // 2. Launch Complex 39B Pad, Lattice Gantry Tower & Ground
    this.launchGround = new THREE.Group();

    // Massive Horizon Ground Plane (Extends to visible distance R = 400)
    // Matches the #070b14 background & distance fog so horizon has zero hard edge
    const groundGeo = new THREE.PlaneGeometry(800, 800, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070b14, // Matches dark night sky & horizon distance fog
      roughness: 0.96,
      metalness: 0.05
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -2.0;
    groundMesh.receiveShadow = true;
    this.launchGround.add(groundMesh);

    // Subtle Deep-Indigo Atmospheric Horizon Glow Cylinder (#070b14 fading into night starfield)
    const horizonGeo = new THREE.CylinderGeometry(380, 380, 160, 32, 1, true);
    const horizonMat = new THREE.MeshBasicMaterial({
      map: createHorizonTexture(),
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });
    this.horizonGlow = new THREE.Mesh(horizonGeo, horizonMat);
    this.horizonGlow.position.set(0, 45, 0);
    this.launchGround.add(this.horizonGlow);

    // ----------------------------------------------------
    // Raised Concrete Mobile Launcher Platform (MLP) & Pedestal
    // Centered directly at (x: 0, z: 0) directly underneath the rocket nozzles
    // ----------------------------------------------------
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x3e4551, // Weathered reinforced concrete
      roughness: 0.90,
      metalness: 0.12
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x64748b, // Industrial structural steel
      roughness: 0.45,
      metalness: 0.8
    });
    const railingMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Safety yellow industrial railings
      roughness: 0.40,
      metalness: 0.70
    });

    const mlpGroup = new THREE.Group();
    mlpGroup.position.set(0, 0, 0);

    // Heavy Octagonal Concrete Pedestal Foundation (Top at Y=0, Base at Y=-2.2)
    const octGeo = new THREE.CylinderGeometry(14.0, 15.2, 2.2, 8);
    const octPad = new THREE.Mesh(octGeo, concreteMat);
    octPad.position.y = -1.1;
    octPad.rotation.y = Math.PI / 8; // align flat faces with X/Z axes
    octPad.receiveShadow = true;
    mlpGroup.add(octPad);

    // Elevated Center Thrust Mounting Ring Collar directly beneath rocket engine cluster
    const thrustRingGeo = new THREE.CylinderGeometry(2.6, 2.9, 0.4, 32);
    const thrustRing = new THREE.Mesh(thrustRingGeo, steelMat);
    thrustRing.position.y = 0.2;
    thrustRing.receiveShadow = true;
    mlpGroup.add(thrustRing);

    // Equipment Enclosures on MLP Deck Corners
    const eqBoxGeo = new THREE.BoxGeometry(2.8, 1.4, 2.4);
    const eqCoords = [
      [7.5, 0.7, 7.5],
      [-7.5, 0.7, 7.5],
      [7.5, 0.7, -7.5],
      [-7.5, 0.7, -7.5]
    ];
    for (const [ex, ey, ez] of eqCoords) {
      const eqBox = new THREE.Mesh(eqBoxGeo, steelMat);
      eqBox.position.set(ex, ey, ez);
      mlpGroup.add(eqBox);

      // High-pressure gaseous purge storage sphere
      const tankGeo = new THREE.SphereGeometry(0.7, 12, 12);
      const tank = new THREE.Mesh(tankGeo, concreteMat);
      tank.position.set(ex, ey + 1.2, ez);
      mlpGroup.add(tank);
    }

    // Perimeter Safety Railings along the Raised Pedestal Edge
    const railRadius = 12.0;
    const railPosts = 24;
    const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6);
    const topRailGeo = new THREE.TorusGeometry(railRadius, 0.028, 6, 32);
    const midRailGeo = new THREE.TorusGeometry(railRadius, 0.022, 6, 32);

    for (let r = 0; r < railPosts; r++) {
      const angle = (r / railPosts) * Math.PI * 2;
      // Skip opening for flame trench exits along Z
      if (Math.abs(Math.sin(angle)) > 0.88) continue;
      const post = new THREE.Mesh(postGeo, railingMat);
      post.position.set(Math.cos(angle) * railRadius, 0.45, Math.sin(angle) * railRadius);
      mlpGroup.add(post);
    }

    const topRail = new THREE.Mesh(topRailGeo, railingMat);
    topRail.rotation.x = Math.PI / 2;
    topRail.position.y = 0.9;
    mlpGroup.add(topRail);

    const midRail = new THREE.Mesh(midRailGeo, railingMat);
    midRail.rotation.x = Math.PI / 2;
    midRail.position.y = 0.45;
    mlpGroup.add(midRail);

    // Central Flame Trench Cutout directly beneath rocket engines (Recessed to Y = -3.8)
    const trenchMat = new THREE.MeshStandardMaterial({
      color: 0x14171d, // Scorched refractory ceramic & soot
      roughness: 0.95,
      metalness: 0.1
    });
    const trenchGeo = new THREE.BoxGeometry(5.8, 3.8, 18.0);
    const trench = new THREE.Mesh(trenchGeo, trenchMat);
    trench.position.set(0, -1.9, 0);
    mlpGroup.add(trench);

    // Double-Sided V-Wedge Steel Flame Deflector inside the trench
    const deflectorMat = new THREE.MeshStandardMaterial({
      color: 0x1e232b, // Scorched heat deflector steel
      metalness: 0.70,
      roughness: 0.65
    });
    const deflectorGeo = new THREE.ConeGeometry(2.4, 4.0, 4);
    deflectorGeo.scale(1.2, 0.8, 3.2);
    const deflector = new THREE.Mesh(deflectorGeo, deflectorMat);
    deflector.position.set(0, -2.4, 0);
    deflector.rotation.y = Math.PI / 4;
    mlpGroup.add(deflector);

    // Water Deluge Blast Pipes along trench lip
    const delugeMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5, metalness: 0.6 });
    for (const sx of [-2.9, 2.9]) {
      const delugePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 17.5, 8), delugeMat);
      delugePipe.rotation.x = Math.PI / 2;
      delugePipe.position.set(sx, 0.1, 0);
      mlpGroup.add(delugePipe);
    }

    this.launchGround.add(mlpGroup);

    // ----------------------------------------------------
    // Four Lightning Protection Masts repositioned inward onto pad corners
    // Height scaled down to 29.5 so beacons stay comfortably below top viewport edge
    // ----------------------------------------------------
    const mastCoords: Array<[number, number]> = [
      [-9.5, 8.5],   // Front-Left corner of pad structure
      [9.5, 8.5],    // Front-Right corner of pad structure
      [-9.5, -8.5],  // Rear-Left corner of pad structure
      [9.5, -8.5]    // Rear-Right corner of pad structure
    ];

    const mastH = 29.5;
    const mastPylonGeo = new THREE.CylinderGeometry(0.12, 0.50, mastH, 8);
    const spireGeo = new THREE.CylinderGeometry(0.02, 0.08, 2.4, 6);
    const beaconGeo = new THREE.SphereGeometry(0.22, 8, 8);

    for (let m = 0; m < mastCoords.length; m++) {
      const [mx, mz] = mastCoords[m];
      const mastGroup = new THREE.Group();
      mastGroup.position.set(mx, 0, mz);

      // Heavy Concrete Base Pier
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 0.8, 8), concreteMat);
      pier.position.y = -1.6;
      mastGroup.add(pier);

      // Main Steel Lattice Tapered Pylon
      const pylon = new THREE.Mesh(mastPylonGeo, steelMat);
      pylon.position.y = mastH / 2 - 2.0; // extends up to Y=27.5
      mastGroup.add(pylon);

      // Intermediate Service Platforms
      for (const py of [8.0, 18.0]) {
        const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.70, 0.15, 8), steelMat);
        plat.position.y = py;
        mastGroup.add(plat);
      }

      // Top Lightning Arrestor Needle Spire
      const spire = new THREE.Mesh(spireGeo, steelMat);
      spire.position.y = mastH - 2.0 + 1.2;
      mastGroup.add(spire);

      // Tiny Red Aviation Warning Beacon at Mast Apex (stays cleanly below top of viewport at Y=29.9)
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });
      this.beaconMaterials.push(beaconMat);
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.y = mastH - 2.0 + 2.4;
      mastGroup.add(beacon);

      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xff2233,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), haloMat);
      halo.position.copy(beacon.position);
      mastGroup.add(halo);

      // Subtle localized warning beacon glow for the front masts
      if (mz > 0) {
        const beaconLight = new THREE.PointLight(0xff1122, 1.2, 12, 1.8);
        beaconLight.position.copy(beacon.position);
        mastGroup.add(beaconLight);
      }

      this.launchGround.add(mastGroup);
    }

    // ----------------------------------------------------
    // Open Steel Lattice Launch Umbilical Tower (Detailed)
    // Standing cleanly beside rocket at x = -6.0, z = -1.6 inside pad perimeter
    // ----------------------------------------------------
    const towerGroup = new THREE.Group();
    towerGroup.position.set(-6.0, 0, -1.6);

    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.50,
      metalness: 0.75
    });

    const towerH = 35.0;
    const towerW = 3.2;

    // 4 Vertical Corner Steel Columns (Legs)
    const legGeo = new THREE.BoxGeometry(0.36, towerH, 0.36);
    const legOffsets = [
      [-towerW / 2, -towerW / 2],
      [towerW / 2, -towerW / 2],
      [-towerW / 2, towerW / 2],
      [towerW / 2, towerW / 2]
    ];
    for (const [ox, oz] of legOffsets) {
      const leg = new THREE.Mesh(legGeo, steelMat);
      leg.position.set(ox, towerH / 2, oz);
      towerGroup.add(leg);
    }

    // 10 Structural Bays with Horizontal Perimeter Girders & Full X-Brace Trusses
    const floors = 10;
    const hBeamGeoX = new THREE.BoxGeometry(towerW, 0.16, 0.16);
    const hBeamGeoZ = new THREE.BoxGeometry(0.16, 0.16, towerW);

    for (let f = 0; f <= floors; f++) {
      const fy = (f / floors) * towerH;

      // Platform Floor Deck (every 2nd level)
      if (f % 2 === 0 && f > 0) {
        const platGeo = new THREE.BoxGeometry(towerW + 0.6, 0.12, towerW + 0.6);
        const plat = new THREE.Mesh(platGeo, steelMat);
        plat.position.set(0, fy, 0);
        towerGroup.add(plat);
      }

      // Perimeter horizontal box girders (North, South, East, West)
      const bNorth = new THREE.Mesh(hBeamGeoX, trussMat);
      bNorth.position.set(0, fy, -towerW / 2);
      towerGroup.add(bNorth);

      const bSouth = new THREE.Mesh(hBeamGeoX, trussMat);
      bSouth.position.set(0, fy, towerW / 2);
      towerGroup.add(bSouth);

      const bWest = new THREE.Mesh(hBeamGeoZ, trussMat);
      bWest.position.set(-towerW / 2, fy, 0);
      towerGroup.add(bWest);

      const bEast = new THREE.Mesh(hBeamGeoZ, trussMat);
      bEast.position.set(towerW / 2, fy, 0);
      towerGroup.add(bEast);

      // Diagonal X-brace truss struts across each bay on ALL 4 faces
      if (f < floors) {
        const segH = towerH / floors;
        const diagLen = Math.hypot(towerW, segH);
        const diagAngle = Math.atan2(segH, towerW);
        const diagGeo = new THREE.CylinderGeometry(0.035, 0.035, diagLen, 6);

        // East Face (facing rocket)
        const dE1 = new THREE.Mesh(diagGeo, trussMat);
        dE1.position.set(towerW / 2, fy + segH / 2, 0);
        dE1.rotation.x = diagAngle;
        towerGroup.add(dE1);

        const dE2 = new THREE.Mesh(diagGeo, trussMat);
        dE2.position.set(towerW / 2, fy + segH / 2, 0);
        dE2.rotation.x = -diagAngle;
        towerGroup.add(dE2);

        // West Face (back)
        const dW1 = new THREE.Mesh(diagGeo, trussMat);
        dW1.position.set(-towerW / 2, fy + segH / 2, 0);
        dW1.rotation.x = diagAngle;
        towerGroup.add(dW1);

        const dW2 = new THREE.Mesh(diagGeo, trussMat);
        dW2.position.set(-towerW / 2, fy + segH / 2, 0);
        dW2.rotation.x = -diagAngle;
        towerGroup.add(dW2);

        // North Face
        const dN1 = new THREE.Mesh(diagGeo, trussMat);
        dN1.position.set(0, fy + segH / 2, -towerW / 2);
        dN1.rotation.z = diagAngle;
        towerGroup.add(dN1);

        const dN2 = new THREE.Mesh(diagGeo, trussMat);
        dN2.position.set(0, fy + segH / 2, -towerW / 2);
        dN2.rotation.z = -diagAngle;
        towerGroup.add(dN2);

        // South Face
        const dS1 = new THREE.Mesh(diagGeo, trussMat);
        dS1.position.set(0, fy + segH / 2, towerW / 2);
        dS1.rotation.z = diagAngle;
        towerGroup.add(dS1);

        const dS2 = new THREE.Mesh(diagGeo, trussMat);
        dS2.position.set(0, fy + segH / 2, towerW / 2);
        dS2.rotation.z = -diagAngle;
        towerGroup.add(dS2);
      }
    }

    // Vertical Propellant Pipes along Tower Spine (LOX, Fuel, Gaseous Purge)
    const loxPipeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35, metalness: 0.25 });
    const fuelPipeMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.40, metalness: 0.70 });
    const purgePipeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.30, metalness: 0.85 });

    // Pipe 1: Insulated LOX Line (White, Y=0 to 28)
    const loxPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 28.0, 10), loxPipeMat);
    loxPipe.position.set(-towerW / 2 + 0.3, 14.0, -towerW / 2 - 0.22);
    towerGroup.add(loxPipe);

    // Pipe 2: Fuel Line (Slate Steel, Y=0 to 22)
    const fuelPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 22.0, 10), fuelPipeMat);
    fuelPipe.position.set(-towerW / 2 + 0.3, 11.0, towerW / 2 + 0.22);
    towerGroup.add(fuelPipe);

    // Pipe 3: High-Pressure Purge Line (Titanium Silver, Y=0 to 33)
    const purgePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 33.0, 8), purgePipeMat);
    purgePipe.position.set(-towerW / 2 - 0.22, 16.5, 0);
    towerGroup.add(purgePipe);

    // Crew / Payload Access Room ("White Room" Cleanroom near top at Y = 25.5)
    const cleanroomGroup = new THREE.Group();
    cleanroomGroup.position.set(towerW / 2 + 0.3, 25.5, 0.2);

    const roomMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.40, metalness: 0.15 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.10, metalness: 0.90 });

    const roomBody = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 2.8), roomMat);
    roomBody.position.set(1.7, 0, 0);
    cleanroomGroup.add(roomBody);

    // Dark Tinted Viewing Windows
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.06), windowMat);
    win.position.set(1.7, 0.2, 1.43);
    cleanroomGroup.add(win);

    // Rooftop HVAC Environmental Conditioning Unit
    const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.4), trussMat);
    hvac.position.set(1.7, 1.65, 0);
    cleanroomGroup.add(hvac);

    // Accordion Seal / Flexible Tunnel extending toward payload fairing
    const accordMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8, metalness: 0.2 });
    const accord = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.6), accordMat);
    accord.position.set(3.8, 0, 0);
    cleanroomGroup.add(accord);

    towerGroup.add(cleanroomGroup);

    // Top Lightning Mast extending above rocket nose
    const mastGeo = new THREE.CylinderGeometry(0.05, 0.15, 6.5, 8);
    const mast = new THREE.Mesh(mastGeo, steelMat);
    mast.position.set(0, towerH + 3.2, 0);
    towerGroup.add(mast);

    // ----------------------------------------------------
    // Two Articulated Umbilical Swing Arms (Retract on liftoff in Beat 1)
    // ----------------------------------------------------
    const boomLen = 3.4;

    // 1. Upper Stage Umbilical Swing Arm (Stage 2 & Payload Service, Y = 21.0)
    this.swingArm = new THREE.Group();
    this.swingArm.position.set(towerW / 2, 21.0, 0);
    this.swingArm.rotation.y = 0.35; // angled cleanly toward rocket center

    const upperBoomGeo = new THREE.BoxGeometry(boomLen, 0.70, 0.75);
    const upperBoom = new THREE.Mesh(upperBoomGeo, steelMat);
    upperBoom.position.x = boomLen / 2;
    this.swingArm.add(upperBoom);

    // Upper Umbilical Disconnect Carrier Head & Flexible Lines
    const upperHeadGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.7, 12);
    const upperHead = new THREE.Mesh(upperHeadGeo, concreteMat);
    upperHead.rotation.z = Math.PI / 2;
    upperHead.position.set(boomLen, 0, 0);
    this.swingArm.add(upperHead);

    const upperHoseGeo = new THREE.TorusGeometry(0.35, 0.05, 6, 12, Math.PI);
    const upperHose = new THREE.Mesh(upperHoseGeo, loxPipeMat);
    upperHose.position.set(boomLen - 0.3, -0.35, 0);
    upperHose.rotation.z = Math.PI;
    this.swingArm.add(upperHose);

    towerGroup.add(this.swingArm);

    // 2. First Stage / Booster Umbilical Swing Arm (Y = 9.5)
    this.boosterSwingArm = new THREE.Group();
    this.boosterSwingArm.position.set(towerW / 2, 9.5, 0);
    this.boosterSwingArm.rotation.y = 0.35;

    const lowerBoomGeo = new THREE.BoxGeometry(boomLen, 0.65, 0.70);
    const lowerBoom = new THREE.Mesh(lowerBoomGeo, steelMat);
    lowerBoom.position.x = boomLen / 2;
    this.boosterSwingArm.add(lowerBoom);

    const lowerHeadGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.65, 12);
    const lowerHead = new THREE.Mesh(lowerHeadGeo, concreteMat);
    lowerHead.rotation.z = Math.PI / 2;
    lowerHead.position.set(boomLen, 0, 0);
    this.boosterSwingArm.add(lowerHead);

    const lowerHoseGeo = new THREE.TorusGeometry(0.32, 0.05, 6, 12, Math.PI);
    const lowerHose = new THREE.Mesh(lowerHoseGeo, fuelPipeMat);
    lowerHose.position.set(boomLen - 0.3, -0.32, 0);
    lowerHose.rotation.z = Math.PI;
    this.boosterSwingArm.add(lowerHose);

    towerGroup.add(this.boosterSwingArm);

    this.launchGround.add(towerGroup);

    // ----------------------------------------------------
    // 4 Hold-Down Clamps centered directly around rocket base (x: 0, z: 0)
    // ----------------------------------------------------
    const clampMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.8 }); // Safety amber
    for (let c = 0; c < 4; c++) {
      const angle = (c * Math.PI) / 2 + Math.PI / 4;
      const clampGroup = new THREE.Group();
      clampGroup.position.set(
        Math.cos(angle) * 2.3,
        0,
        Math.sin(angle) * 2.3
      );
      clampGroup.rotation.y = angle + Math.PI / 2;

      // Heavy Hydraulic Base Housing
      const clampBase = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.8), steelMat);
      clampBase.position.set(0, 0.25, 0);
      clampGroup.add(clampBase);

      // Articulated Clamping Claw
      const clawGeo = new THREE.BoxGeometry(0.38, 1.4, 0.55);
      const claw = new THREE.Mesh(clawGeo, clampMat);
      claw.position.set(0, 0.7, 0);
      clampGroup.add(claw);

      this.holdDownClamps.push(clampGroup);
      this.launchGround.add(clampGroup);
    }

    // ----------------------------------------------------
    // Night-Launch Stadium Floodlights & Volumetric Beam Cones
    // Aimed directly at rocket center (x: 0, z: 0)
    // ----------------------------------------------------
    const floodlightConfigs = [
      {
        // Floodlight 1: Front-Right key light illuminating MAREZERO livery & Indian flag
        pos: new THREE.Vector3(7.2, 3.8, 8.5),
        target: new THREE.Vector3(0, 12.0, 0),
        color: 0xecfeff,
        intensity: 8.5,
        beamColor: 0x93c5fd,
        beamOpacity: 0.22
      },
      {
        // Floodlight 2: Front-Left tower / upper stage highlight
        pos: new THREE.Vector3(-9.2, 6.5, 6.5),
        target: new THREE.Vector3(0, 19.5, 0),
        color: 0xf8fafc,
        intensity: 6.5,
        beamColor: 0xbfdbfe,
        beamOpacity: 0.18
      },
      {
        // Floodlight 3: Rear-Right crisp cool-cyan back-rim highlight
        pos: new THREE.Vector3(6.8, 4.8, -9.0),
        target: new THREE.Vector3(0, 11.0, 0),
        color: 0x7dd3fc,
        intensity: 7.2,
        beamColor: 0x7dd3fc,
        beamOpacity: 0.20
      }
    ];

    const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (const cfg of floodlightConfigs) {
      // Elevated Support Stanchion Pole
      const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, cfg.pos.y + 2.0, 8), steelMat);
      stanchion.position.set(cfg.pos.x, (cfg.pos.y - 2.0) / 2, cfg.pos.z);
      this.launchGround.add(stanchion);

      // Stadium Bank Fixture Head
      const fixtureBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.4), steelMat);
      fixtureBox.position.copy(cfg.pos);
      fixtureBox.lookAt(cfg.target);
      this.launchGround.add(fixtureBox);

      // Glowing Emitter Lenses
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), fixtureMat);
      lens.position.set(0, 0, 0.21);
      fixtureBox.add(lens);

      // High-output Spotlight
      const spot = new THREE.SpotLight(cfg.color, cfg.intensity, 90, Math.PI / 6.0, 0.55, 0.9);
      spot.position.copy(cfg.pos);
      spot.target.position.copy(cfg.target);
      spot.castShadow = false; // lightweight for 60 FPS
      this.launchGround.add(spot);
      this.launchGround.add(spot.target);

      // Volumetric Light Beam Cone
      const { mesh: beamMesh, mat: beamMat } = createBeamCone(
        cfg.pos,
        cfg.target,
        0.4,
        4.0,
        cfg.beamColor,
        cfg.beamOpacity
      );
      this.launchGround.add(beamMesh);

      this.floodlights.push({
        light: spot,
        beamMesh,
        baseIntensity: cfg.intensity,
        baseBeamOpacity: cfg.beamOpacity
      });
    }

    // Ignition Flash Light directly at rocket base
    this.ignitionLight = new THREE.PointLight(0xff7711, 0, 45, 1.6);
    this.ignitionLight.position.set(0, 0.5, 0);
    this.launchGround.add(this.ignitionLight);

    // ----------------------------------------------------
    // Soft Volumetric Cryogenic Vent Vapor (Semi-transparent billboarded sprites)
    // Directly venting from upper stage LOX valve at x = 1.62, y = 20.8
    // ----------------------------------------------------
    const vaporGeo = new THREE.BufferGeometry();
    this.vaporPositions = new Float32Array(this.vaporCount * 3);

    // Initialize with soft dispersed plume right of the upper stage (vent at X=1.62, Y=20.8)
    for (let i = 0; i < this.vaporCount; i++) {
      const idx = i * 3;
      const life = i / this.vaporCount;
      const driftX = Math.pow(life, 0.62) * 3.4;
      const driftY = Math.sin(life * Math.PI * 0.7) * 0.35 - Math.pow(life, 1.8) * 1.3;
      const driftZ = Math.sin(i * 3.7) * (0.45 * life);
      const jitter = Math.sin(i * 11.3) * (0.2 * life);

      this.vaporPositions[idx] = 1.62 + driftX + jitter;
      this.vaporPositions[idx + 1] = 20.8 + driftY + jitter;
      this.vaporPositions[idx + 2] = 0.2 + driftZ;
    }
    vaporGeo.setAttribute('position', new THREE.BufferAttribute(this.vaporPositions, 3));

    this.vaporMat = new THREE.PointsMaterial({
      map: createVaporTexture(),
      size: 3.2,
      transparent: true,
      depthWrite: false,
      opacity: 0.25,
      blending: THREE.NormalBlending,
      vertexColors: false
    });

    this.vaporPoints = new THREE.Points(vaporGeo, this.vaporMat);
    this.vaporPoints.frustumCulled = false;
    this.launchGround.add(this.vaporPoints);

    this.group.add(this.launchGround);

    // 3. Cloud Layers (Soft translucent volumetric discs with parallax)
    this.cloudLayers = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      roughness: 1.0,
      depthWrite: false
    });
    for (let i = 0; i < 18; i++) {
      const cr = 7 + Math.random() * 12;
      const cloudGeo = new THREE.SphereGeometry(cr, 12, 12);
      cloudGeo.scale(2.4, 0.18, 1.6);
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(
        (Math.random() - 0.5) * 90,
        18 + Math.random() * 24,
        (Math.random() - 0.5) * 90
      );
      this.cloudLayers.add(cloud);
    }
    this.group.add(this.cloudLayers);

    // 4. Crisp Cosmic Starfield (Deep space background)
    const starCount = 4500;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 240 + Math.random() * 120;

      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      const shade = Math.random();
      if (shade > 0.8) {
        starColors[i * 3] = 0.82;
        starColors[i * 3 + 1] = 0.90;
        starColors[i * 3 + 2] = 1.0;
      } else if (shade > 0.6) {
        starColors[i * 3] = 1.0;
        starColors[i * 3 + 1] = 0.94;
        starColors[i * 3 + 2] = 0.80;
      } else {
        starColors[i * 3] = 1.0;
        starColors[i * 3 + 1] = 1.0;
        starColors[i * 3 + 2] = 1.0;
      }
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.38
    });
    this.starfield = new THREE.Points(starGeo, starMat);
    this.group.add(this.starfield);

    // 5. Textured Distant Earth (Seen from ascent & translunar space)
    this.distantEarth = new THREE.Group();
    const dEarthGeo = new THREE.SphereGeometry(16, 48, 48);
    const earthTex = CelestialTextures.getEarthTexture();
    const dEarthMat = new THREE.MeshStandardMaterial({
      map: earthTex,
      roughness: 0.55,
      metalness: 0.1
    });
    const dEarthMesh = new THREE.Mesh(dEarthGeo, dEarthMat);
    dEarthMesh.rotation.y = -Math.PI * 0.35;
    this.distantEarth.add(dEarthMesh);

    // Blue atmospheric scattering halo
    const dAtmoGeo = new THREE.SphereGeometry(16.6, 48, 48);
    const dAtmoMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.32,
      side: THREE.BackSide
    });
    this.distantEarth.add(new THREE.Mesh(dAtmoGeo, dAtmoMat));
    this.distantEarth.position.set(-30, -50, -20);
    this.distantEarth.visible = false;
    this.group.add(this.distantEarth);

    // 6. High-Resolution Photorealistic NASA LRO Lunar Globe
    this.approachMoon = new THREE.Group();
    this.approachMoon.name = 'ApproachMoon';
    const moonSphereGeo = new THREE.SphereGeometry(22, 96, 96);
    const moonTex = CelestialTextures.getMoonTexture();
    const moonBump = CelestialTextures.getMoonBumpMap();
    const moonSphereMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      bumpMap: moonBump,
      bumpScale: 0.28,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: false
    });
    const moonMesh = new THREE.Mesh(moonSphereGeo, moonSphereMat);
    moonMesh.name = 'MoonGlobe';
    moonMesh.rotation.y = Math.PI * 1.5;
    moonMesh.castShadow = true;
    moonMesh.receiveShadow = false;
    this.approachMoon.add(moonMesh);

    this.approachMoon.position.set(0, 15, -120);
    this.approachMoon.visible = false;
    this.group.add(this.approachMoon);

    // 7. Subtle Dashed Orbital Trajectory Arc (Translunar injection corridor)
    const trajCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-28, 48, -200),
      new THREE.Vector3(-14, 56, -110),
      new THREE.Vector3(-4, 62, -35),
      new THREE.Vector3(0, 58, 2),
      new THREE.Vector3(2, 48, 12),
      new THREE.Vector3(0, 36, -30),
      new THREE.Vector3(-2, 22, -90),
      new THREE.Vector3(0, 12, -160)
    ]);
    const trajPoints = trajCurve.getPoints(120);
    const trajGeo = new THREE.BufferGeometry().setFromPoints(trajPoints);
    const trajMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 2.2,
      gapSize: 1.4,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.translunarTrajectory = new THREE.Line(trajGeo, trajMat);
    this.translunarTrajectory.computeLineDistances();
    this.translunarTrajectory.visible = false;
    this.group.add(this.translunarTrajectory);
  }

  /**
   * Deterministic cryogenic vapor billow simulation
   */
  private updateVaporParticles(timeSec: number): void {
    const ventX = 1.62;
    const ventY = 20.8;
    const ventZ = 0.2;
    const pos = this.vaporPositions;

    for (let i = 0; i < this.vaporCount; i++) {
      const idx = i * 3;
      const life = ((timeSec * 0.75 + i * (1.0 / this.vaporCount)) % 1.0);

      // Gently billow outward to the right (+X) and curl downward with gravity
      const driftX = Math.pow(life, 0.62) * 3.4;
      const driftY = Math.sin(life * Math.PI * 0.7) * 0.35 - Math.pow(life, 1.8) * 1.3;
      const driftZ = Math.sin(i * 3.7 + timeSec * 1.4) * (0.45 * life);
      const jitter = Math.sin(i * 11.3) * (0.2 * life);

      pos[idx] = ventX + driftX + jitter;
      pos[idx + 1] = ventY + driftY + jitter;
      pos[idx + 2] = ventZ + driftZ;
    }
    this.vaporPoints.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Deterministic animation of launch pad elements:
   * swing arms retraction, hold-down clamps, vapor venting, floodlights, and ignition flash
   */
  public updatePad(p: number, timeSec: number = 0): void {
    const clamp = (val: number, min = 0, max = 1) => Math.max(min, Math.min(max, val));
    const seg = (a: number, b: number) => clamp((p - a) / (b - a));

    // Swing Arms Retraction (p = 0.05 -> 0.10 in Beat 1)
    const armRetract = seg(0.05, 0.10);
    this.swingArm.rotation.y = 0.35 - armRetract * 1.45; // swings ~83° back clear of upper stage
    if (this.boosterSwingArm) {
      this.boosterSwingArm.rotation.y = 0.35 - armRetract * 1.40; // swings ~80° back clear of booster
    }

    // Hold-Down Clamps Release (p = 0.07 -> 0.09)
    const clampRelease = seg(0.07, 0.09);
    for (const c of this.holdDownClamps) {
      c.rotation.x = clampRelease * 0.85; // tilts back clear of nozzle
    }

    // Ignition & Liftoff Pad Base Illumination (p = 0.06 -> 0.16)
    if (p >= 0.06 && p <= 0.16) {
      const padIgnite = seg(0.06, 0.09) * (1 - seg(0.12, 0.16));
      this.ignitionLight.intensity = padIgnite * 8.5;
    } else {
      this.ignitionLight.intensity = 0;
    }

    // Cryogenic Boil-Off Vapor (Active on pad p <= 0.08, fades out during liftoff)
    if (p <= 0.08) {
      this.vaporPoints.visible = true;
      const fade = 1.0 - seg(0.06, 0.08);
      this.vaporMat.opacity = 0.25 * fade;
      this.updateVaporParticles(timeSec);
    } else {
      this.vaporPoints.visible = false;
    }

    // Stadium Floodlights (Active on pad, fades smoothly as rocket ascends past p = 0.08 -> 0.22)
    const floodFade = 1.0 - seg(0.08, 0.22);
    for (const f of this.floodlights) {
      f.light.intensity = f.baseIntensity * floodFade;
      (f.beamMesh.material as THREE.MeshBasicMaterial).opacity = f.baseBeamOpacity * floodFade;
    }

    // Aviation Warning Beacons (Subtle pulsing red glow at mast tips)
    if (this.beaconMaterials.length > 0) {
      const beaconFlash = 0.55 + 0.45 * Math.sin(timeSec * 5.0);
      for (const mat of this.beaconMaterials) {
        mat.color.setRGB(1.0 * beaconFlash, 0.06 * beaconFlash, 0.10 * beaconFlash);
      }
    }
  }
}
