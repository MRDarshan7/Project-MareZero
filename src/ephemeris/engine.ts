import * as Astronomy from 'astronomy-engine';
import {
  LandingSite,
  CelestialBodyPos,
  EphemerisSample,
  SiteMetrics,
  OperationalWindow,
  CountdownEvents,
  SolarArrayArchitecture,
  LaunchSlipScenario
} from '../types';
import { HorizonManager } from '../terrain/horizon';
import { frameCoordinates, toMoonFixed } from './moonFrame';
import { findVisibilityChange, bisectVisibility } from './events';
import { VisibilityEvent } from '../types';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const MOON_MEAN_RADIUS_KM = 1737.4;
export const SYNODIC_MONTH_DAYS = 29.530588853;
export const SYNODIC_MONTH_HOURS = SYNODIC_MONTH_DAYS * 24;

/**
 * High-performance LRU Cache for ephemeris simulation memoization.
 */
class EphemerisLRU<K, V> {
  private capacity: number;
  private cache: Map<K, V>;

  constructor(capacity: number = 256) {
    this.capacity = capacity;
    this.cache = new Map<K, V>();
  }

  public get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key)!;
    // Refresh MRU position in map insertion order
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  public set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  public clear(): void {
    this.cache.clear();
  }
}

// Cache keys include exact epochs, site geometry and terrain.
const synodicCycleCache = new EphemerisLRU<string, EphemerisSample[]>(128);
const siteMetricsCache = new EphemerisLRU<string, SiteMetrics>(128);
const countdownEventsCache = new EphemerisLRU<string, CountdownEvents>(128);


export interface TopocentricResult {
  sun: CelestialBodyPos;
  earth: CelestialBodyPos;
  libration: {
    earthSubLat: number;
    earthSubLon: number;
  };
  subSolar: {
    lat: number;
    lon: number;
  };
}

/**
 * High-precision Ephemeris Engine
 * Computes selenographic topocentric coordinates (azimuth, elevation, distance)
 * for Sun and Earth from any lunar landing site at any given epoch.
 */
export class EphemerisEngine {
  /**
   * Compute topocentric coordinates for Sun and Earth at a given date and site
   */
  public static calculatePosition(
    site: LandingSite,
    date: Date,
    horizonManager?: HorizonManager
  ): TopocentricResult {
    const astroTime = Astronomy.MakeTime(date);
    // GeoVector returns J2000 equatorial vectors in AU; disable aberration.
    const moon = Astronomy.GeoVector(Astronomy.Body.Moon, astroTime, false);
    const sun = Astronomy.GeoVector(Astronomy.Body.Sun, astroTime, false);
    const axis = Astronomy.RotationAxis(Astronomy.Body.Moon, astroTime);
    const subEarth = frameCoordinates(toMoonFixed({ x: -moon.x, y: -moon.y, z: -moon.z }, axis));
    const subSolar = frameCoordinates(toMoonFixed({
      x: sun.x - moon.x,
      y: sun.y - moon.y,
      z: sun.z - moon.z
    }, axis));
    // Libration().elat/elon is an independent self-check in the tests, not a position input.

    const phi = site.lat * DEG2RAD;
    const lam = site.lon * DEG2RAD;

    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const cosLam = Math.cos(lam);
    const sinLam = Math.sin(lam);

    // Orthonormal topocentric basis: Zenith (Up), North, East
    const Z = [cosPhi * cosLam, cosPhi * sinLam, sinPhi];
    const N = [-sinPhi * cosLam, -sinPhi * sinLam, cosPhi];
    const E = [-sinLam, cosLam, 0];

    // Observer radius including surface elevation
    const rObserver = MOON_MEAN_RADIUS_KM + (site.elevationKm || 0);

    // Calculate position relative to site
    const calcBody = (
      subLatDeg: number,
      subLonDeg: number,
      distKm: number
    ): { az: number; el: number; dist: number } => {
      const sLat = subLatDeg * DEG2RAD;
      const sLon = subLonDeg * DEG2RAD;

      // Position vector of body from Moon center
      const Sx = distKm * Math.cos(sLat) * Math.cos(sLon);
      const Sy = distKm * Math.cos(sLat) * Math.sin(sLon);
      const Sz = distKm * Math.sin(sLat);

      // Relative vector: observer to celestial body
      const Vx = Sx - rObserver * Z[0];
      const Vy = Sy - rObserver * Z[1];
      const Vz = Sz - rObserver * Z[2];

      const range = Math.hypot(Vx, Vy, Vz);
      const vx = Vx / range;
      const vy = Vy / range;
      const vz = Vz / range;

      // Projection onto local topocentric basis
      const zProj = vx * Z[0] + vy * Z[1] + vz * Z[2];
      const nProj = vx * N[0] + vy * N[1] + vz * N[2];
      const eProj = vx * E[0] + vy * E[1] + vz * E[2];

      const el = Math.asin(Math.max(-1, Math.min(1, zProj))) * RAD2DEG;
      let az = Math.atan2(eProj, nProj) * RAD2DEG;
      if (az < 0) az += 360;

      return { az, el, dist: range };
    };

    const earthRaw = calcBody(subEarth.lat, subEarth.lon, subEarth.distance * Astronomy.KM_PER_AU);
    const sunRaw = calcBody(subSolar.lat, subSolar.lon, subSolar.distance * Astronomy.KM_PER_AU);

    const hm = horizonManager || new HorizonManager(site.horizonProfile);
    const sunHorEl = hm.getElevationAtAzimuth(sunRaw.az);
    const earthHorEl = hm.getElevationAtAzimuth(earthRaw.az);

    const sunBlocked = hm.isBlocked(sunRaw.az, sunRaw.el);
    const earthBlocked = hm.isBlocked(earthRaw.az, earthRaw.el);

    return {
      sun: {
        az: Number(sunRaw.az.toFixed(2)),
        el: Number(sunRaw.el.toFixed(2)),
        distance: Number(subSolar.distance.toFixed(4)),
        isBlocked: sunBlocked,
        horizonElevation: Number(sunHorEl.toFixed(2))
      },
      earth: {
        az: Number(earthRaw.az.toFixed(2)),
        el: Number(earthRaw.el.toFixed(2)),
        distance: Math.round(earthRaw.dist),
        isBlocked: earthBlocked,
        horizonElevation: Number(earthHorEl.toFixed(2))
      },
      libration: {
        earthSubLat: Number(subEarth.lat.toFixed(3)),
        earthSubLon: Number(subEarth.lon.toFixed(3))
      },
      subSolar: {
        lat: Number(subSolar.lat.toFixed(3)),
        lon: Number(subSolar.lon.toFixed(3))
      }
    };
  }

  private static cacheKey(site: LandingSite, date: Date, hm: HorizonManager, extra: number[] = []): string {
    return `${site.id}_${site.lat}_${site.lon}_${site.elevationKm}_${date.getTime()}_${hm.getKey()}_${extra.join('_')}`;
  }

  /** Both endpoints included; only intervals carry duration. */
  public static sampleWindow(site: LandingSite, baseDate: Date, days = 30, numSamples = 1440, horizonManager?: HorizonManager): EphemerisSample[] {
    const hm = horizonManager || new HorizonManager(site.horizonProfile);
    const key = this.cacheKey(site, baseDate, hm, [days, numSamples]);
    const cached = synodicCycleCache.get(key);
    if (cached) return cached;
    const samples: EphemerisSample[] = [];
    for (let i = 0; i <= numSamples; i++) {
      const date = new Date(baseDate.getTime() + i / numSamples * days * 86400000);
      samples.push({ timestamp: date.getTime(), isoDate: date.toISOString(), missionDay: i / numSamples * days,
        ...this.calculatePosition(site, date, hm) });
    }
    synodicCycleCache.set(key, samples);
    return samples;
  }

  public static sampleSynodicCycle(site: LandingSite, baseDate: Date, numSamples = 180, horizonManager?: HorizonManager): EphemerisSample[] {
    return this.sampleWindow(site, baseDate, SYNODIC_MONTH_DAYS, numSamples, horizonManager);
  }

  public static computeSynodicCycle(site: LandingSite, baseDate: Date, numSamples = 180, horizonManager?: HorizonManager): EphemerisSample[] {
    return this.sampleSynodicCycle(site, baseDate, numSamples, horizonManager);
  }

  /** Thirty-day metrics, half-hour sampling, observed transitions refined to one minute. */
  public static computeSiteMetrics(site: LandingSite, date: Date, horizonManager?: HorizonManager): SiteMetrics {
    const hm = horizonManager || new HorizonManager(site.horizonProfile);
    const key = this.cacheKey(site, date, hm);
    const cached = siteMetricsCache.get(key);
    if (cached) return cached;
    const samples = this.sampleWindow(site, date, 30, 1440, hm);
    const current = samples[0];
    const end = samples[samples.length - 1].timestamp;
    const windows: OperationalWindow[] = [];
    for (const body of ['sun', 'earth'] as const) {
      let up = !samples[0][body].isBlocked;
      let start = date.getTime();
      const addWindow = (stop: number) => windows.push({
        type: body === 'sun' ? (up ? 'sunlight' : 'solar_shadow') : (up ? 'earth_los' : 'comm_blackout'),
        startDay: (start - date.getTime()) / 86400000, endDay: (stop - date.getTime()) / 86400000,
        durationDays: (stop - start) / 86400000, durationHours: (stop - start) / 3600000,
        startIso: new Date(start).toISOString(), endIso: new Date(stop).toISOString()
      });
      for (let i = 1; i < samples.length; i++) {
        const nextUp = !samples[i][body].isBlocked;
        if (nextUp === up) continue;
        const transition = bisectVisibility(time => !this.calculatePosition(site, new Date(time), hm)[body].isBlocked,
          samples[i - 1].timestamp, samples[i].timestamp);
        addWindow(transition);
        start = transition;
        up = nextUp;
      }
      addWindow(end);
    }
    const ofType = (type: OperationalWindow['type']) => windows.filter(w => w.type === type);
    const total = (type: OperationalWindow['type']) => ofType(type).reduce((sum, w) => sum + w.durationHours, 0);
    const longest = (type: OperationalWindow['type']) => Math.max(0, ...ofType(type).map(w => w.durationHours));
    const illuminationFraction = total('sunlight') / 720;
    const earthVisibilityFraction = total('earth_los') / 720;
    const longestShadowHours = longest('solar_shadow');
    // Illustrative choices, not engineering thresholds or an externally validated power model.
    const SUNLIGHT_WEIGHT = 75;
    const CONTINUITY_WEIGHT = 25;
    const DARK_WINDOW_REFERENCE_HOURS = 120;
    const continuity = Math.max(0, 1 - longestShadowHours / DARK_WINDOW_REFERENCE_HOURS);
    const powerScore = Math.round(illuminationFraction * SUNLIGHT_WEIGHT + continuity * CONTINUITY_WEIGHT);
    const next = this.computeCountdownEvents(site, date, hm);
    const eventHours = (event: VisibilityEvent, type: string) => event.state === 'event' && event.type === type ? event.hoursRemaining : null;
    const result: SiteMetrics = {
      currentSunElevation: current.sun.el, currentSunAzimuth: current.sun.az,
      currentEarthElevation: current.earth.el, currentEarthAzimuth: current.earth.az,
      sunInView: !current.sun.isBlocked, earthInView: !current.earth.isBlocked,
      timeToSunriseHours: eventHours(next.nextSolarEvent, 'sunrise'), timeToSunsetHours: eventHours(next.nextSolarEvent, 'sunset'),
      timeToEarthriseHours: eventHours(next.nextEarthEvent, 'earthrise'), timeToEarthsetHours: eventHours(next.nextEarthEvent, 'earthset'),
      illuminationFraction, earthVisibilityFraction,
      longestContinuousSunHours: longest('sunlight'), longestContinuousShadowHours: longestShadowHours,
      longestContinuousEarthLosHours: longest('earth_los'), longestContinuousBlackoutHours: longest('comm_blackout'),
      powerScore, powerRating: powerScore >= 70 ? 'High' : powerScore >= 40 ? 'Mixed' : 'Low',
      powerExplanation: `Illustrative heuristic: 75 × sunlight fraction + 25 × max(0, 1 − longest dark stretch / 120 h). ${powerScore}/100 over the next 30 days. Earth visibility is separate. This does not model batteries or actual power output.`,
      commRating: earthVisibilityFraction >= 0.999 ? 'CONTINUOUS' : earthVisibilityFraction === 0 ? 'OCCULTED' : 'INTERMITTENT', windows
    };
    siteMetricsCache.set(key, result);
    return result;
  }

  public static computeCountdownEvents(site: LandingSite, date: Date, horizonManager?: HorizonManager): CountdownEvents {
    const hm = horizonManager || new HorizonManager(site.horizonProfile);
    const key = this.cacheKey(site, date, hm);
    const cached = countdownEventsCache.get(key);
    if (cached) return cached;
    const start = date.getTime();
    const end = start + 30 * 86400000;
    // Reuse the exact half-hour samples already calculated for the metrics, when present.
    const samples = synodicCycleCache.get(this.cacheKey(site, date, hm, [30, 1440]));
    const positions = new Map<number, TopocentricResult>(samples?.map(sample => [sample.timestamp, sample] as const));
    const at = (time: number) => {
      let result = positions.get(time);
      if (!result) { result = this.calculatePosition(site, new Date(time), hm); positions.set(time, result); }
      return result;
    };
    const search = (body: 'sun' | 'earth'): VisibilityEvent => {
      const event = findVisibilityChange(time => !at(time)[body].isBlocked, start, end);
      const name = body === 'sun' ? 'Sun' : 'Earth';
      if (event.timestamp === null) return {
        state: event.state, type: null, eventDate: null, hoursRemaining: null,
        windowEnd: new Date(end), formattedCountdown: event.initiallyUp ? `${name} stays up through the whole window`
          : body === 'sun' ? 'Sun does not rise within the next 30 days' : 'Earth is not visible within the next 30 days'
      };
      const hours = (event.timestamp - start) / 3600000;
      const days = Math.floor(hours / 24);
      const remainder = Math.floor(hours % 24);
      const duration = days ? `${days} d ${remainder} h` : hours >= 1 ? `${remainder} h` : `${Math.max(1, Math.round(hours * 60))} min`;
      return {
        state: 'event', type: body === 'sun' ? (event.initiallyUp ? 'sunset' : 'sunrise') : (event.initiallyUp ? 'earthset' : 'earthrise'),
        eventDate: new Date(event.timestamp), hoursRemaining: hours, windowEnd: new Date(end),
        formattedCountdown: `${event.initiallyUp ? 'Sets' : 'Rises'} in ${duration}`
      };
    };
    const result = { nextSolarEvent: search('sun'), nextEarthEvent: search('earth') };
    countdownEventsCache.set(key, result);
    return result;
  }

  /** Simple array illustration at 1 AU with an assumed 30.5% cell efficiency, not a power budget. */
  public static calculateSolarFlux(elevationDeg: number, isBlocked: boolean, architecture: SolarArrayArchitecture = 'vertical') {
    const maxFluxWm2 = Math.round(1361 * 0.305);
    const factor = isBlocked ? 0 : architecture === 'vertical' ? Math.max(0, Math.cos(elevationDeg * DEG2RAD)) : Math.max(0, Math.sin(elevationDeg * DEG2RAD));
    return { fluxWm2: Math.round(maxFluxWm2 * factor), maxFluxWm2, efficiencyFactor: factor,
      description: 'Illustrative array output at 1 AU, assuming 30.5% efficiency; excludes temperature and electrical losses.' };
  }

  public static computeLaunchSlipScenarios(site: LandingSite, date: Date, slipDays = [0, 7, 14, 21], horizonManager?: HorizonManager): LaunchSlipScenario[] {
    return slipDays.map(days => {
      const epochDate = new Date(date.getTime() + days * 86400000);
      return { slipDays: days, label: days ? `+${days} days` : 'Selected date', epochDate, metrics: this.computeSiteMetrics(site, epochDate, horizonManager) };
    });
  }
}
