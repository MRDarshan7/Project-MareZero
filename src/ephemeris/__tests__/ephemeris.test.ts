import { describe, it, expect } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { EphemerisEngine } from '../engine';
import { HORIZONS_BENCHMARKS } from '../horizonsValidation';
import { HorizonManager } from '../../terrain/horizon';
import { CURATED_SITES } from '../../terrain/lolaData';
import { LandingSite } from '../../types';

const angularDifference = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const DATES_2026 = Array.from({ length: 12 }, (_, month) => new Date(Date.UTC(2026, month, 15, 12)));
const testSite: LandingSite = {
  id: 'test-site', name: 'Test site', category: 'Custom', lat: 0, lon: 0, elevationKm: 0,
  description: '', lightingConditions: '', communicationConditions: '', scienceTarget: ''
};

describe('Ephemeris Engine Validation against NASA JPL Horizons', () => {
  it.each(HORIZONS_BENCHMARKS)('matches $siteName at $epochIso within 0.1 degrees', b => {
    const site = { ...testSite, lat: b.lat, lon: b.lon, elevationKm: b.elevationKm };
    const res = EphemerisEngine.calculatePosition(site, new Date(b.epochIso));
    for (const [actual, expected] of [[res.sun, b.expectedSun], [res.earth, b.expectedEarth]] as const) {
      expect(expected.toleranceDeg).toBeLessThanOrEqual(0.1);
      expect(angularDifference(actual.az, expected.az)).toBeLessThanOrEqual(expected.toleranceDeg);
      expect(Math.abs(actual.el - expected.el)).toBeLessThanOrEqual(expected.toleranceDeg);
    }
  });


  it('should correctly flag Chang\'e-4 farside as having Earth occulted', () => {
    const change4 = CURATED_SITES.find(s => s.id === 'change-4')!;
    const date = new Date('2026-07-03T12:00:00Z');
    const pos = EphemerisEngine.calculatePosition(change4, date);

    expect(pos.earth.el).toBeLessThan(-30);
    expect(pos.earth.isBlocked).toBe(true);
  });
});

describe('Lunar frame and multi-date physical checks', () => {
  it.each(DATES_2026)('matches the Libration sub-Earth self-check within 0.05 degrees on %s', date => {
    const pos = EphemerisEngine.calculatePosition(testSite, date);
    // Libration is used only as a self-check; engine positions come from rotated vectors.
    const lib = Astronomy.Libration(date);
    expect(Math.abs(pos.libration.earthSubLat - lib.elat)).toBeLessThanOrEqual(0.05);
    expect(angularDifference(pos.libration.earthSubLon, lib.elon)).toBeLessThanOrEqual(0.05);
  });

  it.each(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'])(
    'aligns Sun and Earth at full moon and opposes them at new moon after %s', start => {
      for (const phase of [180, 0]) {
        const event = Astronomy.SearchMoonPhase(phase, new Date(`${start}T00:00:00Z`), 35);
        expect(event).not.toBeNull();
        const pos = EphemerisEngine.calculatePosition(testSite, event!.date);
        const separation = angularDifference(pos.subSolar.lon, pos.libration.earthSubLon);
        // Phase sanity bounds from the plan allow latitude/orbital geometry at conjunction.
        expect(Math.abs(separation - (phase === 180 ? 0 : 180))).toBeLessThanOrEqual(phase === 180 ? 5 : 10);
      }
    }
  );

  it.each(DATES_2026)('satisfies south-pole elevation and parallax analytics on %s', date => {
    const pos = EphemerisEngine.calculatePosition({ ...testSite, lat: -90 }, date);
    expect(Math.abs(pos.sun.el + pos.subSolar.lat)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(pos.sun.el)).toBeLessThanOrEqual(1.6);
    expect(Math.abs(pos.earth.el - (-pos.libration.earthSubLat - 0.26))).toBeLessThanOrEqual(0.3);
  });

  it('places the Sun about 10.7 degrees above the horizon at Apollo 11 touchdown', () => {
    const pos = EphemerisEngine.calculatePosition(
      { ...testSite, lat: 0.674, lon: 23.473 }, new Date('1969-07-20T20:17:00Z')
    );
    expect(Math.abs(pos.sun.el - 10.7)).toBeLessThanOrEqual(0.5);
  });

  it.each(DATES_2026)('uses the Moon-to-Sun norm for AU distance on %s', date => {
    const moon = Astronomy.GeoVector(Astronomy.Body.Moon, date, false);
    const sun = Astronomy.GeoVector(Astronomy.Body.Sun, date, false);
    const distance = Math.hypot(sun.x - moon.x, sun.y - moon.y, sun.z - moon.z);
    expect(EphemerisEngine.calculatePosition(testSite, date).sun.distance).toBe(Number(distance.toFixed(4)));
  });

  it.each(DATES_2026)('matches independent spherical topocentric geometry at polar and equatorial sites on %s', date => {
    for (const site of [{ ...testSite, lat: -89.78, lon: 129.2, elevationKm: 1.35 },
                        { ...testSite, lat: 0.674, lon: 23.473, elevationKm: -1.4 }]) {
      const pos = EphemerisEngine.calculatePosition(site, date);
      const moon = Astronomy.GeoVector(Astronomy.Body.Moon, date, false);
      const sun = Astronomy.GeoVector(Astronomy.Body.Sun, date, false);
      const sunDistance = Math.hypot(sun.x - moon.x, sun.y - moon.y, sun.z - moon.z) * Astronomy.KM_PER_AU;
      // Check the local projection independently, using the engine's computed subpoints.
      // Libration's approximate subpoint is checked separately above; mixing frames here
      // amplifies its small angular differences when the Earth is high in the sky.
      // cos(zenith distance) = sin(phi)sin(delta) + cos(phi)cos(delta)cos(delta-lon).
      // Subtract observer radius only from the vertical component to include parallax.
      for (const [body, lat, lon, distance] of [
        [pos.sun, pos.subSolar.lat, pos.subSolar.lon, sunDistance],
        [pos.earth, pos.libration.earthSubLat, pos.libration.earthSubLon,
          Math.hypot(moon.x, moon.y, moon.z) * Astronomy.KM_PER_AU]
      ] as const) {
        const phi = site.lat * Math.PI / 180;
        const delta = lat * Math.PI / 180;
        const hourAngle = (lon - site.lon) * Math.PI / 180;
        const cosZenith = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(hourAngle);
        const horizontal = distance * Math.sqrt(Math.max(0, 1 - cosZenith ** 2));
        const vertical = distance * cosZenith - (1737.4 + site.elevationKm);
        const elevation = Math.atan2(vertical, horizontal) * 180 / Math.PI;
        const azimuth = (Math.atan2(Math.sin(hourAngle),
          Math.cos(phi) * Math.tan(delta) - Math.sin(phi) * Math.cos(hourAngle)) * 180 / Math.PI + 360) % 360;
        expect(Math.abs(body.el - elevation)).toBeLessThanOrEqual(0.05);
        expect(angularDifference(body.az, azimuth)).toBeLessThanOrEqual(0.05);
      }
    }
  });
});

describe('Terrain Horizon & Shadow Blocking Logic', () => {
  it('should correctly determine blockage based on horizon profile', () => {
    // Custom profile: 5° obstacle between azimuth 90° and 110°
    const customProf = new Array(360).fill(1.0);
    for (let az = 90; az <= 110; az++) {
      customProf[az] = 5.0;
    }
    const hm = new HorizonManager(customProf);

    // Below horizon at az 100° (el = 3° < 5°) -> blocked
    expect(hm.isBlocked(100, 3.0)).toBe(true);

    // Above horizon at az 100° (el = 6.5° > 5°) -> clear LOS
    expect(hm.isBlocked(100, 6.5)).toBe(false);

    // Outside obstacle at az 150° (el = 2.0° > 1.0°) -> clear LOS
    expect(hm.isBlocked(150, 2.0)).toBe(false);

    // Below ground at az 150° (el = 0.5° < 1.0°) -> blocked
    expect(hm.isBlocked(150, 0.5)).toBe(true);
  });

  it('should interpolate smooth horizon between integer azimuth degrees', () => {
    const prof = new Array(360).fill(0);
    prof[10] = 2.0;
    prof[11] = 4.0;
    const hm = new HorizonManager(prof);

    expect(hm.getElevationAtAzimuth(10.5)).toBeCloseTo(3.0, 4);
    expect(hm.getElevationAtAzimuth(10.25)).toBeCloseTo(2.5, 4);
  });
});

describe('Site metrics and illustrative sunlight outlook', () => {
  it('computes a bounded sunlight outlook and operational windows', () => {
    // Synthetic flat equator: a full synodic cycle has approximately equal day/night.
    // A polar site's illumination fraction is seasonal and depends on its horizon;
    // the old >20% Shackleton assumption was based on the incorrect Sun position.
    const equator = {
      ...CURATED_SITES.find(s => s.id === 'apollo-11')!,
      id: 'metrics-flat-equator', lat: 0, lon: 0, elevationKm: 0,
      horizonProfile: new Array(360).fill(0)
    };
    const date = new Date('2026-07-03T12:00:00Z');
    const metrics = EphemerisEngine.computeSiteMetrics(equator, date);

    expect(metrics.powerScore).toBeGreaterThanOrEqual(0);
    expect(metrics.powerScore).toBeLessThanOrEqual(100);
    expect(metrics.illuminationFraction).toBeGreaterThan(0.2);
    expect(Math.abs(metrics.illuminationFraction - 0.5)).toBeLessThanOrEqual(0.02);
    expect(metrics.windows.length).toBeGreaterThan(0);
    expect(typeof metrics.powerExplanation).toBe('string');
  });
});
