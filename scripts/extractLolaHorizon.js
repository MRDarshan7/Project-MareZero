#!/usr/bin/env node
/** Synthetic terrain demonstration only. This script reads no measured elevation data.
 * The historical filename is retained for compatibility; it is not a DEM extractor.
 * Usage: node scripts/extractLolaHorizon.js --lat=-89.78 --lon=129.2 --out=synthetic-horizon.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const R_MOON_KM = 1737.4;

function parseArgs() {
  const args = {
    lat: -89.78,
    lon: 129.2,
    elevationKm: 1.35,
    mastHeightM: 2.0,
    maxDistanceKm: 60.0,
    stepDistanceKm: 0.12, // Synthetic sampling interval in km
    out: path.join(__dirname, 'extracted_horizon.json')
  };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--lat=')) args.lat = parseFloat(arg.split('=')[1]);
    if (arg.startsWith('--lon=')) args.lon = parseFloat(arg.split('=')[1]);
    if (arg.startsWith('--elev=')) args.elevationKm = parseFloat(arg.split('=')[1]);
    if (arg.startsWith('--out=')) args.out = arg.split('=')[1];
  }
  return args;
}

/** Invented analytic elevation function, not a raster reader. */
function querySyntheticElevation(lat, lon) {
  // Distance from South Pole in km
  const polarDistKm = (90 + lat) * (Math.PI / 180) * R_MOON_KM;
  const radLon = (lon * Math.PI) / 180;
  const x = polarDistKm * Math.cos(radLon);
  const y = polarDistKm * Math.sin(radLon);

  // Shackleton crater rim crest (R ~ 10.5 km centered near 89.9°S, 0°E)
  const dShackleton = Math.hypot(x - 0.5, y + 2.0);
  let rimElev = 0;
  if (dShackleton > 8.0 && dShackleton < 13.0) {
    rimElev += 3.8 * Math.exp(-Math.pow((dShackleton - 10.5) / 1.5, 2));
  }

  // de Gerlache crater rim (R ~ 16 km centered at 88.5°S, -88°E)
  const dDeGerlache = Math.hypot(x + 22.0, y - 5.0);
  if (dDeGerlache > 13.0 && dDeGerlache < 20.0) {
    rimElev += 3.2 * Math.exp(-Math.pow((dDeGerlache - 16.5) / 2.5, 2));
  }

  // Background polar plateau topography
  const regionalSlope = 0.015 * x - 0.008 * y;
  return 1.35 + rimElev + regionalSlope;
}

function computeRaycastHorizon(config) {
  console.log(`Generating an approximate terrain profile (synthetic):`);
  console.log(`Observer coordinates: lat=${config.lat.toFixed(4)}°, lon=${config.lon.toFixed(4)}°, elev=${config.elevationKm} km`);
  console.log(`Max raycast distance: ${config.maxDistanceKm} km at step ${config.stepDistanceKm * 1000} m`);

  const observerAltKm = config.elevationKm + config.mastHeightM / 1000.0;
  const profile = new Array(360);

  for (let azDeg = 0; azDeg < 360; azDeg++) {
    const azRad = (azDeg * Math.PI) / 180.0;
    let maxAlphaDeg = 0.0;

    for (let r = config.stepDistanceKm; r <= config.maxDistanceKm; r += config.stepDistanceKm) {
      // Calculate target lat/lon on spherical Moon
      const deltaLatDeg = (r * Math.cos(azRad) / R_MOON_KM) * (180.0 / Math.PI);
      const deltaLonDeg = (r * Math.sin(azRad) / (R_MOON_KM * Math.cos(config.lat * Math.PI / 180))) * (180.0 / Math.PI);

      const targetLat = config.lat + deltaLatDeg;
      const targetLon = config.lon + deltaLonDeg;

      // Sample terrain elevation
      const terrainHeightKm = querySyntheticElevation(targetLat, targetLon);

      // Curvature drop: drop = r^2 / (2 * R_Moon)
      const curvatureDropKm = (r * r) / (2.0 * R_MOON_KM);
      const apparentHeightKm = terrainHeightKm - observerAltKm - curvatureDropKm;

      // Elevation angle
      const alphaRad = Math.atan2(apparentHeightKm, r);
      const alphaDeg = (alphaRad * 180.0) / Math.PI;

      if (alphaDeg > maxAlphaDeg) {
        maxAlphaDeg = alphaDeg;
      }
    }

    profile[azDeg] = Math.round(maxAlphaDeg * 100) / 100;
  }

  return profile;
}

function main() {
  console.warn('Warning: synthetic demonstration only. No real terrain data is read.');
  const config = parseArgs();
  const profile = computeRaycastHorizon(config);

  const outDir = path.dirname(config.out);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const exportPayload = {
    metadata: {
      generator: 'Synthetic horizon demonstration v1',
      sourceDataset: 'Invented analytic terrain; no measured dataset',
      latitude: config.lat,
      longitude: config.lon,
      elevationKm: config.elevationKm,
      rays: 360,
      angularStepDeg: 1.0,
      timestamp: new Date().toISOString()
    },
    horizonProfile: profile
  };

  fs.writeFileSync(config.out, JSON.stringify(exportPayload, null, 2), 'utf8');
  console.log(`Successfully extracted 360-degree horizon profile to: ${config.out}`);
  console.log(`Peak horizon obstacle: ${Math.max(...profile)}° at azimuth ${profile.indexOf(Math.max(...profile))}°`);
  console.log(`Open horizon minimum: ${Math.min(...profile)}° at azimuth ${profile.indexOf(Math.min(...profile))}°`);
}

main();
