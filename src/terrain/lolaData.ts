import { LandingSite } from '../types';

/** Invented analytic horizon profiles for demonstration. No measured elevation data. */
function generateSyntheticProfile(
  features: Array<{ az: number; width: number; height: number; roughness?: number }>,
  baseHeight: number = 0.5,
  noiseScale: number = 0.15,
  seed: number = 42
): number[] {
  // Deterministic PRNG
  let s = seed;
  const rnd = () => {
    s = (s * 16807 + 12345) % 2147483647;
    return (s / 2147483647);
  };

  const profile: number[] = new Array(360);
  for (let a = 0; a < 360; a++) {
    let elev = baseHeight;

    // Harmonic background rolling topography
    elev += 0.25 * Math.sin((a * Math.PI) / 180 * 2 + seed);
    elev += 0.15 * Math.cos((a * Math.PI) / 180 * 5 + seed * 1.5);

    // Discrete topographic features (massifs, crater rims, ridges)
    for (const f of features) {
      let d = Math.abs(a - f.az);
      if (d > 180) d = 360 - d;
      const sigma = f.width / 2.355; // FWHM to Gaussian sigma
      const g = Math.exp(-(d * d) / (2 * sigma * sigma));
      elev += f.height * g;
    }

    // High frequency surface roughness / boulder field jitter
    const noise = (rnd() - 0.5) * noiseScale;
    profile[a] = Math.max(0, Math.round((elev + noise) * 100) / 100);
  }
  return profile;
}

export const CURATED_SITES: LandingSite[] = [
  {
    id: 'shackleton-connecting-ridge',
    name: 'Shackleton Connecting Ridge',
    category: 'Artemis & CLPS',
    lat: -89.78,
    lon: 129.2,
    elevationKm: 1.35,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 120, width: 25, height: 4.8 }, // Connecting ridge peak
      { az: 180, width: 45, height: 6.2 }, // South polar rim crest
      { az: 285, width: 35, height: 3.9 }, // de Gerlache outer flank
      { az: 30, width: 20, height: 2.1 }   // Slump terrace
    ], 1.2, 0.25, 101)
  },
  {
    id: 'mons-mouton',
    name: 'Mons Mouton Plateau',
    category: 'Artemis & CLPS',
    lat: -85.42,
    lon: 28.58,
    elevationKm: 5.85,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 45, width: 30, height: 1.8 },
      { az: 160, width: 40, height: 2.4 },
      { az: 260, width: 35, height: 1.5 },
      { az: 330, width: 20, height: 1.1 }
    ], 0.7, 0.12, 202)
  },
  {
    id: 'malapert-massif',
    name: 'Malapert Massif Peak',
    category: 'South Pole Peaks',
    lat: -85.99,
    lon: 2.91,
    elevationKm: 5.02,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 10, width: 25, height: 2.8 },
      { az: 110, width: 35, height: 1.9 },
      { az: 220, width: 40, height: 3.1 },
      { az: 310, width: 30, height: 2.2 }
    ], 0.9, 0.15, 303)
  },
  {
    id: 'nobile-rim-1',
    name: 'Nobile Crater Rim',
    category: 'Artemis & CLPS',
    lat: -85.24,
    lon: 35.81,
    elevationKm: 2.10,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 70, width: 40, height: 4.1 },
      { az: 195, width: 50, height: 5.3 },
      { az: 300, width: 35, height: 3.2 }
    ], 1.4, 0.2, 404)
  },
  {
    id: 'haworth-rim',
    name: 'Haworth Crater Rim',
    category: 'South Pole Peaks',
    lat: -87.41,
    lon: -5.12,
    elevationKm: 1.80,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 40, width: 35, height: 4.5 },
      { az: 140, width: 45, height: 6.8 },
      { az: 240, width: 30, height: 5.2 }
    ], 1.8, 0.22, 505)
  },
  {
    id: 'faustini-rim',
    name: 'Faustini Crater Rim',
    category: 'South Pole Peaks',
    lat: -87.12,
    lon: 76.98,
    elevationKm: 1.95,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 85, width: 40, height: 5.1 },
      { az: 175, width: 35, height: 4.2 },
      { az: 290, width: 50, height: 6.4 }
    ], 1.6, 0.2, 606)
  },
  {
    id: 'de-gerlache-rim',
    name: 'de Gerlache Crater Rim',
    category: 'South Pole Peaks',
    lat: -88.48,
    lon: -88.34,
    elevationKm: 1.40,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 60, width: 45, height: 5.8 },
      { az: 150, width: 30, height: 4.1 },
      { az: 270, width: 40, height: 6.5 }
    ], 2.0, 0.25, 707)
  },
  {
    id: 'amundsen-rim',
    name: 'Amundsen Crater Terraces',
    category: 'South Pole Peaks',
    lat: -84.44,
    lon: 85.62,
    elevationKm: 0.85,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 30, width: 30, height: 2.9 },
      { az: 135, width: 40, height: 4.8 },
      { az: 230, width: 45, height: 3.7 },
      { az: 320, width: 25, height: 2.1 }
    ], 1.1, 0.18, 808)
  },
  {
    id: 'chandrayaan-3',
    name: 'Chandrayaan-3 (Shiv Shakti Point)',
    category: 'International',
    lat: -69.37,
    lon: 32.35,
    elevationKm: -1.20,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 45, width: 35, height: 2.1 },
      { az: 140, width: 40, height: 2.8 },
      { az: 235, width: 30, height: 1.9 },
      { az: 315, width: 25, height: 1.4 }
    ], 0.8, 0.1, 909)
  },
  {
    id: 'change-4',
    name: 'Chang\'e-4 (Von Kármán Crater)',
    category: 'International',
    lat: -45.44,
    lon: 177.60,
    elevationKm: -5.90,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 20, width: 50, height: 3.5 },
      { az: 110, width: 45, height: 4.2 },
      { az: 200, width: 60, height: 4.8 },
      { az: 290, width: 40, height: 3.1 }
    ], 1.5, 0.15, 1010)
  },
  {
    id: 'change-6',
    name: 'Chang\'e-6 (Apollo Basin)',
    category: 'International',
    lat: -41.64,
    lon: -153.99,
    elevationKm: -4.30,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 50, width: 45, height: 3.2 },
      { az: 150, width: 50, height: 4.6 },
      { az: 260, width: 40, height: 3.8 }
    ], 1.3, 0.15, 1111)
  },
  {
    id: 'slim',
    name: 'SLIM (Shioli Crater)',
    category: 'International',
    lat: -13.31,
    lon: 25.24,
    elevationKm: -0.80,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 80, width: 30, height: 3.8 },
      { az: 180, width: 60, height: 5.2 }, // Slope of crater rampart
      { az: 270, width: 25, height: 1.5 }
    ], 0.9, 0.15, 1212)
  },
  {
    id: 'apollo-11',
    name: 'Apollo 11 (Mare Tranquillitatis)',
    category: 'Historic',
    lat: 0.67,
    lon: 23.47,
    elevationKm: -1.40,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 110, width: 40, height: 0.9 },
      { az: 240, width: 50, height: 0.7 }
    ], 0.35, 0.08, 1313)
  },
  {
    id: 'apollo-17',
    name: 'Apollo 17 (Taurus-Littrow Valley)',
    category: 'Historic',
    lat: 20.19,
    lon: 30.77,
    elevationKm: -2.10,
    description: 'An example lunar location for exploring sunlight and Earth visibility. Check current mission status.',
    lightingConditions: 'Computed for the selected date using approximate terrain.',
    communicationConditions: 'Computed Earth visibility; a clear view does not guarantee a radio link.',
    scienceTarget: '',
    horizonProfile: generateSyntheticProfile([
      { az: 340, width: 45, height: 14.5 }, // North Massif (1.6 km high, 14.5° elevation)
      { az: 190, width: 50, height: 19.8 }, // South Massif (2.3 km high, 19.8° elevation)
      { az: 65, width: 35, height: 8.2 },   // Sculptured Hills
      { az: 130, width: 30, height: 6.5 }   // East Massif
    ], 1.0, 0.2, 1414)
  }
].map(site => ({ ...site, isApproximateTerrain: true, terrainSource: 'approximate' } as LandingSite));
