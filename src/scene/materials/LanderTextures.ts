import * as THREE from 'three';
import { DeterministicPRNG } from './CelestialTextures';

/**
 * Procedural PBR Texture Generator for Lunar Lander Spacecraft Materials
 * 
 * Provides:
 * 1. Crinkled Gold Kapton MLI (Multi-Layer Insulation) facet & crease bump map
 * 2. Photovoltaic solar array grid albedo map (monocrystalline cells, silver busbars & fingers)
 * 3. Photovoltaic solar array height / bump relief map
 * 4. Avionics cabin modular panel seam & fastener bump map
 * 
 * Statically cached and zero-GC during runtime rendering.
 */
export class LanderTextures {
  private static goldFoilAlbedoMap: THREE.Texture | null = null;
  private static goldFoilBumpMap: THREE.Texture | null = null;
  private static solarCellMap: THREE.Texture | null = null;
  private static solarCellBumpMap: THREE.Texture | null = null;
  private static avionicsBumpMap: THREE.Texture | null = null;

  /**
   * Generates a rich golden Kapton MLI thermal insulation albedo texture with faceted
   * Voronoi patchwork tone variations, polyimide tape seams, and grounding tabs.
   */
  public static getGoldFoilAlbedoMap(): THREE.Texture {
    if (this.goldFoilAlbedoMap) return this.goldFoilAlbedoMap;
    if (typeof document === 'undefined') return new THREE.Texture();

    const w = 256;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const prng = new DeterministicPRNG(19690720);
    const numSites = 28;
    const sites: Array<{ x: number; y: number; color: [number, number, number]; tape: boolean }> = [];
    const goldPalette: Array<[number, number, number]> = [
      [234, 182, 54], // Vibrant amber-gold
      [220, 168, 42], // Deep gold
      [244, 196, 68], // Highlight gold
      [208, 152, 34], // Shadow gold
      [238, 188, 58], // Radiant gold
      [216, 160, 38]  // Matte gold
    ];

    for (let i = 0; i < numSites; i++) {
      sites.push({
        x: prng.next() * w,
        y: prng.next() * h,
        color: goldPalette[Math.floor(prng.next() * goldPalette.length)],
        tape: prng.next() > 0.35
      });
    }

    const torDist = (x1: number, y1: number, x2: number, y2: number) => {
      let dx = Math.abs(x1 - x2);
      let dy = Math.abs(y1 - y2);
      if (dx > w / 2) dx = w - dx;
      if (dy > h / 2) dy = h - dy;
      return Math.hypot(dx, dy);
    };

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let d1 = 9999;
        let d2 = 9999;
        let nearestIdx = 0;

        for (let i = 0; i < numSites; i++) {
          const d = torDist(x, y, sites[i].x, sites[i].y);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            nearestIdx = i;
          } else if (d < d2) {
            d2 = d;
          }
        }

        const site = sites[nearestIdx];
        let [r, g, b] = site.color;

        // Seam tape line along facet boundaries
        const ridgeDist = d2 - d1;
        if (ridgeDist < 3.0 && site.tape) {
          // Amber-brown Kapton adhesive tape
          r = Math.round(r * 0.70 + 170 * 0.30);
          g = Math.round(g * 0.60 + 105 * 0.40);
          b = Math.round(b * 0.35 + 24 * 0.65);
        } else if (ridgeDist < 5.5) {
          // Subtle crease shading
          const factor = 0.88 + (ridgeDist / 5.5) * 0.12;
          r = Math.round(r * factor);
          g = Math.round(g * factor);
          b = Math.round(b * factor);
        }

        const idx = (y * w + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.generateMipmaps = true;
    this.goldFoilAlbedoMap = tex;
    return tex;
  }

  /**
   * Generates a realistic crinkled Kapton thermal blanket heightmap with faceted Voronoi
   * boundaries and micro-wrinkles.
   */
  public static getGoldFoilBumpMap(): THREE.Texture {
    if (this.goldFoilBumpMap) return this.goldFoilBumpMap;
    if (typeof document === 'undefined') return new THREE.Texture();

    const w = 128;
    const h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    const prng = new DeterministicPRNG(19690720);
    const numSites = 28;
    const sites: Array<{ x: number; y: number; height: number; slopeX: number; slopeY: number }> = [];

    for (let i = 0; i < numSites; i++) {
      sites.push({
        x: prng.next() * w,
        y: prng.next() * h,
        height: prng.next() * 60 + 90,
        slopeX: (prng.next() - 0.5) * 1.6,
        slopeY: (prng.next() - 0.5) * 1.6
      });
    }

    const torDist = (x1: number, y1: number, x2: number, y2: number) => {
      let dx = Math.abs(x1 - x2);
      let dy = Math.abs(y1 - y2);
      if (dx > w / 2) dx = w - dx;
      if (dy > h / 2) dy = h - dy;
      return Math.hypot(dx, dy);
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let d1 = 9999;
        let d2 = 9999;
        let nearest = sites[0];

        for (const s of sites) {
          const d = torDist(x, y, s.x, s.y);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            nearest = s;
          } else if (d < d2) {
            d2 = d;
          }
        }

        let dx = x - nearest.x;
        let dy = y - nearest.y;
        if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
        if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;

        let val = nearest.height + dx * nearest.slopeX + dy * nearest.slopeY;

        // Sharp ridge crease at facet boundaries
        const ridge = Math.max(0, 1 - (d2 - d1) / 5);
        val += ridge * 55;

        // Multi-frequency micro-creases
        val += Math.sin(x * 0.45 + y * 0.3) * 14 + Math.cos(x * 0.7 - y * 0.5) * 10;
        val += Math.sin(x * 1.2 + y * 1.1) * 6;

        val = Math.max(0, Math.min(255, Math.round(val)));
        const idx = (y * w + x) * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.generateMipmaps = true;
    this.goldFoilBumpMap = tex;
    return tex;
  }

  /**
   * Generates photorealistic photovoltaic solar array grid texture with monocrystalline
   * silicon cells, chamfered corners, dual silver busbars, and fine contact fingers.
   */
  public static getSolarCellTexture(): THREE.Texture {
    if (this.solarCellMap) return this.solarCellMap;
    if (typeof document === 'undefined') return new THREE.Texture();

    const w = 512;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // 1. Dark metallic aluminum outer backing/border
    ctx.fillStyle = '#050a14';
    ctx.fillRect(0, 0, w, h);

    const cols = 8;
    const rows = 4;
    const marginX = 14;
    const marginY = 10;
    const gap = 3;
    const cellW = (w - marginX * 2 - (cols - 1) * gap) / cols;
    const cellH = (h - marginY * 2 - (rows - 1) * gap) / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = marginX + c * (cellW + gap);
        const y = marginY + r * (cellH + gap);

        // A. Silicon cell base with subtle depth gradient
        const cellGrad = ctx.createLinearGradient(x, y, x, y + cellH);
        cellGrad.addColorStop(0, '#0c2246');
        cellGrad.addColorStop(0.5, '#091a38');
        cellGrad.addColorStop(1, '#07152e');
        ctx.fillStyle = cellGrad;

        // Chamfered pseudo-square monocrystalline wafer corners
        const cornerCut = 4;
        ctx.beginPath();
        ctx.moveTo(x + cornerCut, y);
        ctx.lineTo(x + cellW - cornerCut, y);
        ctx.lineTo(x + cellW, y + cornerCut);
        ctx.lineTo(x + cellW, y + cellH - cornerCut);
        ctx.lineTo(x + cellW - cornerCut, y + cellH);
        ctx.lineTo(x + cornerCut, y + cellH);
        ctx.lineTo(x, y + cellH - cornerCut);
        ctx.lineTo(x, y + cornerCut);
        ctx.closePath();
        ctx.fill();

        // B. Fine horizontal silver contact fingers
        ctx.strokeStyle = 'rgba(195, 215, 240, 0.35)';
        ctx.lineWidth = 1;
        for (let fy = y + 4; fy < y + cellH - 2; fy += 5) {
          ctx.beginPath();
          ctx.moveTo(x + 2, fy);
          ctx.lineTo(x + cellW - 2, fy);
          ctx.stroke();
        }

        // C. Dual vertical main silver collector busbars
        ctx.fillStyle = '#d8e2ec';
        const bbOffset1 = cellW * 0.32;
        const bbOffset2 = cellW * 0.68;
        ctx.fillRect(x + bbOffset1 - 1, y, 2, cellH);
        ctx.fillRect(x + bbOffset2 - 1, y, 2, cellH);

        // Solder pads / interconnect points
        ctx.fillStyle = '#f0f4f8';
        ctx.fillRect(x + bbOffset1 - 2, y + 2, 4, 3);
        ctx.fillRect(x + bbOffset1 - 2, y + cellH - 5, 4, 3);
        ctx.fillRect(x + bbOffset2 - 2, y + 2, 4, 3);
        ctx.fillRect(x + bbOffset2 - 2, y + cellH - 5, 4, 3);
      }
    }

    // Outer protective frame rim
    ctx.strokeStyle = '#525b6a';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = true;
    this.solarCellMap = tex;
    return tex;
  }

  /**
   * Generates matching bump map for the solar array grid.
   */
  public static getSolarCellBumpMap(): THREE.Texture {
    if (this.solarCellBumpMap) return this.solarCellBumpMap;
    if (typeof document === 'undefined') return new THREE.Texture();

    const w = 512;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // Grooves and substrate base (darker)
    ctx.fillStyle = '#323232';
    ctx.fillRect(0, 0, w, h);

    const cols = 8;
    const rows = 4;
    const marginX = 14;
    const marginY = 10;
    const gap = 3;
    const cellW = (w - marginX * 2 - (cols - 1) * gap) / cols;
    const cellH = (h - marginY * 2 - (rows - 1) * gap) / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = marginX + c * (cellW + gap);
        const y = marginY + r * (cellH + gap);

        // Cell wafer body (elevated)
        ctx.fillStyle = '#a0a0a0';
        ctx.fillRect(x, y, cellW, cellH);

        // Busbars (slightly raised above wafer)
        ctx.fillStyle = '#d8d8d8';
        const bbOffset1 = cellW * 0.32;
        const bbOffset2 = cellW * 0.68;
        ctx.fillRect(x + bbOffset1 - 1, y, 2, cellH);
        ctx.fillRect(x + bbOffset2 - 1, y, 2, cellH);
      }
    }

    // Outer frame (raised)
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = true;
    this.solarCellBumpMap = tex;
    return tex;
  }

  /**
   * Generates clean subtle recessed panel seam lines for the upper avionics module.
   */
  public static getAvionicsPanelBumpMap(): THREE.Texture {
    if (this.avionicsBumpMap) return this.avionicsBumpMap;
    if (typeof document === 'undefined') return new THREE.Texture();

    const w = 256;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // Neutral baseline height
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);

    // Recessed modular access panel grooves
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 2;

    // Horizontal access panel divisions
    ctx.strokeRect(16, 24, w - 32, 64);
    ctx.strokeRect(16, 96, w - 32, 72);
    ctx.strokeRect(16, 176, w - 32, 56);

    // Vertical service split
    ctx.beginPath();
    ctx.moveTo(w / 2, 24);
    ctx.lineTo(w / 2, 232);
    ctx.stroke();

    // Fastener rivets (subtle raised dots along seams)
    ctx.fillStyle = '#b0b0b0';
    for (let x = 20; x <= w - 20; x += 24) {
      ctx.fillRect(x - 1, 22, 2, 2);
      ctx.fillRect(x - 1, 94, 2, 2);
      ctx.fillRect(x - 1, 174, 2, 2);
      ctx.fillRect(x - 1, 230, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.generateMipmaps = true;
    this.avionicsBumpMap = tex;
    return tex;
  }

  /**
   * Safely dispose textures on teardown
   */
  public static dispose(): void {
    this.goldFoilAlbedoMap?.dispose();
    this.goldFoilAlbedoMap = null;
    this.goldFoilBumpMap?.dispose();
    this.goldFoilBumpMap = null;
    this.solarCellMap?.dispose();
    this.solarCellMap = null;
    this.solarCellBumpMap?.dispose();
    this.solarCellBumpMap = null;
    this.avionicsBumpMap?.dispose();
    this.avionicsBumpMap = null;
  }
}
