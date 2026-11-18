import * as THREE from 'three';
import { LanderTextures } from '../materials/LanderTextures';

/**
 * High-Fidelity 3D Lunar Lander Spacecraft Model (Single Continuous Rig Instance)
 * 
 * Upgraded to match NASA Science Spacecraft & CLPS commercial lander visual targets
 * (Apollo LM, VIPER, LRO, Astrobotic Peregrine/Griffin, Intuitive Machines Nova-C):
 * 
 * - Main Bus: Octagonal descent stage clad in crinkled metallic gold Kapton MLI foil (Voronoi bump mapping)
 * - Power: Deployable photovoltaic solar array wings with monocrystalline silicon cells, silver busbars & hinges
 * - Avionics: Thermal-white cabin with recessed panel seams, dual stereo optical nav / star tracker cameras
 * - Comms: Steerable parabolic Direct-to-Earth High-Gain Antenna (HGA) dish with central feed horn
 * - Propulsion: Niobium/carbon descent engine bell with exterior cooling rings & warm amber combustion throat
 * - Reaction Control: 4-way RCS thruster quad manifold blocks on upper cabin corners
 * - Landing Gear: Brushed titanium telescopic shock struts, gold foil cuffs, and ribbed honeycomb footpads
 * - Lighting: Dedicated local spacecraft rim fill light for crisp visibility against deep space
 */
export class LanderModel {
  public group: THREE.Group;
  public bodyGroup: THREE.Group;
  public landingLegs: Array<{
    group: THREE.Group;
    strut: THREE.Mesh;
    pad: THREE.Mesh;
    brace: THREE.Mesh;
    restAngle: number;
  }> = [];

  public solarPanelLeft: THREE.Group;
  public solarPanelRight: THREE.Group;
  public antennaDish: THREE.Group;
  public antennaMast: THREE.Mesh;
  public engineFlame: THREE.Mesh;
  public engineLight: THREE.PointLight;
  public engineNozzle: THREE.Mesh;
  public underLanderFill: THREE.PointLight;
  public spacecraftRimLight: THREE.PointLight;

  // Stored state
  private deployProgress: number = 0;
  private legCompression: number = 0;
  private engineFacing: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'LanderModel';

    // The bodyGroup contains the lander body and pivots for retro-burn flip
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.name = 'LanderBody';
    this.group.add(this.bodyGroup);

    // ========================================================
    // 1. ADVANCED SPACECRAFT PBR MATERIALS
    // ========================================================

    // A. Crinkled Gold Kapton MLI Thermal Insulation Foil
    const goldFoilBump = LanderTextures.getGoldFoilBumpMap();
    const goldFoilAlbedo = LanderTextures.getGoldFoilAlbedoMap();
    const goldMliMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.35,
      map: goldFoilAlbedo,
      bumpMap: goldFoilBump,
      bumpScale: 0.03
    });

    // B. Aerospace Thermal-White Cabin Finish with Recessed Panel Lines
    const avionicsBump = LanderTextures.getAvionicsPanelBumpMap();
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0xf0f2f5,
      roughness: 0.5,
      metalness: 0.1,
      bumpMap: avionicsBump,
      bumpScale: 0.015
    });

    // C. Brushed Titanium / Aerospace Aluminum for Landing Gear & Mast
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xb0b5ba,
      metalness: 0.8,
      roughness: 0.3
    });

    // D. Dark Titanium / Inconel for Telescopic Collars & Fittings
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0x42464f,
      metalness: 0.85,
      roughness: 0.25
    });

    // E. Metallic Rim & Dark Ribbed Under-pad for Footpads
    const footpadRimMat = new THREE.MeshStandardMaterial({
      color: 0xc0c5cb,
      metalness: 0.85,
      roughness: 0.25
    });
    const footpadUnderMat = new THREE.MeshStandardMaterial({
      color: 0x22252a,
      roughness: 0.85,
      metalness: 0.15
    });

    // F. Deep Photovoltaic Navy/Indigo Solar Array Cells
    const solarMap = LanderTextures.getSolarCellTexture();
    const solarBump = LanderTextures.getSolarCellBumpMap();
    const solarCellMat = new THREE.MeshStandardMaterial({
      color: 0x0a1931,
      metalness: 0.7,
      roughness: 0.2,
      emissive: 0x030914,
      map: solarMap,
      bumpMap: solarBump,
      bumpScale: 0.02
    });

    const solarFrameMat = new THREE.MeshStandardMaterial({
      color: 0x8a929e, // Metallic aluminum frame border
      metalness: 0.85,
      roughness: 0.3
    });

    // G. Niobium / Carbon-Metallic Descent Engine Bell
    const engineOuterMat = new THREE.MeshStandardMaterial({
      color: 0x22252a,
      metalness: 0.85,
      roughness: 0.35
    });
    const engineThroatMat = new THREE.MeshStandardMaterial({
      color: 0xc26a20,
      roughness: 0.35,
      metalness: 0.75,
      emissive: 0x3d1704
    });
    const engineRingMat = new THREE.MeshStandardMaterial({
      color: 0x484d56,
      metalness: 0.9,
      roughness: 0.2
    });

    // H. Optical Navigation Camera Glass & Housing
    const lensHousingMat = new THREE.MeshStandardMaterial({
      color: 0x1f232b,
      metalness: 0.85,
      roughness: 0.3
    });
    const lensGlassMat = new THREE.MeshStandardMaterial({
      color: 0x050e1f,
      metalness: 0.9,
      roughness: 0.08
    });
    const lensRimMat = new THREE.MeshStandardMaterial({
      color: 0x9da3ae,
      metalness: 0.9,
      roughness: 0.2
    });

    // I. Reaction Control System (RCS) Manifold & Flared Nozzles
    const rcsManifoldMat = new THREE.MeshStandardMaterial({
      color: 0x5a606a,
      metalness: 0.85,
      roughness: 0.25
    });
    const rcsNozzleMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e22,
      metalness: 0.9,
      roughness: 0.2
    });

    // ========================================================
    // 2. OCTAGONAL DESCENT STAGE CORE (CRINKLED GOLD KAPTON MLI)
    // ========================================================
    const descentHeight = 1.1;
    const descentRadius = 1.35;
    const descentGeo = new THREE.CylinderGeometry(descentRadius, descentRadius * 1.05, descentHeight, 8);
    const descentMesh = new THREE.Mesh(descentGeo, goldMliMat);
    descentMesh.position.y = descentHeight / 2;
    this.bodyGroup.add(descentMesh);

    // Bottom heat shield radiation barrier ring
    const heatShieldBase = new THREE.Mesh(
      new THREE.CylinderGeometry(descentRadius * 1.05, descentRadius * 1.07, 0.06, 16),
      collarMat
    );
    heatShieldBase.position.y = 0.03;
    this.bodyGroup.add(heatShieldBase);

    // Modular equipment bays & propellant spheres around descent facets
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x727986,
      metalness: 0.85,
      roughness: 0.25
    });

    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const posX = Math.cos(angle) * (descentRadius * 0.95);
      const posZ = Math.sin(angle) * (descentRadius * 0.95);

      if (i % 2 !== 0) {
        // Equipment Boxes wrapped in crinkled Kapton MLI foil
        const boxGeo = new THREE.BoxGeometry(0.38, 0.48, 0.26);
        const boxMesh = new THREE.Mesh(boxGeo, goldMliMat);
        boxMesh.position.set(posX, descentHeight * 0.5, posZ);
        boxMesh.rotation.y = -angle;
        this.bodyGroup.add(boxMesh);
      } else {
        // Spherical Helium / Propellant Tanks peeking through truss bays
        const tank = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), tankMat);
        tank.position.set(posX * 0.88, descentHeight * 0.5, posZ * 0.88);
        this.bodyGroup.add(tank);

        // Gold foil equator blanket strap
        const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.14, 16, 1, true), goldMliMat);
        strap.position.copy(tank.position);
        this.bodyGroup.add(strap);
      }
    }

    // ========================================================
    // 3. ASCENT STAGE / AVIONICS DECK (THERMAL-WHITE FINISH)
    // ========================================================
    const cabinHeight = 0.95;
    const cabinWidth = 1.45;
    const cabinGeo = new THREE.BoxGeometry(cabinWidth, cabinHeight, cabinWidth);
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.y = descentHeight + cabinHeight / 2;
    this.bodyGroup.add(cabinMesh);

    // Overhead Docking Hatch & Payload Ring
    const hatchGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.22, 16);
    const hatch = new THREE.Mesh(hatchGeo, cabinMat);
    hatch.position.y = descentHeight + cabinHeight + 0.11;
    this.bodyGroup.add(hatch);

    // Metallic docking capture collar ring with perimeter latches
    const dockingRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.035, 12, 24),
      titaniumMat
    );
    dockingRing.rotation.x = Math.PI / 2;
    dockingRing.position.y = descentHeight + cabinHeight + 0.22;
    this.bodyGroup.add(dockingRing);

    // ========================================================
    // 4. RECESSED OPTICAL NAVIGATION & STAR TRACKER CAMERAS
    // ========================================================
    // Replaces the old flat black box with a recessed stereo optical nav assembly
    const camAssembly = new THREE.Group();
    camAssembly.position.set(0, descentHeight + cabinHeight * 0.62, cabinWidth / 2 + 0.02);

    // A. Main sensor housing bracket (dark titanium/inconel)
    const housingMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.50, 0.25, 0.06),
      lensHousingMat
    );
    camAssembly.add(housingMesh);

    // B. Protective top sun-shade baffle hood
    const hoodMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.03, 0.08),
      lensHousingMat
    );
    hoodMesh.position.set(0, 0.13, 0.03);
    camAssembly.add(hoodMesh);

    // C. Dual stereo camera lenses (Left and Right)
    for (const lx of [-0.13, 0.13]) {
      const lensGroup = new THREE.Group();
      lensGroup.position.set(lx, 0, 0.03);

      // Outer cylindrical barrel
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.06, 16),
        lensHousingMat
      );
      barrel.rotation.x = Math.PI / 2;
      lensGroup.add(barrel);

      // Beveled metallic bezel rim
      const bezel = new THREE.Mesh(
        new THREE.TorusGeometry(0.06, 0.012, 8, 16),
        lensRimMat
      );
      bezel.position.z = 0.03;
      lensGroup.add(bezel);

      // Glossy coated optical glass lens element
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
        lensGlassMat
      );
      glass.rotation.x = Math.PI / 2;
      glass.position.z = 0.025;
      lensGroup.add(glass);

      camAssembly.add(lensGroup);
    }
    this.bodyGroup.add(camAssembly);

    // ========================================================
    // 5. 4-WAY REACTION CONTROL SYSTEM (RCS) THRUSTER BLOCKS
    // ========================================================
    // Refined from simple cones into 4-way attitude-control manifold boxes
    for (let c = 0; c < 4; c++) {
      const angle = (c * Math.PI) / 2 + Math.PI / 4;
      const rcsGroup = new THREE.Group();
      rcsGroup.position.set(
        Math.cos(angle) * (cabinWidth * 0.66),
        descentHeight + cabinHeight * 0.82,
        Math.sin(angle) * (cabinWidth * 0.66)
      );

      // Central metallic manifold block
      const manifold = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), rcsManifoldMat);
      rcsGroup.add(manifold);

      // 4 tiny flared conical nozzles pointing radially & vertically
      const nozzleDirections = [
        { rotZ: -Math.PI / 2, rotY: 0, posX: 0.10, posY: 0, posZ: 0 },
        { rotZ: Math.PI / 2, rotY: 0, posX: -0.10, posY: 0, posZ: 0 },
        { rotX: Math.PI / 2, rotY: 0, posX: 0, posY: 0, posZ: 0.10 },
        { rotZ: 0, rotY: 0, posX: 0, posY: 0.10, posZ: 0 }
      ];

      for (const nd of nozzleDirections) {
        const nozGroup = new THREE.Group();
        nozGroup.position.set(nd.posX, nd.posY, nd.posZ);
        if (nd.rotZ) nozGroup.rotation.z = nd.rotZ;
        if (nd.rotX) nozGroup.rotation.x = nd.rotX;

        // Flared conical nozzle with throat cavity
        const nozMesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.042, 0.10, 12, 1, true),
          rcsNozzleMat
        );
        nozGroup.add(nozMesh);

        // Dark interior throat cavity
        const throat = new THREE.Mesh(
          new THREE.CircleGeometry(0.016, 8),
          new THREE.MeshBasicMaterial({ color: 0x0a0c10 })
        );
        throat.position.y = 0.04;
        throat.rotation.x = Math.PI / 2;
        nozGroup.add(throat);

        rcsGroup.add(nozGroup);
      }
      this.bodyGroup.add(rcsGroup);
    }

    // ========================================================
    // 6. METALLIC LANDING GEAR, SHOCK STRUTS & RIBBED FOOTPADS
    // ========================================================
    const legAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    for (let i = 0; i < 4; i++) {
      const angle = legAngles[i];
      const legGroup = new THREE.Group();
      legGroup.position.set(
        Math.cos(angle) * (descentRadius * 0.8),
        descentHeight * 0.44,
        Math.sin(angle) * (descentRadius * 0.8)
      );
      legGroup.rotation.y = angle - Math.PI / 2;

      // Primary shock strut assembly (Brushed Titanium)
      const strutLen = 1.6;
      const strutGeo = new THREE.CylinderGeometry(0.06, 0.06, strutLen, 12);
      const strut = new THREE.Mesh(strutGeo, titaniumMat);
      strut.position.set(0, -strutLen * 0.45, 0.45);
      strut.rotation.x = Math.PI * 0.28;
      legGroup.add(strut);

      // Telescopic piston sleeve (slightly wider secondary cylinder collar)
      const sleeveMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.078, 0.078, 0.72, 12),
        collarMat
      );
      sleeveMesh.position.set(0, 0.28, 0);
      strut.add(sleeveMesh);

      // Gold Kapton foil wrap near the upper strut joint
      const foilWrap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.088, 0.088, 0.22, 12),
        goldMliMat
      );
      foilWrap.position.set(0, 0.58, 0);
      strut.add(foilWrap);

      // Circular Footpad with metallic rim & dark ribbed shock-absorber pad
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.35, 0.08, 20),
        footpadRimMat
      );
      pad.position.set(0, -strutLen / 2, 0);
      pad.rotation.x = -Math.PI * 0.28; // Keeps footpad flat against horizontal terrain
      strut.add(pad);

      // Dark grey ribbed shock-absorber pad underneath
      const rubberPad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20),
        footpadUnderMat
      );
      rubberPad.position.set(0, -0.045, 0);
      pad.add(rubberPad);

      // Swivel clevis ball joint on top of footpad
      const ballJoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 8),
        collarMat
      );
      ballJoint.position.set(0, 0.05, 0);
      pad.add(ballJoint);

      // Articulated cross-brace with titanium end fittings
      const braceGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8);
      const brace = new THREE.Mesh(braceGeo, titaniumMat);
      brace.position.set(0, -0.28, 0.35);
      brace.rotation.x = -Math.PI * 0.2;
      legGroup.add(brace);

      this.landingLegs.push({
        group: legGroup,
        strut,
        pad,
        brace,
        restAngle: angle
      });
      this.bodyGroup.add(legGroup);
    }

    // ========================================================
    // 7. PHOTOVOLTAIC SOLAR ARRAY WINGS & METALLIC HINGES
    // ========================================================
    const panelW = 1.7;
    const panelH = 0.85;

    // A. Left Solar Wing
    this.solarPanelLeft = new THREE.Group();
    const frameL = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.035, panelH), solarFrameMat);
    const cellsL = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.06, 0.045, panelH - 0.06), solarCellMat);
    frameL.position.x = -panelW / 2;
    cellsL.position.x = -panelW / 2;
    frameL.rotation.x = 0.22;
    cellsL.rotation.x = 0.22;
    this.solarPanelLeft.add(frameL);
    this.solarPanelLeft.add(cellsL);

    // Metallic hinge knuckles at the wing root
    for (const hz of [-0.25, 0.25]) {
      const hingeKnuckle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.09, 12),
        titaniumMat
      );
      hingeKnuckle.rotation.x = Math.PI / 2;
      hingeKnuckle.position.set(0, 0, hz);
      this.solarPanelLeft.add(hingeKnuckle);
    }

    this.solarPanelLeft.position.set(-cabinWidth / 2, descentHeight + 0.45, 0);
    this.bodyGroup.add(this.solarPanelLeft);

    // B. Right Solar Wing
    this.solarPanelRight = new THREE.Group();
    const frameR = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.035, panelH), solarFrameMat);
    const cellsR = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.06, 0.045, panelH - 0.06), solarCellMat);
    frameR.position.x = panelW / 2;
    cellsR.position.x = panelW / 2;
    frameR.rotation.x = 0.22;
    cellsR.rotation.x = 0.22;
    this.solarPanelRight.add(frameR);
    this.solarPanelRight.add(cellsR);

    // Metallic hinge knuckles at the wing root
    for (const hz of [-0.25, 0.25]) {
      const hingeKnuckle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.09, 12),
        titaniumMat
      );
      hingeKnuckle.rotation.x = Math.PI / 2;
      hingeKnuckle.position.set(0, 0, hz);
      this.solarPanelRight.add(hingeKnuckle);
    }

    this.solarPanelRight.position.set(cabinWidth / 2, descentHeight + 0.45, 0);
    this.bodyGroup.add(this.solarPanelRight);

    // Hull hinge mounting brackets on cabin exterior
    for (const side of [-cabinWidth / 2, cabinWidth / 2]) {
      for (const hz of [-0.25, 0.25]) {
        const mountBracket = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.07, 0.07),
          titaniumMat
        );
        mountBracket.position.set(side, descentHeight + 0.45, hz);
        this.bodyGroup.add(mountBracket);
      }
    }

    // ========================================================
    // 8. DIRECT-TO-EARTH HIGH-GAIN ANTENNA (HGA) PARABOLIC DISH
    // ========================================================
    this.antennaDish = new THREE.Group();

    // Dual-gimbal steerable mast
    this.antennaMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.65, 12),
      titaniumMat
    );
    this.antennaMast.position.y = 0.32;
    this.antennaDish.add(this.antennaMast);

    // Parabolic dish reflector (shallow open hemisphere)
    const dishGeo = new THREE.SphereGeometry(0.40, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xf5f6fa,
      metalness: 0.25,
      roughness: 0.35,
      side: THREE.DoubleSide
    });
    const dishMesh = new THREE.Mesh(dishGeo, dishMat);
    dishMesh.rotation.x = Math.PI * 0.75;
    dishMesh.position.set(0, 0.65, 0.1);
    this.antennaDish.add(dishMesh);

    // Outer dish metallic reinforcement rim
    const dishRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.395, 0.015, 8, 24),
      titaniumMat
    );
    dishRim.rotation.x = Math.PI * 0.75;
    dishRim.position.set(0, 0.65, 0.1);
    this.antennaDish.add(dishRim);

    // Central feed horn needle & subreflector tripod
    const feedNeedle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.016, 0.26, 8),
      titaniumMat
    );
    feedNeedle.position.set(0, 0.76, 0.21);
    feedNeedle.rotation.x = Math.PI * 0.75;
    this.antennaDish.add(feedNeedle);

    // Subreflector cap at needle tip
    const subReflector = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.02, 0.018, 12),
      titaniumMat
    );
    subReflector.position.set(0, 0.85, 0.30);
    subReflector.rotation.x = Math.PI * 0.75;
    this.antennaDish.add(subReflector);

    this.antennaDish.position.set(0.45, descentHeight + cabinHeight, -0.45);
    this.bodyGroup.add(this.antennaDish);

    // ========================================================
    // 9. NIOBIUM DESCENT ENGINE BELL & RETRO THRUSTER PLUME
    // ========================================================
    this.engineNozzle = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.9, 24, 1, true),
      engineOuterMat
    );
    this.engineNozzle.position.y = 0.05;

    // Horizontal cooling rings around exterior of nozzle
    for (const ry of [0.15, 0.35, 0.55]) {
      const ringRadius = 0.5 * (1 - ry / 0.9);
      const ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(ringRadius, 0.014, 8, 24),
        engineRingMat
      );
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = ry - 0.45;
      this.engineNozzle.add(ringMesh);
    }

    // Warm amber/copper inner combustion throat lining
    const innerThroat = new THREE.Mesh(
      new THREE.ConeGeometry(0.46, 0.86, 24, 1, true),
      engineThroatMat
    );
    innerThroat.position.y = 0.01;
    this.engineNozzle.add(innerThroat);

    this.bodyGroup.add(this.engineNozzle);

    // Layer 1: Supersonic outer expansion mantle (electric cyan-blue)
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.engineFlame = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.6, 20, 2, true), flameMat);
    this.engineFlame.rotation.x = Math.PI;
    this.engineFlame.position.y = -1.0;
    this.engineFlame.castShadow = false;
    this.engineFlame.receiveShadow = false;
    this.engineFlame.visible = false;

    // Layer 2: Radiant ice-blue supersonic core
    const coreGeo = new THREE.ConeGeometry(0.24, 1.1, 16, 1, true);
    coreGeo.rotateX(Math.PI);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.y = 0.22;
    coreMesh.castShadow = false;
    coreMesh.receiveShadow = false;
    this.engineFlame.add(coreMesh);

    // Layer 3: Incandescent white throat disc (at the nozzle exit throat)
    const throatGeo = new THREE.ConeGeometry(0.12, 0.55, 12, 1, false);
    throatGeo.rotateX(Math.PI);
    const throatMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const throatMesh = new THREE.Mesh(throatGeo, throatMat);
    throatMesh.position.y = 0.52;
    throatMesh.castShadow = false;
    throatMesh.receiveShadow = false;
    this.engineFlame.add(throatMesh);

    // Layer 4: Twin Supersonic Mach Shock Diamonds
    for (let d = 0; d < 2; d++) {
      const dGeo = new THREE.OctahedronGeometry(0.06 - d * 0.015, 0);
      dGeo.scale(1, 1.8, 1);
      const dMat = new THREE.MeshBasicMaterial({
        color: 0xf0fdfa,
        transparent: true,
        opacity: 0.92 - d * 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const dMesh = new THREE.Mesh(dGeo, dMat);
      dMesh.position.y = 0.25 - d * 0.35;
      dMesh.castShadow = false;
      dMesh.receiveShadow = false;
      this.engineFlame.add(dMesh);
    }
    this.bodyGroup.add(this.engineFlame);

    // Blue/white thruster illumination glow
    this.engineLight = new THREE.PointLight(0x7dd3fc, 0, 14, 1.6);
    this.engineLight.position.set(0, -0.6, 0);
    this.bodyGroup.add(this.engineLight);

    // Soft upward-facing fill light under the descent stage to illuminate landing gear and bottom panels
    this.underLanderFill = new THREE.PointLight(0xb0b8c6, 0.85, 7.5, 1.2);
    this.underLanderFill.position.set(0, -0.45, 0);
    this.bodyGroup.add(this.underLanderFill);

    // Dedicated subtle spacecraft rim fill light for crisp edge definition against deep space
    this.spacecraftRimLight = new THREE.PointLight(0xdde8f5, 1.2, 22, 1.4);
    this.spacecraftRimLight.position.set(3.5, 2.5, -3.5);
    this.group.add(this.spacecraftRimLight);

    // Front-facing soft fill light to illuminate gold Kapton facets, solar wings, and camera lenses
    const spacecraftFrontFill = new THREE.PointLight(0xf1f5f9, 1.6, 28, 1.1);
    spacecraftFrontFill.position.set(-2.8, 3.2, 5.5);
    this.group.add(spacecraftFrontFill);

    // Enable castShadow and receiveShadow on all lander meshes for sharp polar sunlight shadow casting
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj !== this.engineFlame && !obj.name.includes('Flame')) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      }
    });

    // Set initial stowed pose (t = 0)
    this.setDeploy(0);
    this.setThrottle(0);
  }

  /**
   * Set deployment state across sub-ranges:
   * t in [0.00, 0.35]: Solar panels unfold from vertical tucked position to horizontal wings
   * t in [0.35, 0.70]: High-gain antenna dish erects and aims
   * t in [0.70, 1.00]: Landing gear legs articulate outward to landing stance
   */
  public setDeploy(t: number): void {
    const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
    this.deployProgress = clamp(t);

    // 1. Solar Panels: [0.0, 0.35]
    const pSolar = clamp(this.deployProgress / 0.35);
    // Stowed: folded down (-90°). Deployed: 0°
    this.solarPanelLeft.rotation.z = -(1 - pSolar) * (Math.PI * 0.48);
    this.solarPanelRight.rotation.z = (1 - pSolar) * (Math.PI * 0.48);

    // 2. Dish: [0.35, 0.70]
    const pDish = clamp((this.deployProgress - 0.35) / 0.35);
    // Stowed: folded down flat (-80°). Deployed: upright
    this.antennaDish.rotation.x = -(1 - pDish) * (Math.PI * 0.45);
    this.antennaDish.scale.set(0.2 + 0.8 * pDish, 0.2 + 0.8 * pDish, 0.2 + 0.8 * pDish);

    // 3. Landing Legs: [0.70, 1.00]
    const pLegs = clamp((this.deployProgress - 0.70) / 0.30);
    for (const leg of this.landingLegs) {
      // Stowed: folded up tightly against body. Deployed: nominal stance
      const foldAngle = (1 - pLegs) * 0.65;
      leg.group.rotation.x = foldAngle;
      leg.group.position.y = 0.44;
    }
  }

  /**
   * Compression of landing gear shock absorbers on touchdown (c in [0, 1])
   */
  public setLegCompression(c: number): void {
    const comp = Math.max(0, Math.min(1, c));
    this.legCompression = comp;
    for (const leg of this.landingLegs) {
      // Piston slides inside strut along shock vector; pad stays locked to tip
      leg.strut.position.y = -1.6 * 0.45 + comp * 0.12;
    }
  }

  /**
   * Pitch-over orientation for powered descent retro-flip
   * facing = 1: engine points toward travel vector (retro-burn)
   * facing = 0: vertical upright touchdown orientation
   */
  public setEngineFacing(facing: number): void {
    this.engineFacing = Math.max(0, Math.min(1, facing));
    // Clean retro-tilt about pitch axis (X axis) through vehicle center of mass:
    // Engine faces retrograde travel direction during braking burn
    const retroPitch = this.engineFacing * (Math.PI * 0.28);
    this.bodyGroup.rotation.set(-retroPitch, 0, 0);
  }

  /**
   * Throttle descent engine thrust
   */
  public setThrottle(intensity: number): void {
    const th = Math.max(0, intensity);
    if (th <= 0.01) {
      this.engineFlame.visible = false;
      this.engineLight.intensity = 0;
    } else {
      this.engineFlame.visible = true;
      // High-frequency subtle plume flutter
      const flutter = 1.0 + Math.sin(Date.now() * 0.035) * 0.08;
      this.engineFlame.scale.set(th * 0.82, th * 0.96 * flutter, th * 0.82);
      this.engineLight.intensity = th * 2.8;
    }
  }

  /**
   * Clean disposal of geometries and materials on teardown
   */
  public destroy(): void {
    const disposeObject = (obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      }
    };
    this.group.traverse(disposeObject);
    LanderTextures.dispose();
  }
}
