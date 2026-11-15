import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RocketTextures, SoftwareCanvas } from '../materials/RocketTextures';
import { RocketModel } from '../models/RocketModel';
import { LanderModel } from '../models/LanderModel';
import { applyBranding, removeBranding } from '../models/RocketBranding';

describe('National and Team Branding Suite', () => {
  describe('1. Indian Flag Texture & Canvas Geometry', () => {
    const width = 2048;
    const height = Math.round((width * 2) / 3); // 1365 (3:2 ratio)
    const canvas = RocketTextures.generateIndianFlagCanvas(width);
    const ctx = canvas.getContext('2d')!;

    it('asserts authentic 3:2 aspect ratio (2048 x 1365)', () => {
      expect(canvas.width).toBe(2048);
      expect(canvas.height).toBe(1365);
      expect(canvas.width / canvas.height).toBeCloseTo(1.5, 2);
    });

    it('renders the three horizontal bands in correct top-to-bottom order: saffron, white, green', () => {
      // Band height = 1365 / 3 = 455 px
      // Saffron: y in [0, 455), center at y = 227
      const saffronPix = ctx.getImageData(1024, 227, 1, 1).data;
      expect(saffronPix[0]).toBe(255); // R
      expect(saffronPix[1]).toBe(153); // G
      expect(saffronPix[2]).toBe(51);  // B
      expect(saffronPix[3]).toBe(255); // A

      // White: y in [455, 910), sample away from chakra at x = 350, y = 682
      const whitePix = ctx.getImageData(350, 682, 1, 1).data;
      expect(whitePix[0]).toBe(255);
      expect(whitePix[1]).toBe(255);
      expect(whitePix[2]).toBe(255);
      expect(whitePix[3]).toBe(255);

      // Green: y in [910, 1365), center at y = 1137
      const greenPix = ctx.getImageData(1024, 1137, 1, 1).data;
      expect(greenPix[0]).toBe(19);
      expect(greenPix[1]).toBe(136);
      expect(greenPix[2]).toBe(8);
      expect(greenPix[3]).toBe(255);
    });

    it('renders the Ashoka Chakra in Navy Blue at the centre of the white band with exactly 24 radial spokes', () => {
      const cx = width / 2; // 1024
      const cy = height / 2; // 682.5

      // Chakra Hub at center
      const hubPix = ctx.getImageData(Math.floor(cx), Math.floor(cy), 1, 1).data;
      expect(hubPix[0]).toBe(0);   // R
      expect(hubPix[1]).toBe(0);   // G
      expect(hubPix[2]).toBe(128); // B (#000080 Navy Blue)

      // Sample along a circle of radius R = 100 (between hub ~28px and outer ring ~170px)
      // Background between spokes is pure white; spokes are Navy Blue.
      const sampleRadius = 100;
      const numSteps = 720; // 0.5 degree steps
      const spokeAngles: number[] = [];
      let inSpoke = false;
      let spokeStartAngle = 0;

      for (let s = 0; s < numSteps; s++) {
        const theta = (s * 2 * Math.PI) / numSteps;
        const px = Math.floor(cx + Math.cos(theta) * sampleRadius);
        const py = Math.floor(cy + Math.sin(theta) * sampleRadius);
        const pix = ctx.getImageData(px, py, 1, 1).data;

        // Spokes are Navy Blue (R=0, G=0, B=128)
        const isNavy = pix[2] > 100 && pix[0] < 50 && pix[1] < 50;

        if (isNavy && !inSpoke) {
          inSpoke = true;
          spokeStartAngle = theta;
        } else if (!isNavy && inSpoke) {
          inSpoke = false;
          const spokeCenterAngle = (spokeStartAngle + theta) / 2;
          spokeAngles.push(spokeCenterAngle);
        }
      }

      // If a spoke spans the boundary at theta = 0 / 2*PI, merge them
      if (inSpoke) {
        // Last spoke wrapped around
        if (spokeAngles.length > 0) {
          spokeAngles[0] = (spokeStartAngle - 2 * Math.PI + spokeAngles[0]) / 2;
        }
      }

      expect(spokeAngles.length).toBe(24);

      // Verify uniform ~15 degree (0.2618 rad) spacing
      for (let i = 0; i < spokeAngles.length - 1; i++) {
        const diff = spokeAngles[i + 1] - spokeAngles[i];
        expect(diff).toBeCloseTo((2 * Math.PI) / 24, 1);
      }
    });

    it('includes a thin painted decal border for contrast against fuselage', () => {
      // Corner / edge border check
      const borderPix = ctx.getImageData(1, 1, 1, 1).data;
      expect(borderPix[0]).toBe(26); // #1a202c
      expect(borderPix[1]).toBe(32);
      expect(borderPix[2]).toBe(44);
    });
  });

  describe('2. Team MAREZERO Vertical Aerospace Lettering', () => {
    it('generates vertical text rotated 90 degrees reading bottom-to-top', () => {
      const canvas = RocketTextures.generateMarezeroCanvas(512, 2048);
      expect(canvas.width).toBe(512);
      expect(canvas.height).toBe(2048);

      if (canvas instanceof SoftwareCanvas) {
        expect(canvas.drawnTexts.length).toBeGreaterThan(0);
        const fullText = canvas.drawnTexts.map(t => t.text).join('');
        expect(fullText).toBe('MAREZERO');

        // Check rotation: rotated -90 degrees (-PI/2) for bottom-to-top orientation
        for (const item of canvas.drawnTexts) {
          expect(item.angle).toBeCloseTo(-Math.PI / 2, 2);
          expect(item.color.toLowerCase()).toBe('#0b1329'); // Dark aerospace navy ink
        }
      }
    });
  });

  describe('3. Scene Graph Hierarchy & Decal Attachment', () => {
    const lander = new LanderModel();
    const rocket = new RocketModel(lander);

    it('attaches Indian Flag and MAREZERO decals directly to boosterStage', () => {
      const boosterChildren = rocket.boosterStage.children;
      const flagMesh = boosterChildren.find(c => c.name === 'BoosterFlagDecal') as THREE.Mesh;
      const marezeroMesh = boosterChildren.find(c => c.name === 'BoosterMarezeroDecal') as THREE.Mesh;

      expect(flagMesh).toBeDefined();
      expect(marezeroMesh).toBeDefined();

      // Flag positioned at upper booster hull (y = 12.6)
      expect(flagMesh.position.y).toBeCloseTo(12.6, 1);

      // MAREZERO spans ~47% of booster height (height = 7.5)
      const marezeroGeo = marezeroMesh.geometry as THREE.CylinderGeometry;
      expect(marezeroGeo.parameters.height).toBeCloseTo(7.5, 1);
      expect(marezeroMesh.position.y).toBeCloseTo(7.0, 1);
    });

    it('attaches Indian Flag decals to lander avionics cabin body', () => {
      const landerFlags = lander.bodyGroup.children.filter(c => c.name === 'LanderFlagDecal');
      expect(landerFlags.length).toBeGreaterThanOrEqual(1);

      // Sized to approx 1/7 - 1/8 of lander body width (1.45 / 7 ~= 0.22)
      const flagMesh = landerFlags[0] as THREE.Mesh;
      const geo = flagMesh.geometry as THREE.PlaneGeometry;
      expect(geo.parameters.width).toBeCloseTo(0.22, 2);
      expect(geo.parameters.height).toBeCloseTo(0.22 / 1.5, 2);
    });

    it('allows toggling branding via applyBranding and removeBranding', () => {
      removeBranding(rocket, lander);
      expect(rocket.boosterStage.children.find(c => c.name === 'BoosterFlagDecal')).toBeUndefined();
      expect(rocket.boosterStage.children.find(c => c.name === 'BoosterMarezeroDecal')).toBeUndefined();
      expect(lander.bodyGroup.children.find(c => c.name === 'LanderFlagDecal')).toBeUndefined();

      applyBranding(rocket, lander);
      expect(rocket.boosterStage.children.find(c => c.name === 'BoosterFlagDecal')).toBeDefined();
      expect(rocket.boosterStage.children.find(c => c.name === 'BoosterMarezeroDecal')).toBeDefined();
      expect(lander.bodyGroup.children.find(c => c.name === 'LanderFlagDecal')).toBeDefined();
    });

    it('guarantees booster decals tumble with the booster stage during separation', () => {
      const scene = new THREE.Scene();
      rocket.registerScene(scene);
      scene.add(rocket.craftRig);

      const craftPos = new THREE.Vector3(0, 45, 0);
      const craftQuat = new THREE.Quaternion();

      // At p = 0.40 (booster separation and tumble)
      rocket.updateSeparations(0.40, craftPos, craftQuat);

      // Booster is detached from craft rig and attached to scene
      expect(rocket.isBoosterDetached).toBe(true);

      // Decals must still be children of boosterStage so they tumble together
      const flagMesh = rocket.boosterStage.children.find(c => c.name === 'BoosterFlagDecal');
      const marezeroMesh = rocket.boosterStage.children.find(c => c.name === 'BoosterMarezeroDecal');
      expect(flagMesh).toBeDefined();
      expect(marezeroMesh).toBeDefined();
    });
  });
});
