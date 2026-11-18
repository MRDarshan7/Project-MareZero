import * as THREE from 'three';
import type { ThreeConductor } from './ThreeConductor';

/** Appearance only. No craft, camera, progress, geometry transforms or random generators are changed. */
export function applyFieldTheme(conductor: ThreeConductor): void {
  conductor.scene.traverse(object => {
    for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) {
      if (
        ancestor === conductor.skyDome.group ||
        ancestor === conductor.particles.group ||
        ancestor === conductor.rocket.boosterPlume ||
        ancestor === conductor.atmosphere.approachMoon ||
        ancestor === conductor.atmosphere.distantEarth ||
        ancestor === conductor.surface.landingTerrain ||
        ancestor === conductor.surface.domeBaseDisc ||
        ancestor === conductor.lander.engineFlame
      ) return;
    }
    if (
      object === conductor.particles.group ||
      object === conductor.rocket.boosterPlume ||
      object === conductor.atmosphere.approachMoon ||
      object === conductor.atmosphere.distantEarth ||
      object === conductor.surface.landingTerrain ||
      object === conductor.surface.domeBaseDisc ||
      object === conductor.lander.engineFlame
    ) return;
    if (object instanceof THREE.PointLight) {
      if (
        object === conductor.rocket.boosterLight ||
        object === conductor.atmosphere.ignitionLight ||
        object === conductor.lander.engineLight ||
        object === conductor.lander.underLanderFill
      ) {
        return;
      }
      object.visible = false;
    }
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
    // Preserve the national and MAREZERO decals exactly as supplied in the working tree.
    if (/flag|marezero/i.test(object.name)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const surface = material as THREE.MeshStandardMaterial;
      if (surface.emissive) { surface.emissive.set('#0C0D0B'); surface.emissiveIntensity = 0; }
      if ('roughness' in surface) { surface.roughness = 0.96; surface.metalness = 0.02; }
      if (surface.color) {
        const lightness = (surface.color.r + surface.color.g + surface.color.b) / 3;
        surface.color.set(lightness > 0.6 ? '#ECE8DD' : lightness > 0.12 ? '#8F8B80' : '#0C0D0B');
      }
      if (material.blending === THREE.AdditiveBlending) material.visible = false;
      material.needsUpdate = true;
    }
  });
  // Preserve rocket launch particle systems and booster flame plume
  conductor.particles.group.visible = true;
  conductor.atmosphere.cloudLayers.traverse(object => {
    if (object instanceof THREE.Mesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.visible = false;
    }
  });
  (conductor.rocket.upperPlume.material as THREE.Material).visible = false;
  (conductor.lander.engineFlame.material as THREE.Material).visible = true;
  conductor.surface.craterGroup.visible = true;
  (conductor.surface.horizonWallMesh.material as THREE.Material).visible = false;
  const stars = conductor.atmosphere.starfield.material as THREE.PointsMaterial;
  stars.vertexColors = false; stars.color.set('#ECE8DD'); stars.needsUpdate = true;
  conductor.atmosphere.rimLight.color.set('#8F8B80');
}
