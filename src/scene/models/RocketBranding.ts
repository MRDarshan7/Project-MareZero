import * as THREE from 'three';
import { RocketModel } from './RocketModel';
import { LanderModel } from './LanderModel';
import { RocketTextures } from '../materials/RocketTextures';

export interface BrandingDecals {
  boosterFlagMesh: THREE.Mesh;
  boosterMarezeroMesh: THREE.Mesh;
  landerFlagMeshes: THREE.Mesh[];
}

/**
 * Applies authentic national (Indian Flag) and team branding ("MAREZERO") to the rocket and lander.
 * 
 * Booster Decals:
 * 1. Indian Flag:
 *    - 3:2 ratio curved partial cylinder patch placed at the upper booster hull (y = 12.8),
 *      centered along the camera-facing (+Z) sightline.
 *    - Exact geometry: Saffron, White, Green bands with central 24-spoke Ashoka Chakra in Navy Blue.
 * 2. Team Name "MAREZERO":
 *    - Vertical aerospace lettering curved patch along the booster body (y = 6.8, height = 7.2),
 *      rotated 90 degrees to read bottom-to-top.
 *    - Dark aerospace navy / near-black ink with wide tracking.
 * 
 * Lander Decals:
 * 3. Small Indian Flag plane decals (~1/8 body width) mounted on the front and side faces
 *    of the lander avionics cabin, clearly visible during descent and on the Sky-Dome.
 * 
 * Both booster decals are children of rocket.boosterStage, ensuring they tumble away deterministically
 * at staging (p ~ 0.40) and never float in space.
 */
export function applyBranding(rocket: RocketModel, lander?: LanderModel): BrandingDecals {
  // Clean up any existing branding decals first
  removeBranding(rocket, lander);

  const boosterRadius = rocket.boosterRadius;
  const decalRadius = boosterRadius + 0.008; // Slight outward offset to prevent z-fighting

  // ----------------------------------------------------
  // 1. Indian Flag Decal on Upper Booster Stage
  // ----------------------------------------------------
  // Flag dimensions: 3:2 aspect ratio, bold and clear on white metal
  const flagHeight = 1.40;
  const flagWidth = flagHeight * 1.5; // 2.10 units along cylinder arc
  const flagThetaLength = flagWidth / decalRadius; // ~1.306 rad (~74.8 deg)
  const flagThetaStart = -flagThetaLength / 2;

  const flagGeo = new THREE.CylinderGeometry(
    decalRadius,
    decalRadius,
    flagHeight,
    32,
    1,
    true,
    flagThetaStart,
    flagThetaLength
  );

  const flagMat = new THREE.MeshStandardMaterial({
    map: RocketTextures.getIndianFlagTexture(),
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.FrontSide
  });

  const boosterFlagMesh = new THREE.Mesh(flagGeo, flagMat);
  boosterFlagMesh.name = 'BoosterFlagDecal';
  // Positioned in upper booster section (below grid fins at y=14.8, above MAREZERO)
  boosterFlagMesh.position.set(0, 12.6, 0);
  rocket.boosterStage.add(boosterFlagMesh);

  // ----------------------------------------------------
  // 2. Team Name "MAREZERO" Decal on Booster
  // ----------------------------------------------------
  // Spans roughly 47% of booster height (16.0 * 0.47 = 7.5 units)
  const marezeroHeight = 7.5;
  const marezeroWidth = 1.35; // Width across cylinder curve
  const marezeroThetaLength = marezeroWidth / decalRadius; // ~0.840 rad (~48.1 deg)
  const marezeroThetaStart = -marezeroThetaLength / 2;

  const marezeroGeo = new THREE.CylinderGeometry(
    decalRadius,
    decalRadius,
    marezeroHeight,
    32,
    1,
    true,
    marezeroThetaStart,
    marezeroThetaLength
  );

  const marezeroMat = new THREE.MeshStandardMaterial({
    map: RocketTextures.getMarezeroTexture(),
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.FrontSide
  });

  const boosterMarezeroMesh = new THREE.Mesh(marezeroGeo, marezeroMat);
  boosterMarezeroMesh.name = 'BoosterMarezeroDecal';
  // Positioned along booster core (spanning y = 3.25 to y = 10.75, clear of landing legs)
  boosterMarezeroMesh.position.set(0, 7.0, 0);
  rocket.boosterStage.add(boosterMarezeroMesh);

  // ----------------------------------------------------
  // 3. Lander Flag Decals
  // ----------------------------------------------------
  const landerFlagMeshes: THREE.Mesh[] = [];
  const targetLander = lander || rocket.lander;

  if (targetLander && targetLander.bodyGroup) {
    // ~1/7th of lander body width (1.45 / 7 ~= 0.207)
    const landerFlagW = 0.22;
    const landerFlagH = landerFlagW / 1.5; // ~0.147

    const landerFlagGeo = new THREE.PlaneGeometry(landerFlagW, landerFlagH);
    const landerFlagMat = new THREE.MeshStandardMaterial({
      map: RocketTextures.getIndianFlagTexture(),
      roughness: 0.35,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide
    });

    // A. Front cabin face (+Z): visible front-on and on Sky-Dome
    const landerFrontFlag = new THREE.Mesh(landerFlagGeo, landerFlagMat);
    landerFrontFlag.name = 'LanderFlagDecal';
    landerFrontFlag.position.set(-0.35, 1.43, 0.730);
    targetLander.bodyGroup.add(landerFrontFlag);
    landerFlagMeshes.push(landerFrontFlag);

    // B. Right cabin face (+X): visible during descent profile tracking
    const landerRightFlag = new THREE.Mesh(landerFlagGeo, landerFlagMat);
    landerRightFlag.name = 'LanderFlagDecal';
    landerRightFlag.position.set(0.730, 1.43, 0.0);
    landerRightFlag.rotation.y = Math.PI / 2;
    targetLander.bodyGroup.add(landerRightFlag);
    landerFlagMeshes.push(landerRightFlag);

    // C. Left cabin face (-X): visible from opposite angle
    const landerLeftFlag = new THREE.Mesh(landerFlagGeo, landerFlagMat);
    landerLeftFlag.name = 'LanderFlagDecal';
    landerLeftFlag.position.set(-0.730, 1.43, 0.0);
    landerLeftFlag.rotation.y = -Math.PI / 2;
    targetLander.bodyGroup.add(landerLeftFlag);
    landerFlagMeshes.push(landerLeftFlag);

    // D. Descent stage facet (+Z / +X corner): visible during descent flip
    const descentFlag = new THREE.Mesh(landerFlagGeo, landerFlagMat);
    descentFlag.name = 'LanderFlagDecal';
    descentFlag.position.set(0.95, 0.75, 0.65);
    descentFlag.rotation.y = Math.PI / 4;
    targetLander.bodyGroup.add(descentFlag);
    landerFlagMeshes.push(descentFlag);
  }

  return {
    boosterFlagMesh,
    boosterMarezeroMesh,
    landerFlagMeshes
  };
}

/**
 * Safely removes and disposes branding decals.
 */
export function removeBranding(rocket: RocketModel, lander?: LanderModel): void {
  if (rocket.boosterStage) {
    const toRemove: THREE.Object3D[] = [];
    rocket.boosterStage.traverse((child) => {
      if (child.name === 'BoosterFlagDecal' || child.name === 'BoosterMarezeroDecal') {
        toRemove.push(child);
      }
    });
    for (const obj of toRemove) {
      if (obj.parent) obj.parent.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }
  }

  const targetLander = lander || rocket.lander;
  if (targetLander && targetLander.bodyGroup) {
    const toRemove: THREE.Object3D[] = [];
    targetLander.bodyGroup.traverse((child) => {
      if (child.name === 'LanderFlagDecal') {
        toRemove.push(child);
      }
    });
    for (const obj of toRemove) {
      if (obj.parent) obj.parent.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }
  }
}
