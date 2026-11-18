import * as THREE from 'three';
import { DeterministicPRNG } from './CelestialTextures';

/**
 * Minimal in-memory 2D canvas context for Node.js / headless test environments.
 * Accurately tracks draw calls and rasterizes pixels into an RGBA buffer so unit tests
 * can sample pixel colors at band centers and radial spokes without native C++ canvas bindings.
 */
export class SoftwareCanvas {
  public width: number;
  public height: number;
  public data: Uint8ClampedArray;
  public fillStyle: string = '#000000';
  public strokeStyle: string = '#000000';
  public lineWidth: number = 1;
  public font: string = 'bold 120px sans-serif';
  public textAlign: string = 'center';
  public textBaseline: string = 'middle';
  public letterSpacing: string = '0px';

  private transform = { x: 0, y: 0, angle: 0 };
  private transformStack: Array<{ x: number; y: number; angle: number }> = [];
  public drawnTexts: Array<{ text: string; x: number; y: number; angle: number; font: string; color: string }> = [];

  constructor(width: number, height: number) {
    this.width = Math.floor(width);
    this.height = Math.floor(height);
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }

  public getContext(type: '2d'): this {
    return this;
  }

  public save(): void {
    this.transformStack.push({ ...this.transform });
  }

  public restore(): void {
    if (this.transformStack.length > 0) {
      this.transform = this.transformStack.pop()!;
    }
  }

  public translate(x: number, y: number): void {
    this.transform.x += x;
    this.transform.y += y;
  }

  public rotate(angle: number): void {
    this.transform.angle += angle;
  }

  private parseColor(c: string): [number, number, number, number] {
    c = c.trim();
    if (c.startsWith('#')) {
      const hex = c.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16),
          255
        ];
      }
      if (hex.length >= 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          255
        ];
      }
    }
    if (c.startsWith('rgba') || c.startsWith('rgb')) {
      const parts = c.replace(/rgba?\(|\)/g, '').split(',').map(s => parseFloat(s.trim()));
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0, Math.round((parts[3] !== undefined ? parts[3] : 1) * 255)];
    }
    return [0, 0, 0, 255];
  }

  public fillRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b, a] = this.parseColor(this.fillStyle);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));

    for (let py = y0; py < y1; py++) {
      let idx = (py * this.width + x0) * 4;
      for (let px = x0; px < x1; px++) {
        this.data[idx] = r;
        this.data[idx + 1] = g;
        this.data[idx + 2] = b;
        this.data[idx + 3] = a;
        idx += 4;
      }
    }
  }

  public strokeRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b, a] = this.parseColor(this.strokeStyle);
    const lw = Math.max(1, Math.round(this.lineWidth));
    const fillRegion = (rx: number, ry: number, rw: number, rh: number) => {
      const x0 = Math.max(0, Math.floor(rx));
      const y0 = Math.max(0, Math.floor(ry));
      const x1 = Math.min(this.width, Math.floor(rx + rw));
      const y1 = Math.min(this.height, Math.floor(ry + rh));
      for (let py = y0; py < y1; py++) {
        let idx = (py * this.width + x0) * 4;
        for (let px = x0; px < x1; px++) {
          this.data[idx] = r;
          this.data[idx + 1] = g;
          this.data[idx + 2] = b;
          this.data[idx + 3] = a;
          idx += 4;
        }
      }
    };
    fillRegion(x, y, w, lw);
    fillRegion(x, y + h - lw, w, lw);
    fillRegion(x, y, lw, h);
    fillRegion(x + w - lw, y, lw, h);
  }

  private currentPath: Array<
    | { type: 'arc'; cx: number; cy: number; r: number }
    | { type: 'line'; x0: number; y0: number; x1: number; y1: number }
  > = [];
  private _lastX: number = 0;
  private _lastY: number = 0;

  public beginPath(): void {
    this.currentPath = [];
  }

  public arc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): void {
    this.currentPath.push({ type: 'arc', cx, cy, r });
  }

  public moveTo(x: number, y: number): void {
    this._lastX = x;
    this._lastY = y;
  }

  public lineTo(x1: number, y1: number): void {
    this.currentPath.push({ type: 'line', x0: this._lastX, y0: this._lastY, x1, y1 });
    this._lastX = x1;
    this._lastY = y1;
  }

  public fill(): void {
    const [r, g, b, a] = this.parseColor(this.fillStyle);
    for (const item of this.currentPath) {
      if (item.type === 'arc') {
        const { cx, cy, r: radius } = item;
        const y0 = Math.max(0, Math.floor(cy - radius));
        const y1 = Math.min(this.height, Math.ceil(cy + radius));
        for (let py = y0; py < y1; py++) {
          const dy = py - cy;
          const dx = Math.sqrt(Math.max(0, radius * radius - dy * dy));
          const x0 = Math.max(0, Math.floor(cx - dx));
          const x1 = Math.min(this.width, Math.ceil(cx + dx));
          let idx = (py * this.width + x0) * 4;
          for (let px = x0; px < x1; px++) {
            this.data[idx] = r;
            this.data[idx + 1] = g;
            this.data[idx + 2] = b;
            this.data[idx + 3] = a;
            idx += 4;
          }
        }
      }
    }
  }

  public stroke(): void {
    const [r, g, b, a] = this.parseColor(this.strokeStyle);
    const lw = Math.max(1, this.lineWidth);
    for (const item of this.currentPath) {
      if (item.type === 'arc') {
        const { cx, cy, r: radius } = item;
        const rOuter = radius + lw * 0.5;
        const rInner = Math.max(0, radius - lw * 0.5);
        const y0 = Math.max(0, Math.floor(cy - rOuter));
        const y1 = Math.min(this.height, Math.ceil(cy + rOuter));
        for (let py = y0; py < y1; py++) {
          const dy = py - cy;
          const distSq = dy * dy;
          const x0 = Math.max(0, Math.floor(cx - rOuter));
          const x1 = Math.min(this.width, Math.ceil(cx + rOuter));
          for (let px = x0; px < x1; px++) {
            const dx = px - cx;
            const dist = Math.sqrt(dx * dx + distSq);
            if (dist >= rInner && dist <= rOuter) {
              const idx = (py * this.width + px) * 4;
              this.data[idx] = r;
              this.data[idx + 1] = g;
              this.data[idx + 2] = b;
              this.data[idx + 3] = a;
            }
          }
        }
      } else if (item.type === 'line') {
        const { x0, y0, x1, y1 } = item;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) continue;
        const steps = Math.ceil(len * 2);
        const halfW = Math.max(1, Math.floor(lw * 0.5));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const lx = x0 + dx * t;
          const ly = y0 + dy * t;
          for (let oy = -halfW; oy <= halfW; oy++) {
            for (let ox = -halfW; ox <= halfW; ox++) {
              const px = Math.floor(lx + ox);
              const py = Math.floor(ly + oy);
              if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
                const idx = (py * this.width + px) * 4;
                this.data[idx] = r;
                this.data[idx + 1] = g;
                this.data[idx + 2] = b;
                this.data[idx + 3] = a;
              }
            }
          }
        }
      }
    }
  }

  public fillText(text: string, x: number, y: number): void {
    this.drawnTexts.push({
      text,
      x: x + this.transform.x,
      y: y + this.transform.y,
      angle: this.transform.angle,
      font: this.font,
      color: this.fillStyle
    });
  }

  public getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray } {
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) {
      const srcY = sy + y;
      for (let x = 0; x < sw; x++) {
        const srcX = sx + x;
        const targetIdx = (y * sw + x) * 4;
        if (srcX >= 0 && srcX < this.width && srcY >= 0 && srcY < this.height) {
          const srcIdx = (srcY * this.width + srcX) * 4;
          out[targetIdx] = this.data[srcIdx];
          out[targetIdx + 1] = this.data[srcIdx + 1];
          out[targetIdx + 2] = this.data[srcIdx + 2];
          out[targetIdx + 3] = this.data[srcIdx + 3];
        } else {
          out[targetIdx + 3] = 0;
        }
      }
    }
    return { data: out };
  }
}

/**
 * Procedural PBR Canvas Texture & Material Generator
 * Synthesizes aerospace panel seams, rivet lines, thermal insulation blankets (Kapton MLI),
 * solar cell grids, regolith micro-texture, and titanium weave without external image assets.
 * 
 * Safely guards against Node.js SSR/headless test environments (typeof document === 'undefined').
 */
export class RocketTextures {
  private static fuselageTexture: THREE.Texture | null = null;
  private static interstageTexture: THREE.Texture | null = null;
  private static nozzleTexture: THREE.Texture | null = null;
  private static kaptonNormalMap: THREE.Texture | null = null;
  private static solarCellTexture: THREE.Texture | null = null;
  private static carbonWeaveTexture: THREE.Texture | null = null;
  private static regolithAlbedoTexture: THREE.Texture | null = null;
  private static regolithNormalMap: THREE.Texture | null = null;
  private static regolithBumpMap: THREE.Texture | null = null;
  private static indianFlagTexture: THREE.Texture | null = null;
  private static marezeroTexture: THREE.Texture | null = null;

  public static getFuselageTexture(): THREE.Texture {
    if (this.fuselageTexture) return this.fuselageTexture;
    if (typeof document === 'undefined') return new THREE.Texture();

    const width = 1024;
    const height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Base aerospace off-white / light composite with subtle grain
    ctx.fillStyle = '#f4f6fb';
    ctx.fillRect(0, 0, width, height);

    // Subtle vertical panel seams
    ctx.strokeStyle = '#c8cedd';
    ctx.lineWidth = 2;
    const cols = 8;
    for (let c = 0; c < cols; c++) {
      const x = (c / cols) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Precision flush rivets along seams
      ctx.fillStyle = '#9da5ba';
      for (let y = 12; y < height; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Horizontal stringers & weld rings
    const rows = 12;
    for (let r = 0; r < rows; r++) {
      const y = (r / rows) * height;
      ctx.strokeStyle = '#b8c0d2';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Clean aerospace white composite with precision panel seams and rivets
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.fuselageTexture = texture;
    return texture;
  }

  public static getInterstageTexture(): THREE.Texture {
    if (this.interstageTexture) return this.interstageTexture;
    if (typeof document === 'undefined') return new THREE.Texture();

    const width = 512;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Dark structural titanium / carbon fiber
    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, width, height);

    // Corrugated structural fluting / ribs
    const ribs = 32;
    for (let i = 0; i < ribs; i++) {
      const x = (i / ribs) * width;
      const w = width / ribs;
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#2d333f');
      grad.addColorStop(0.5, '#0f1116');
      grad.addColorStop(1, '#2d333f');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, w, height);

      // Truss diagonal lines
      ctx.strokeStyle = '#3d4454';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w, height);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.interstageTexture = texture;
    return texture;
  }

  public static getNozzleTexture(): THREE.Texture {
    if (this.nozzleTexture) return this.nozzleTexture;
    if (typeof document === 'undefined') return new THREE.Texture();

    const width = 256;
    const height = 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Heat-tempered niobium alloy nozzle exterior to glowing emissive throat
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#ff9922'); // glowing throat
    grad.addColorStop(0.18, '#aa5511');
    grad.addColorStop(0.42, '#3e424d'); // heat-stained bell
    grad.addColorStop(1, '#202228');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Regenerative cooling channel stiffener rings
    ctx.strokeStyle = '#555b68';
    ctx.lineWidth = 2.5;
    for (let y = 20; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical cooling channels
    ctx.strokeStyle = 'rgba(255, 180, 50, 0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.nozzleTexture = texture;
    return texture;
  }

  public static getKaptonNormalMap(): THREE.Texture {
    if (this.kaptonNormalMap) return this.kaptonNormalMap;
    if (typeof document === 'undefined') return new THREE.Texture();

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807 + 12345) % 2147483647;
      return seed / 2147483647;
    };

    const hField: number[][] = [];
    for (let y = 0; y < size; y++) {
      hField[y] = new Array(size);
      for (let x = 0; x < size; x++) {
        const f1 = Math.sin(x * 0.12) * Math.cos(y * 0.14);
        const f2 = Math.sin(x * 0.28 + y * 0.2) * Math.sin(y * 0.35);
        const f3 = Math.sin(x * 0.65 - y * 0.45) * 0.5;
        const noise = (rnd() - 0.5) * 0.4;
        hField[y][x] = (f1 + f2 + f3 + noise);
      }
    }

    for (let y = 0; y < size; y++) {
      const yPrev = (y - 1 + size) % size;
      const yNext = (y + 1) % size;
      for (let x = 0; x < size; x++) {
        const xPrev = (x - 1 + size) % size;
        const xNext = (x + 1) % size;

        const dx = (hField[y][xNext] - hField[y][xPrev]) * 1.8;
        const dy = (hField[yNext][x] - hField[yPrev][x]) * 1.8;

        const len = Math.sqrt(dx * dx + dy * dy + 1.0);
        const nx = -dx / len;
        const ny = -dy / len;
        const nz = 1.0 / len;

        const idx = (y * size + x) * 4;
        data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    this.kaptonNormalMap = texture;
    return texture;
  }

  public static getSolarCellTexture(): THREE.Texture {
    if (this.solarCellTexture) return this.solarCellTexture;
    if (typeof document === 'undefined') return new THREE.Texture();

    const width = 512;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0a162b';
    ctx.fillRect(0, 0, width, height);

    const cellsX = 8;
    const cellsY = 4;
    const cellW = width / cellsX;
    const cellH = height / cellsY;

    for (let cx = 0; cx < cellsX; cx++) {
      for (let cy = 0; cy < cellsY; cy++) {
        const x = cx * cellW;
        const y = cy * cellH;

        const grad = ctx.createLinearGradient(x, y, x + cellW, y + cellH);
        grad.addColorStop(0, '#0c1b33');
        grad.addColorStop(0.5, '#071224');
        grad.addColorStop(1, '#0e203d');
        ctx.fillStyle = grad;
        ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

        ctx.strokeStyle = 'rgba(180, 205, 235, 0.28)';
        ctx.lineWidth = 1;
        for (let fx = x + 6; fx < x + cellW - 4; fx += 8) {
          ctx.beginPath();
          ctx.moveTo(fx, y + 2);
          ctx.lineTo(fx, y + cellH - 2);
          ctx.stroke();
        }

        ctx.strokeStyle = '#d4e0f0';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + cellH * 0.33);
        ctx.lineTo(x + cellW - 2, y + cellH * 0.33);
        ctx.moveTo(x + 2, y + cellH * 0.67);
        ctx.lineTo(x + cellW - 2, y + cellH * 0.67);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.solarCellTexture = texture;
    return texture;
  }

  /**
   * Generates seamless 1024x1024 polar lunar regolith PBR maps:
   * 1. Albedo map: gritty lunar soil mottling from dark basaltic grey (#3b3a38) to lighter highland dust (#7d7b76)
   * 2. Tangent-space Normal map: multi-scale relief with high-frequency fine dust grain noise & organic crater rims
   * 3. Displacement / Bump map: elevation heightfield for micro-relief
   * Cached statically for zero GC runtime performance.
   */
  private static generateRegolithMaps(): void {
    if (this.regolithAlbedoTexture && this.regolithNormalMap && this.regolithBumpMap) return;
    if (typeof document === 'undefined') return;

    const size = 1024;
    const prng = new DeterministicPRNG(19690720);

    // 1. Compute Seamless 2D Toroidal Heightfield (Isotropic Multi-Octave Noise & Fine Dust Grain)
    const heightField = new Float32Array(size * size);

    // Permutation table for seamless toroidal gradient noise
    const perm = new Uint8Array(512);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(prng.next() * (i + 1));
      const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];

    // 256 isotropic 2D unit gradients (continuous non-axis-aligned random directions)
    const gradX = new Float32Array(256);
    const gradY = new Float32Array(256);
    for (let g = 0; g < 256; g++) {
      const ang = prng.next() * Math.PI * 2;
      gradX[g] = Math.cos(ang);
      gradY[g] = Math.sin(ang);
    }

    const sampleSeamlessNoise = (u: number, v: number, freq: number): number => {
      const fu = u * freq;
      const fv = v * freq;
      const x0 = Math.floor(fu);
      const y0 = Math.floor(fv);
      const fx = fu - x0;
      const fy = fv - y0;
      // Quintic smoothstep for C2 continuity (eliminates grid seams and banding)
      const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
      const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

      // Toroidal wrapping so textures tile seamlessly
      const gx0 = ((x0 % freq) + freq) % freq;
      const gy0 = ((y0 % freq) + freq) % freq;
      const gx1 = (gx0 + 1) % freq;
      const gy1 = (gy0 + 1) % freq;

      const g00 = perm[(perm[gx0 % 256] + gy0) % 256];
      const g10 = perm[(perm[gx1 % 256] + gy0) % 256];
      const g01 = perm[(perm[gx0 % 256] + gy1) % 256];
      const g11 = perm[(perm[gx1 % 256] + gy1) % 256];

      const d00 = gradX[g00] * fx + gradY[g00] * fy;
      const d10 = gradX[g10] * (fx - 1) + gradY[g10] * fy;
      const d01 = gradX[g01] * fx + gradY[g01] * (fy - 1);
      const d11 = gradX[g11] * (fx - 1) + gradY[g11] * (fy - 1);

      const nx0 = d00 + sx * (d10 - d00);
      const nx1 = d01 + sx * (d11 - d01);
      return nx0 + sy * (nx1 - nx0);
    };

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = y * size + x;

        // Isotropic multi-scale terrain noise (completely eliminates diagonal grid moiré)
        let elev = 0.50;
        elev += sampleSeamlessNoise(u, v, 3) * 0.075;
        elev += sampleSeamlessNoise(u, v, 6) * 0.040;
        elev += sampleSeamlessNoise(u, v, 12) * 0.022;
        elev += sampleSeamlessNoise(u, v, 24) * 0.012;
        elev += sampleSeamlessNoise(u, v, 48) * 0.006;
        elev += sampleSeamlessNoise(u, v, 96) * 0.003;
        elev += (prng.next() - 0.5) * 0.005; // powdery micro-grain grit

        heightField[idx] = elev;
      }
    }

    // 2. Seamless Organic Micro & Medium Impact Craters with Non-uniform Rims
    const craters: Array<{ cx: number; cy: number; r: number; bowl: number; rim: number; seed: number }> = [];
    // 8 prominent medium craters
    for (let i = 0; i < 8; i++) {
      craters.push({
        cx: prng.next() * size,
        cy: prng.next() * size,
        r: 26 + prng.next() * 28,
        bowl: 0.30 + prng.next() * 0.14,
        rim: 0.20 + prng.next() * 0.12,
        seed: prng.next() * 100
      });
    }
    // 95 secondary micro-craters
    for (let i = 0; i < 95; i++) {
      craters.push({
        cx: prng.next() * size,
        cy: prng.next() * size,
        r: 5 + prng.next() * 18,
        bowl: 0.18 + prng.next() * 0.15,
        rim: 0.13 + prng.next() * 0.10,
        seed: prng.next() * 100
      });
    }

    for (const c of craters) {
      const cr = c.r;
      const extent = Math.ceil(cr * 2.2);
      const minX = Math.floor(c.cx - extent);
      const maxX = Math.ceil(c.cx + extent);
      const minY = Math.floor(c.cy - extent);
      const maxY = Math.ceil(c.cy + extent);

      for (let py = minY; py <= maxY; py++) {
        const wy = ((py % size) + size) % size;
        const dy = py - c.cy;

        for (let px = minX; px <= maxX; px++) {
          const wx = ((px % size) + size) % size;
          const dx = px - c.cx;
          const dist = Math.hypot(dx, dy);
          const th = Math.atan2(dy, dx);

          // Organic radius distortion (lobate, irregular crater rim)
          const distortion = 1.0 + 0.14 * Math.sin(3 * th + c.seed) + 0.08 * Math.cos(5 * th - c.seed * 0.6);
          const effR = cr * distortion;
          const u = dist / effR;

          const idx = wy * size + wx;
          if (u < 0.82) {
            // Excavation bowl
            const bowlDrop = c.bowl * Math.cos((u / 0.82) * (Math.PI / 2));
            heightField[idx] = Math.max(0.04, heightField[idx] - bowlDrop);
          } else if (u < 2.0) {
            // Smoothly blended outer ejecta slope
            let rimFactor: number;
            if (u < 0.95) {
              rimFactor = Math.sin(((u - 0.82) / 0.13) * (Math.PI / 2));
            } else {
              const ejectaU = (u - 0.95) / 1.05;
              rimFactor = Math.exp(-4.2 * ejectaU * ejectaU);
            }
            heightField[idx] = Math.min(0.98, heightField[idx] + c.rim * rimFactor);
          }
        }
      }
    }

    // 3. Generate Tangent-Space Normal Map (Sobel gradient filter with toroidal boundaries)
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = size;
    normalCanvas.height = size;
    const normalCtx = normalCanvas.getContext('2d')!;
    const normalImg = normalCtx.createImageData(size, size);
    const nData = normalImg.data;
    const normalStrength = 2.4;

    for (let y = 0; y < size; y++) {
      const y0 = (y - 1 + size) % size;
      const y1 = (y + 1) % size;

      for (let x = 0; x < size; x++) {
        const x0 = (x - 1 + size) % size;
        const x1 = (x + 1) % size;

        const dzdx = (heightField[y * size + x1] - heightField[y * size + x0]) * normalStrength;
        const dzdy = (heightField[y1 * size + x] - heightField[y0 * size + x]) * normalStrength;

        const invLen = 1.0 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
        const nx = -dzdx * invLen;
        const ny = -dzdy * invLen;
        const nz = invLen;

        const pIdx = (y * size + x) * 4;
        nData[pIdx] = Math.round((nx * 0.5 + 0.5) * 255);
        nData[pIdx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        nData[pIdx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        nData[pIdx + 3] = 255;
      }
    }
    normalCtx.putImageData(normalImg, 0, 0);

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.repeat.set(8, 8);
    normalTex.generateMipmaps = true;
    normalTex.minFilter = THREE.LinearMipmapLinearFilter;
    normalTex.magFilter = THREE.LinearFilter;
    this.regolithNormalMap = normalTex;

    // 4. Generate Displacement / Elevation Bump Map
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bumpCtx = bumpCanvas.getContext('2d')!;
    const bumpImg = bumpCtx.createImageData(size, size);
    const bData = bumpImg.data;

    for (let i = 0; i < size * size; i++) {
      const val = Math.round(heightField[i] * 255);
      const bIdx = i * 4;
      bData[bIdx] = val;
      bData[bIdx + 1] = val;
      bData[bIdx + 2] = val;
      bData[bIdx + 3] = 255;
    }
    bumpCtx.putImageData(bumpImg, 0, 0);

    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(8, 8);
    bumpTex.generateMipmaps = true;
    bumpTex.minFilter = THREE.LinearMipmapLinearFilter;
    bumpTex.magFilter = THREE.LinearFilter;
    this.regolithBumpMap = bumpTex;

    // 5. Generate High-Resolution Albedo (Diffuse) Map with Authentic Regolith Mottling
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = size;
    albedoCanvas.height = size;
    const aCtx = albedoCanvas.getContext('2d')!;

    // Base tone: natural gritty lunar regolith mid-tone (#555450)
    aCtx.fillStyle = '#555450';
    aCtx.fillRect(0, 0, size, size);

    // Multi-scale mineral patches: blending dark basaltic grey (#3b3a38) and lighter highland dust (#7d7b76)
    const patchPrng = new DeterministicPRNG(19710730);
    for (let p = 0; p < 36; p++) {
      const px = patchPrng.next() * size;
      const py = patchPrng.next() * size;
      const pr = 35 + patchPrng.next() * 110;
      const isDark = patchPrng.next() > 0.45;
      const pGrad = aCtx.createRadialGradient(px, py, 0, px, py, pr);
      // Dark basaltic grey (#3b3a38 = rgb(59,58,56)) vs lighter highland dust (#7d7b76 = rgb(125,123,118))
      pGrad.addColorStop(0.0, isDark ? 'rgba(59, 58, 56, 0.55)' : 'rgba(125, 123, 118, 0.45)');
      pGrad.addColorStop(1.0, 'rgba(85, 84, 80, 0.0)');
      aCtx.fillStyle = pGrad;
      aCtx.beginPath();
      aCtx.arc(px, py, pr, 0, Math.PI * 2);
      aCtx.fill();
    }

    // Paint crater bowls (dark basaltic floor #3b3a38) and organic rims (lighter highland shock dust #7d7b76)
    for (const c of craters) {
      // Excavation bowl
      const bowlGrad = aCtx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, c.r * 0.85);
      bowlGrad.addColorStop(0.0, 'rgba(59, 58, 56, 0.72)');
      bowlGrad.addColorStop(0.85, 'rgba(72, 70, 68, 0.45)');
      bowlGrad.addColorStop(1.0, 'rgba(85, 84, 80, 0.0)');
      aCtx.fillStyle = bowlGrad;
      aCtx.beginPath();
      aCtx.arc(c.cx, c.cy, c.r * 0.85, 0, Math.PI * 2);
      aCtx.fill();

      // Organic rim highlight (#7d7b76 shock-melt ejecta)
      aCtx.strokeStyle = 'rgba(125, 123, 118, 0.65)';
      aCtx.lineWidth = Math.max(1.8, c.r * 0.18);
      aCtx.beginPath();
      // Draw slightly wavy organic rim outline
      const segments = 24;
      for (let s = 0; s <= segments; s++) {
        const th = (s / segments) * Math.PI * 2;
        const distR = c.r * (0.95 + 0.10 * Math.sin(3 * th + c.seed));
        const rx = c.cx + Math.cos(th) * distR;
        const ry = c.cy + Math.sin(th) * distR;
        if (s === 0) aCtx.moveTo(rx, ry);
        else aCtx.lineTo(rx, ry);
      }
      aCtx.closePath();
      aCtx.stroke();

      // Delicate micro-ejecta rays for prominent craters (r > 20)
      if (c.r > 20) {
        for (let ray = 0; ray < 16; ray++) {
          const ang = (ray / 16) * Math.PI * 2 + (patchPrng.next() - 0.5) * 0.25;
          const rayLen = c.r * (1.3 + patchPrng.next() * 2.0);
          aCtx.strokeStyle = `rgba(125, 123, 118, ${0.22 + patchPrng.next() * 0.25})`;
          aCtx.lineWidth = 1.3;
          aCtx.beginPath();
          aCtx.moveTo(c.cx + Math.cos(ang) * (c.r * 0.9), c.cy + Math.sin(ang) * (c.r * 0.9));
          aCtx.lineTo(c.cx + Math.cos(ang) * (c.r * 0.9 + rayLen), c.cy + Math.sin(ang) * (c.r * 0.9 + rayLen));
          aCtx.stroke();
        }
      }
    }

    // High-frequency fine dust grain speckles (powdery gritty soil texture)
    const dustCount = 28000;
    for (let i = 0; i < dustCount; i++) {
      const rx = patchPrng.next() * size;
      const ry = patchPrng.next() * size;
      const isLight = patchPrng.next() > 0.48;
      const alpha = 0.06 + patchPrng.next() * 0.10;
      aCtx.fillStyle = isLight ? `rgba(125, 123, 118, ${alpha})` : `rgba(45, 44, 42, ${alpha})`;
      const sz = patchPrng.next() > 0.85 ? 2 : 1;
      aCtx.fillRect(rx, ry, sz, sz);
    }

    const albedoTex = new THREE.CanvasTexture(albedoCanvas);
    albedoTex.wrapS = THREE.RepeatWrapping;
    albedoTex.wrapT = THREE.RepeatWrapping;
    albedoTex.repeat.set(8, 8);
    albedoTex.generateMipmaps = true;
    albedoTex.minFilter = THREE.LinearMipmapLinearFilter;
    albedoTex.magFilter = THREE.LinearFilter;
    this.regolithAlbedoTexture = albedoTex;
  }

  public static getRegolithAlbedoTexture(repeatU: number = 8, repeatV: number = 8): THREE.Texture {
    if (!this.regolithAlbedoTexture) {
      this.generateRegolithMaps();
    }
    if (typeof document === 'undefined') return new THREE.Texture();
    if (repeatU === 8 && repeatV === 8) {
      this.regolithAlbedoTexture!.repeat.set(8, 8);
      return this.regolithAlbedoTexture!;
    }
    const tex = this.regolithAlbedoTexture!.clone();
    tex.repeat.set(repeatU, repeatV);
    tex.needsUpdate = true;
    return tex;
  }

  public static getRegolithNormalMap(repeatU: number = 8, repeatV: number = 8): THREE.Texture {
    if (!this.regolithNormalMap) {
      this.generateRegolithMaps();
    }
    if (typeof document === 'undefined') return new THREE.Texture();
    if (repeatU === 8 && repeatV === 8) {
      this.regolithNormalMap!.repeat.set(8, 8);
      return this.regolithNormalMap!;
    }
    const tex = this.regolithNormalMap!.clone();
    tex.repeat.set(repeatU, repeatV);
    tex.needsUpdate = true;
    return tex;
  }

  public static getRegolithBumpMap(repeatU: number = 8, repeatV: number = 8): THREE.Texture {
    if (!this.regolithBumpMap) {
      this.generateRegolithMaps();
    }
    if (typeof document === 'undefined') return new THREE.Texture();
    if (repeatU === 8 && repeatV === 8) {
      this.regolithBumpMap!.repeat.set(8, 8);
      return this.regolithBumpMap!;
    }
    const tex = this.regolithBumpMap!.clone();
    tex.repeat.set(repeatU, repeatV);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Generates authentic Indian National Flag 2D canvas at 3:2 ratio (default 2048 x 1365).
   * Exact geometry:
   * - Top third: Saffron (#FF9933)
   * - Middle third: White (#FFFFFF)
   * - Bottom third: Green (#138808)
   * - Center Ashoka Chakra in Navy Blue (#000080):
   *   Diameter = 0.75 of white band height, central hub, outer ring, and exactly 24 spokes.
   * - Thin dark outer border (#1a202c) for painted decal finish against fuselage.
   */
  public static generateIndianFlagCanvas(width: number = 2048): HTMLCanvasElement | SoftwareCanvas {
    const height = Math.round((width * 2) / 3);
    const canvas = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : new SoftwareCanvas(width, height);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d') as (CanvasRenderingContext2D | SoftwareCanvas);

    const bandHeight = height / 3;

    // 1. Saffron top band (#FF9933)
    ctx.fillStyle = '#FF9933';
    ctx.fillRect(0, 0, width, bandHeight);

    // 2. White middle band (#FFFFFF)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, bandHeight, width, bandHeight);

    // 3. Green bottom band (#138808)
    ctx.fillStyle = '#138808';
    ctx.fillRect(0, bandHeight * 2, width, bandHeight);

    // 4. Ashoka Chakra
    const cx = width / 2;
    const cy = height / 2;
    const chakraDiameter = bandHeight * 0.75;
    const chakraRadius = chakraDiameter / 2;
    const hubRadius = chakraRadius * 0.17;
    const spokeCount = 24;

    ctx.fillStyle = '#000080';
    ctx.strokeStyle = '#000080';
    ctx.lineWidth = Math.max(3, width * 0.0028);

    // Outer Chakra Ring
    ctx.beginPath();
    ctx.arc(cx, cy, chakraRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Central Chakra Hub
    ctx.beginPath();
    ctx.arc(cx, cy, hubRadius, 0, Math.PI * 2);
    ctx.fill();

    // Exactly 24 Evenly Spaced Radial Spokes
    const spokeLineWidth = Math.max(2.5, width * 0.0022);
    ctx.lineWidth = spokeLineWidth;
    for (let k = 0; k < spokeCount; k++) {
      const angle = (k * 2 * Math.PI) / spokeCount;
      const x0 = cx + Math.cos(angle) * hubRadius;
      const y0 = cy + Math.sin(angle) * hubRadius;
      const x1 = cx + Math.cos(angle) * (chakraRadius - ctx.lineWidth * 0.5);
      const y1 = cy + Math.sin(angle) * (chakraRadius - ctx.lineWidth * 0.5);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // 5. Thin dark painted decal border so flag reads clearly on white fuselage
    const borderWidth = Math.max(3, Math.round(width * 0.0025));
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(0, 0, width, height);

    return canvas as (HTMLCanvasElement | SoftwareCanvas);
  }

  /**
   * Generates team name "MAREZERO" vertical aerospace lettering canvas.
   * Rotated 90 degrees to read bottom-to-top along the rocket body length.
   * Bold, wide-tracked aerospace sans-serif in dark navy / near-black ink (#0b1329).
   */
  public static generateMarezeroCanvas(width: number = 512, height: number = 2048): HTMLCanvasElement | SoftwareCanvas {
    const canvas = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : new SoftwareCanvas(width, height);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d') as (CanvasRenderingContext2D | SoftwareCanvas);

    // Transparent background
    if (typeof (ctx as any).clearRect === 'function') {
      (ctx as CanvasRenderingContext2D).clearRect(0, 0, width, height);
    }

    const text = 'MAREZERO';
    const textColor = '#0b1329'; // Dark aerospace navy stencil ink

    ctx.save();
    ctx.translate(width / 2, height / 2);
    // Rotate -90 degrees (-PI/2) so text reads bottom to top along rocket (+Y rocket = -Y canvas)
    ctx.rotate(-Math.PI / 2);

    ctx.fillStyle = textColor;
    ctx.font = '900 200px "Arial Black", "Impact", "Montserrat", "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Wide aerospace tracking: manual letter stepping for maximum fidelity
    const letters = text.split('');
    const tracking = 205; // Spacing between glyph centers
    const startX = -((letters.length - 1) * tracking) / 2;

    for (let i = 0; i < letters.length; i++) {
      ctx.fillText(letters[i], startX + i * tracking, 0);
    }

    ctx.restore();
    return canvas as (HTMLCanvasElement | SoftwareCanvas);
  }

  /**
   * Returns High-Resolution Indian Flag PBR Texture with proper sRGB color management & anisotropic filtering.
   */
  public static getIndianFlagTexture(): THREE.Texture {
    if (this.indianFlagTexture) return this.indianFlagTexture;
    if (typeof document === 'undefined') return new THREE.Texture();

    const canvas = this.generateIndianFlagCanvas(2048) as HTMLCanvasElement;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 16;
    texture.needsUpdate = true;
    this.indianFlagTexture = texture;
    return texture;
  }

  /**
   * Returns High-Resolution Team MAREZERO Vertical Decal Texture.
   */
  public static getMarezeroTexture(): THREE.Texture {
    if (this.marezeroTexture) return this.marezeroTexture;
    if (typeof document === 'undefined') return new THREE.Texture();

    const canvas = this.generateMarezeroCanvas(512, 2048) as HTMLCanvasElement;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 16;
    texture.needsUpdate = true;
    this.marezeroTexture = texture;
    return texture;
  }
}

/**
 * Creates authentic Kapton Gold MLI (Multi-Layer Insulation) thermal foil material
 * Used across the Apollo LM, Artemis HLS, and Intuitive Machines lunar landers.
 */
export function createKaptonFoilMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xd49b27,
    metalness: 0.92,
    roughness: 0.22,
    normalMap: RocketTextures.getKaptonNormalMap(),
    normalScale: new THREE.Vector2(0.85, 0.85),
    side: THREE.DoubleSide
  });
}

/**
 * Creates aerospace-grade brushed cryo-aluminum material
 */
export function createBrushedAluminumMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xd6dbe6,
    metalness: 0.85,
    roughness: 0.32
  });
}

/**
 * Creates dark sintered silicon-carbide material for reaction control thrusters
 */
export function createRcsThrusterMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x1f232b,
    metalness: 0.72,
    roughness: 0.48
  });
}

/**
 * Creates photovoltaic silicon cell material with realistic cyan/blue specular reflection
 */
export function createSolarCellMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x081325,
    map: RocketTextures.getSolarCellTexture(),
    metalness: 0.94,
    roughness: 0.14,
    side: THREE.DoubleSide
  });
}

/**
 * Creates Hapke / Lommel-Seeliger regolith material with full PBR albedo and tangent normal mapping.
 * Features isotropic multi-scale gradient noise, fine dust grain grit, and authentic polar shadow relief.
 * Tangent-space normal mapping eliminates screen-space derivative finite difference banding under low-angle grazing sunlight.
 */
export function createLunarRegolithMaterial(repeatU: number = 8, repeatV: number = 8): THREE.MeshStandardMaterial {
  const albedo = RocketTextures.getRegolithAlbedoTexture(repeatU, repeatV);
  const normal = RocketTextures.getRegolithNormalMap(repeatU, repeatV);

  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedo,
    normalMap: normal,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.96,
    metalness: 0.0,
    flatShading: false
  });
}
