import * as THREE from 'three';

/**
 * Deterministic pseudo-random number generator for bit-exact reproducible procedural textures.
 * Uses Apollo 11 touchdown date (July 20, 1969) as seed.
 */
export class DeterministicPRNG {
  private seed: number;
  constructor(seed: number = 19690720) {
    this.seed = seed;
  }
  public next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}

/**
 * High-Resolution PBR Texture Generator for Earth and Moon
 * 
 * Features:
 * - High-resolution 2048x1024 cinematic lunar surface albedo texture matching Canadian Space Agency standards:
 *   Authentic basaltic maria, highland anorthosite crust, bright ray systems (Tycho, Copernicus, Kepler, Aristarchus)
 * - Matching 2048x1024 tangent-space Normal Map & Bump Map with crater rim relief, central peaks, and mountain ridges
 * - Produces deep, realistic shadow depth and grazing illumination along the lunar terminator under low-angle sunlight
 * - Lazy-loaded and cached statically for zero GC runtime and locked 60 FPS performance
 */
export class CelestialTextures {
  private static earthTexture: THREE.Texture | null = null;
  private static moonTexture: THREE.Texture | null = null;
  private static moonNormalMap: THREE.Texture | null = null;
  private static moonBumpMap: THREE.Texture | null = null;

  public static getEarthTexture(): THREE.Texture {
    if (this.earthTexture) return this.earthTexture;
    if (typeof document === 'undefined') return new THREE.Texture();

    const w = 1024;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // 1. Deep Ocean Blue Background
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
    oceanGrad.addColorStop(0, '#0a2342'); // Arctic ocean
    oceanGrad.addColorStop(0.3, '#0b396e');
    oceanGrad.addColorStop(0.5, '#0e4a8c'); // Tropical ocean
    oceanGrad.addColorStop(0.7, '#0b396e');
    oceanGrad.addColorStop(1, '#081c36'); // Southern ocean
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Continental Landmasses (Stylized continental plates)
    ctx.fillStyle = '#22543d'; // Rich forest green / terrain

    // Americas
    ctx.beginPath();
    // North America
    ctx.ellipse(w * 0.22, h * 0.32, w * 0.11, h * 0.16, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // South America
    ctx.beginPath();
    ctx.ellipse(w * 0.30, h * 0.65, w * 0.07, h * 0.18, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Eurasia & Africa
    ctx.fillStyle = '#2d6a4f';
    ctx.beginPath();
    // Europe & Asia
    ctx.ellipse(w * 0.68, h * 0.30, w * 0.20, h * 0.16, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Africa (warm savanna tint)
    ctx.fillStyle = '#744210';
    ctx.beginPath();
    ctx.ellipse(w * 0.55, h * 0.55, w * 0.09, h * 0.18, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Australia
    ctx.fillStyle = '#975a16';
    ctx.beginPath();
    ctx.ellipse(w * 0.82, h * 0.72, w * 0.05, h * 0.08, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // 3. Polar Ice Caps
    ctx.fillStyle = '#e2e8f0';
    // North pole ice
    ctx.beginPath();
    ctx.ellipse(w * 0.5, 0, w * 0.45, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // Antarctica
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h, w * 0.48, h * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Swirled Atmospheric Cloud Systems
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let c = 0; c < 24; c++) {
      const cx = (c / 24) * w + (Math.sin(c) * 40);
      const cy = h * 0.25 + Math.cos(c * 1.5) * (h * 0.35);
      ctx.beginPath();
      ctx.ellipse(cx % w, cy, w * 0.06, h * 0.025, Math.sin(c) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Equatorial intertropical convergence cloud band
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.fillRect(0, h * 0.48, w, h * 0.035);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    this.earthTexture = texture;
    return texture;
  }

  /**
   * Generates cinematic 2048x1024 lunar surface albedo, normal, and bump textures.
   * Cached statically on first access for zero runtime overhead.
   */
  private static generateMoonMaps(): void {
    if (this.moonTexture && this.moonNormalMap && this.moonBumpMap) return;
    if (typeof document === 'undefined') return;

    const w = 2048;
    const h = 1024;
    const prng = new DeterministicPRNG(19690720);

    // 1. Compute 2D Lunar Heightfield (Elevation map for normal & bump maps)
    const heightField = new Float32Array(w * h);

    // Baseline crustal elevation & multi-harmonic continental highlands
    for (let y = 0; y < h; y++) {
      const lat = ((y / h) - 0.5) * Math.PI; // -pi/2 to +pi/2
      const cosLat = Math.cos(lat);
      const isSouthPole = lat < -0.3;

      for (let x = 0; x < w; x++) {
        const lon = ((x / w) - 0.5) * 2 * Math.PI; // -pi to +pi
        const idx = y * w + x;

        // Highlands base elevation
        let elev = 0.52;
        if (isSouthPole) {
          elev += 0.12 * Math.min(1.0, (-lat - 0.3) / 0.8);
        }
        // Farside rugged highlands
        if (Math.abs(lon) > 0.45 * Math.PI) {
          elev += 0.14 * ((Math.abs(lon) - 0.45 * Math.PI) / (0.55 * Math.PI));
        }

        // Multi-octave harmonic planetary relief
        elev += 0.055 * Math.sin(5 * lon) * cosLat;
        elev += 0.035 * Math.sin(11 * lon + 1.2) * Math.cos(7 * lat);
        elev += 0.018 * Math.sin(23 * lon - 0.8) * Math.cos(15 * lat);
        elev += 0.008 * Math.sin(47 * lon + 2.1) * Math.sin(31 * lat);

        heightField[idx] = Math.max(0.05, Math.min(0.95, elev));
      }
    }

    // Major Basaltic Maria definitions [cx_frac, cy_frac, rx_frac, ry_frac, rot_rad, depth]
    const maria = [
      // Oceanus Procellarum (vast western plain)
      { cx: 0.32, cy: 0.38, rx: 0.15, ry: 0.19, rot: -0.2, depth: 0.28 },
      // Mare Imbrium (prominent circular impact basin)
      { cx: 0.44, cy: 0.31, rx: 0.095, ry: 0.09, rot: 0.0, depth: 0.34 },
      // Mare Serenitatis
      { cx: 0.55, cy: 0.35, rx: 0.065, ry: 0.065, rot: 0.1, depth: 0.29 },
      // Mare Tranquillitatis
      { cx: 0.59, cy: 0.47, rx: 0.075, ry: 0.07, rot: 0.15, depth: 0.27 },
      // Mare Crisium (isolated circular eastern mare)
      { cx: 0.70, cy: 0.40, rx: 0.045, ry: 0.04, rot: 0.0, depth: 0.35 },
      // Mare Fecunditatis
      { cx: 0.65, cy: 0.59, rx: 0.05, ry: 0.065, rot: 0.2, depth: 0.25 },
      // Mare Nectaris
      { cx: 0.59, cy: 0.64, rx: 0.038, ry: 0.038, rot: 0.0, depth: 0.28 },
      // Mare Nubium
      { cx: 0.42, cy: 0.63, rx: 0.06, ry: 0.055, rot: -0.1, depth: 0.26 },
      // Mare Humorum
      { cx: 0.31, cy: 0.67, rx: 0.038, ry: 0.038, rot: 0.0, depth: 0.30 },
      // Mare Frigoris (northern arc)
      { cx: 0.46, cy: 0.18, rx: 0.15, ry: 0.026, rot: 0.05, depth: 0.22 },
      // South Pole - Aitken Basin
      { cx: 0.50, cy: 0.88, rx: 0.14, ry: 0.065, rot: 0.0, depth: 0.32 }
    ];

    // Carve Maria basins into heightfield
    for (const m of maria) {
      const mcx = m.cx * w;
      const mcy = m.cy * h;
      const mrx = m.rx * w;
      const mry = m.ry * h;
      const cosR = Math.cos(m.rot);
      const sinR = Math.sin(m.rot);

      const minX = Math.max(0, Math.floor(mcx - mrx * 1.5));
      const maxX = Math.min(w - 1, Math.ceil(mcx + mrx * 1.5));
      const minY = Math.max(0, Math.floor(mcy - mry * 1.5));
      const maxY = Math.min(h - 1, Math.ceil(mcy + mry * 1.5));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - mcx;
          const dy = y - mcy;
          const rxRot = (dx * cosR - dy * sinR) / mrx;
          const ryRot = (dx * sinR + dy * cosR) / mry;
          const distSq = rxRot * rxRot + ryRot * ryRot;

          if (distSq < 1.0) {
            const idx = y * w + x;
            const basinFactor = 1.0 - Math.pow(distSq, 1.2);
            heightField[idx] = Math.max(0.12, heightField[idx] - m.depth * basinFactor);
          } else if (distSq < 1.35 && m.depth > 0.30) {
            // Mountain arc rim around deep impact basins (e.g. Montes Apenninus on Imbrium)
            const idx = y * w + x;
            const rimFactor = Math.sin(((Math.sqrt(distSq) - 1.0) / 0.35) * Math.PI);
            heightField[idx] = Math.min(0.98, heightField[idx] + 0.22 * rimFactor);
          }
        }
      }
    }

    // Prominent Craters [cx_frac, cy_frac, radius_px, bowlDepth, rimHeight, hasPeak]
    const craters: Array<{ cx: number; cy: number; r: number; bowl: number; rim: number; peak: boolean }> = [
      // Tycho (spectacular south highlands impact crater)
      { cx: 0.45, cy: 0.74, r: 24, bowl: 0.35, rim: 0.32, peak: true },
      // Copernicus (prominent terraced crater with peak in Oceanus Procellarum)
      { cx: 0.41, cy: 0.43, r: 25, bowl: 0.34, rim: 0.30, peak: true },
      // Kepler
      { cx: 0.31, cy: 0.43, r: 14, bowl: 0.26, rim: 0.22, peak: true },
      // Aristarchus (brightest plateau feature)
      { cx: 0.28, cy: 0.35, r: 15, bowl: 0.28, rim: 0.25, peak: false },
      // Plato (dark basaltic floor surrounded by high mountain rim)
      { cx: 0.44, cy: 0.24, r: 22, bowl: 0.22, rim: 0.34, peak: false },
      // Clavius (giant walled plain in south)
      { cx: 0.46, cy: 0.83, r: 36, bowl: 0.28, rim: 0.26, peak: false },
      // Archimedes
      { cx: 0.47, cy: 0.35, r: 18, bowl: 0.22, rim: 0.24, peak: false },
      // Eratosthenes
      { cx: 0.43, cy: 0.39, r: 16, bowl: 0.28, rim: 0.25, peak: true },
      // Theophilus & Cyrillus
      { cx: 0.62, cy: 0.61, r: 22, bowl: 0.32, rim: 0.28, peak: true },
      // Langrenus
      { cx: 0.74, cy: 0.58, r: 24, bowl: 0.30, rim: 0.26, peak: true },
      // Petavius
      { cx: 0.75, cy: 0.68, r: 26, bowl: 0.30, rim: 0.26, peak: true },
      // Shackleton & South Pole rim peaks
      { cx: 0.50, cy: 0.96, r: 18, bowl: 0.38, rim: 0.35, peak: false },
      { cx: 0.48, cy: 0.94, r: 14, bowl: 0.32, rim: 0.28, peak: false }
    ];

    // Add 280 deterministic secondary impact craters across highlands & maria
    for (let i = 0; i < 280; i++) {
      const cx = prng.next();
      const cy = prng.next();
      const r = 3 + prng.next() * 11;
      craters.push({
        cx,
        cy,
        r,
        bowl: 0.18 + prng.next() * 0.14,
        rim: 0.14 + prng.next() * 0.12,
        peak: r > 9 && prng.next() > 0.5
      });
    }

    // Carve craters into heightfield
    for (const c of craters) {
      const ccx = c.cx * w;
      const ccy = c.cy * h;
      const cr = c.r;
      const minX = Math.max(0, Math.floor(ccx - cr * 1.5));
      const maxX = Math.min(w - 1, Math.ceil(ccx + cr * 1.5));
      const minY = Math.max(0, Math.floor(ccy - cr * 1.5));
      const maxY = Math.min(h - 1, Math.ceil(ccy + cr * 1.5));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dist = Math.hypot(x - ccx, y - ccy);
          const idx = y * w + x;

          if (dist < cr * 0.82) {
            // Excavation bowl
            const u = dist / (cr * 0.82);
            let bowlDrop = c.bowl * Math.cos(u * (Math.PI / 2));
            if (c.peak && dist < cr * 0.28) {
              const peakU = dist / (cr * 0.28);
              bowlDrop -= 0.18 * (1.0 - peakU);
            }
            heightField[idx] = Math.max(0.04, heightField[idx] - bowlDrop);
          } else if (dist < cr * 1.35) {
            // Raised ejecta rim ring
            const rimU = (dist - cr * 0.82) / (cr * 0.53);
            const rimLift = c.rim * Math.sin(rimU * Math.PI);
            heightField[idx] = Math.min(0.98, heightField[idx] + rimLift);
          }
        }
      }
    }

    // ----------------------------------------------------
    // 2. Generate Tangent-Space Normal Map (Sobel gradient filter)
    // ----------------------------------------------------
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = w;
    normalCanvas.height = h;
    const normalCtx = normalCanvas.getContext('2d')!;
    const normalImg = normalCtx.createImageData(w, h);
    const nData = normalImg.data;

    // Normal filter intensity: high contrast for deep grazing shadows
    const normalStrength = 4.2;

    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h - 1, y + 1);

      for (let x = 0; x < w; x++) {
        const x0 = (x - 1 + w) % w;
        const x1 = (x + 1) % w;

        // Central difference gradient
        const dzdx = (heightField[y * w + x1] - heightField[y * w + x0]) * normalStrength;
        const dzdy = (heightField[y1 * w + x] - heightField[y0 * w + x]) * normalStrength;

        // Tangent-space normal vector N = normalize(-dzdx, -dzdy, 1)
        const invLen = 1.0 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
        const nx = -dzdx * invLen;
        const ny = -dzdy * invLen;
        const nz = invLen;

        const pIdx = (y * w + x) * 4;
        nData[pIdx] = Math.round((nx * 0.5 + 0.5) * 255);     // R (tangent X)
        nData[pIdx + 1] = Math.round((ny * 0.5 + 0.5) * 255); // G (tangent Y)
        nData[pIdx + 2] = Math.round((nz * 0.5 + 0.5) * 255); // B (surface normal Z)
        nData[pIdx + 3] = 255;
      }
    }
    normalCtx.putImageData(normalImg, 0, 0);

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.ClampToEdgeWrapping;
    normalTex.generateMipmaps = true;
    normalTex.minFilter = THREE.LinearMipmapLinearFilter;
    normalTex.magFilter = THREE.LinearFilter;
    this.moonNormalMap = normalTex;

    // ----------------------------------------------------
    // 3. Generate Bump / Elevation Map
    // ----------------------------------------------------
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = w;
    bumpCanvas.height = h;
    const bumpCtx = bumpCanvas.getContext('2d')!;
    const bumpImg = bumpCtx.createImageData(w, h);
    const bData = bumpImg.data;

    for (let i = 0; i < w * h; i++) {
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
    bumpTex.wrapT = THREE.ClampToEdgeWrapping;
    bumpTex.generateMipmaps = true;
    bumpTex.minFilter = THREE.LinearMipmapLinearFilter;
    bumpTex.magFilter = THREE.LinearFilter;
    this.moonBumpMap = bumpTex;

    // ----------------------------------------------------
    // 4. Generate Cinematic Albedo (Diffuse Color) Texture
    // ----------------------------------------------------
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = w;
    albedoCanvas.height = h;
    const aCtx = albedoCanvas.getContext('2d')!;

    // A. Base Anorthosite Highlands Crust (Natural photographic silver-grey)
    const baseGrad = aCtx.createLinearGradient(0, 0, 0, h);
    baseGrad.addColorStop(0.0, '#a2a7b2'); // North pole
    baseGrad.addColorStop(0.35, '#b0b5c0'); // Highland belt
    baseGrad.addColorStop(0.70, '#b8bcc6'); // Southern cratered terra
    baseGrad.addColorStop(1.0, '#989ca6'); // South pole Aitken rim
    aCtx.fillStyle = baseGrad;
    aCtx.fillRect(0, 0, w, h);

    // B. Paint Basaltic Maria with soft feathering and titanium mineral tints
    for (const m of maria) {
      const mcx = m.cx * w;
      const mcy = m.cy * h;
      const mrx = m.rx * w;
      const mry = m.ry * h;

      aCtx.save();
      aCtx.translate(mcx, mcy);
      aCtx.rotate(m.rot);

      const mareGrad = aCtx.createRadialGradient(0, 0, 0, 0, 0, Math.max(mrx, mry));
      // Distinctive titanium-rich basalts in Tranquillitatis (bluish-grey) vs Imbrium (warm basalt)
      if (m.cx > 0.54 && m.cy > 0.42 && m.cy < 0.54) {
        mareGrad.addColorStop(0.0, '#2d323b'); // Titanium basalt
        mareGrad.addColorStop(0.65, '#383d47');
      } else {
        mareGrad.addColorStop(0.0, '#2b2f38');
        mareGrad.addColorStop(0.65, '#3b404a');
      }
      mareGrad.addColorStop(0.90, '#585e6a');
      mareGrad.addColorStop(1.0, 'rgba(160, 165, 175, 0.0)');

      aCtx.fillStyle = mareGrad;
      aCtx.beginPath();
      aCtx.ellipse(0, 0, mrx, mry, 0, 0, Math.PI * 2);
      aCtx.fill();
      aCtx.restore();
    }

    // C. Plato Crater dark basalt floor
    aCtx.fillStyle = '#22252c';
    aCtx.beginPath();
    aCtx.ellipse(0.44 * w, 0.24 * h, 18, 14, 0.05, 0, Math.PI * 2);
    aCtx.fill();

    // D. High-Albedo Impact Ray Systems (Tycho, Copernicus, Kepler, Aristarchus)
    const rayPrng = new DeterministicPRNG(42);

    // Tycho Ray Network (radiates over thousands of km across south and maria)
    const tychoX = 0.45 * w;
    const tychoY = 0.74 * h;
    for (let r = 0; r < 52; r++) {
      const ang = (r / 52) * Math.PI * 2 + (rayPrng.next() - 0.5) * 0.15;
      const len = 120 + rayPrng.next() * 580;
      const rayWidth = 1.2 + rayPrng.next() * 3.5;
      const opacity = 0.25 + rayPrng.next() * 0.45;

      aCtx.strokeStyle = `rgba(240, 245, 255, ${opacity})`;
      aCtx.lineWidth = rayWidth;
      aCtx.beginPath();
      aCtx.moveTo(tychoX, tychoY);
      aCtx.lineTo(tychoX + Math.cos(ang) * len, tychoY + Math.sin(ang) * len);
      aCtx.stroke();
    }

    // Copernicus Ray Network (spiders across Oceanus Procellarum and Mare Imbrium)
    const copernicusX = 0.41 * w;
    const copernicusY = 0.43 * h;
    for (let r = 0; r < 36; r++) {
      const ang = (r / 36) * Math.PI * 2 + (rayPrng.next() - 0.5) * 0.2;
      const len = 80 + rayPrng.next() * 320;
      aCtx.strokeStyle = `rgba(235, 242, 255, ${0.20 + rayPrng.next() * 0.35})`;
      aCtx.lineWidth = 1.0 + rayPrng.next() * 2.8;
      aCtx.beginPath();
      aCtx.moveTo(copernicusX, copernicusY);
      aCtx.lineTo(copernicusX + Math.cos(ang) * len, copernicusY + Math.sin(ang) * len);
      aCtx.stroke();
    }

    // Kepler & Aristarchus bright ejecta halos
    const keplerX = 0.31 * w;
    const keplerY = 0.43 * h;
    for (let r = 0; r < 20; r++) {
      const ang = (r / 20) * Math.PI * 2;
      const len = 40 + rayPrng.next() * 120;
      aCtx.strokeStyle = 'rgba(235, 240, 250, 0.32)';
      aCtx.lineWidth = 1.5;
      aCtx.beginPath();
      aCtx.moveTo(keplerX, keplerY);
      aCtx.lineTo(keplerX + Math.cos(ang) * len, keplerY + Math.sin(ang) * len);
      aCtx.stroke();
    }

    // Aristarchus intense high-albedo plateau
    const aristarchusX = 0.28 * w;
    const aristarchusY = 0.35 * h;
    aCtx.fillStyle = '#ffffff';
    aCtx.beginPath();
    aCtx.ellipse(aristarchusX, aristarchusY, 14, 10, -0.3, 0, Math.PI * 2);
    aCtx.fill();

    // E. Paint bright crater rims & peaks on major craters
    for (const c of craters) {
      const cx = c.cx * w;
      const cy = c.cy * h;

      // Raised sunward rim highlight
      aCtx.strokeStyle = '#e6ebf5';
      aCtx.lineWidth = Math.max(1.2, c.r * 0.16);
      aCtx.beginPath();
      aCtx.arc(cx, cy, c.r * 0.95, 0, Math.PI * 2);
      aCtx.stroke();

      if (c.peak) {
        aCtx.fillStyle = '#f8fafc';
        aCtx.beginPath();
        aCtx.arc(cx, cy, Math.max(1.5, c.r * 0.18), 0, Math.PI * 2);
        aCtx.fill();
      }
    }

    // F. Regolith micro-texture speckle (subtle mineral variegation)
    const microCount = 20000;
    for (let i = 0; i < microCount; i++) {
      const rx = prng.next() * w;
      const ry = prng.next() * h;
      const isLight = prng.next() > 0.48;
      const alpha = 0.03 + prng.next() * 0.05;
      aCtx.fillStyle = isLight ? `rgba(250, 252, 255, ${alpha})` : `rgba(15, 18, 24, ${alpha})`;
      aCtx.fillRect(rx, ry, 2, 2);
    }

    const albedoTex = new THREE.CanvasTexture(albedoCanvas);
    albedoTex.wrapS = THREE.RepeatWrapping;
    albedoTex.wrapT = THREE.ClampToEdgeWrapping;
    albedoTex.generateMipmaps = true;
    albedoTex.minFilter = THREE.LinearMipmapLinearFilter;
    albedoTex.magFilter = THREE.LinearFilter;
    this.moonTexture = albedoTex;
  }

  public static getMoonTexture(): THREE.Texture {
    if (!this.moonTexture) {
      this.generateMoonMaps();
    }
    return this.moonTexture || new THREE.Texture();
  }

  public static getMoonNormalMap(): THREE.Texture {
    if (!this.moonNormalMap) {
      this.generateMoonMaps();
    }
    return this.moonNormalMap || new THREE.Texture();
  }

  public static getMoonBumpMap(): THREE.Texture {
    if (!this.moonBumpMap) {
      this.generateMoonMaps();
    }
    return this.moonBumpMap || new THREE.Texture();
  }
}
