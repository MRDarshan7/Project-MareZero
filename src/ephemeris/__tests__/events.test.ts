import { describe, expect, it } from 'vitest';
import { EphemerisEngine } from '../engine';
import { findVisibilityChange } from '../events';
import { HorizonManager } from '../../terrain/horizon';
import { CURATED_SITES } from '../../terrain/lolaData';
import { LandingSite } from '../../types';
import { duration, formatDate, terrainLabel, verdict } from '../../utils/almanac';

const HOUR = 3600000;
const date = new Date('2026-01-01T00:00:00Z');
const polar: LandingSite = { ...CURATED_SITES[0], id: 'synthetic-pole', lat: -90, lon: 0, elevationKm: 0 };

describe('Finite-window visibility states', () => {
  it.each([true, false])('returns a state and no time for constant visibility %s', up => {
    const result = findVisibilityChange(() => up, 0, 30 * 24 * HOUR);
    expect(result.state).toBe(up ? 'always_up' : 'never_up');
    expect(result.timestamp).toBeNull();
  });
  it.each([true, false])('refines a rise/set to within one minute, initially up %s', initiallyUp => {
    const transition = 7.12345 * HOUR;
    const result = findVisibilityChange(time => time < transition ? initiallyUp : !initiallyUp, 0, 24 * HOUR);
    expect(result.state).toBe('event');
    expect(Math.abs(result.timestamp! - transition)).toBeLessThanOrEqual(60_000);
  });
  it('checks the end of a window even when it is not a whole coarse step', () => {
    const result = findVisibilityChange(time => time < 1.12 * HOUR, 0, 1.2 * HOUR);
    expect(result.state).toBe('event');
    expect(Math.abs(result.timestamp! - 1.12 * HOUR)).toBeLessThanOrEqual(60_000);
  });
  it.each([['always_up', -15], ['never_up', 10]] as const)('reports %s for both bodies at a synthetic polar horizon', (state, height) => {
    const site = { ...polar, horizonProfile: new Array(360).fill(height) };
    const result = EphemerisEngine.computeCountdownEvents(site, date);
    for (const event of [result.nextSolarEvent, result.nextEarthEvent]) {
      expect(event.state).toBe(state);
      expect(event.hoursRemaining).toBeNull();
      expect(event.eventDate).toBeNull();
      expect(event.type).toBeNull();
      expect(event.windowEnd.getTime() - date.getTime()).toBe(30 * 24 * HOUR);
      expect(event.formattedCountdown).not.toMatch(/709|\d+h/);
    }
  });
  it('keeps farside Earth visibility finite in scope and does not fabricate a rise', () => {
    const site = CURATED_SITES.find(s => s.id === 'change-4')!;
    const event = EphemerisEngine.computeCountdownEvents(site, date).nextEarthEvent;
    expect(event.state).toBe('never_up');
    expect(event.hoursRemaining).toBeNull();
    expect(verdict('Earth', EphemerisEngine.calculatePosition(site, date).earth, event).answer).toBe('No');
  });
  it.each(['sun', 'earth'] as const)('matches an independent one-minute visibility scan near the %s transition', body => {
    const site = body === 'sun' ? { ...CURATED_SITES.find(s => s.id === 'apollo-11')!, horizonProfile: new Array(360).fill(0) }
      : { ...polar, horizonProfile: new Array(360).fill(0) };
    const events = EphemerisEngine.computeCountdownEvents(site, date);
    const event = body === 'sun' ? events.nextSolarEvent : events.nextEarthEvent;
    expect(event.state).toBe('event');
    if (event.state !== 'event') throw new Error('Expected a genuine rise/set');
    const centre = event.eventDate.getTime();
    const scanStart = centre - 2 * HOUR;
    const initial = EphemerisEngine.calculatePosition(site, new Date(scanStart))[body].isBlocked;
    let reference: number | null = null;
    for (let time = scanStart + 60_000; time <= centre + 2 * HOUR; time += 60_000) {
      if (EphemerisEngine.calculatePosition(site, new Date(time))[body].isBlocked !== initial) { reference = time; break; }
    }
    expect(reference).not.toBeNull();
    expect(Math.abs(centre - reference!)).toBeLessThanOrEqual(2 * 60_000);
  });
});

describe('Cache geometry, exact time and horizon correctness', () => {
  it('preserves distinct sample starts within the same UTC day', () => {
    const later = new Date(date.getTime() + 3 * HOUR);
    const first = EphemerisEngine.sampleSynodicCycle(polar, date, 8);
    const second = EphemerisEngine.sampleSynodicCycle(polar, later, 8);
    expect(first[0].timestamp).toBe(date.getTime());
    expect(second[0].timestamp).toBe(later.getTime());
    expect(first).not.toBe(second);
  });
  it('includes geometry and explicit horizon overrides in sample and countdown keys', () => {
    const low = new HorizonManager(new Array(360).fill(-15));
    const high = new HorizonManager(new Array(360).fill(10));
    expect(EphemerisEngine.sampleSynodicCycle(polar, date, 8, low)[0].sun.isBlocked).toBe(false);
    expect(EphemerisEngine.sampleSynodicCycle(polar, date, 8, high)[0].sun.isBlocked).toBe(true);
    expect(EphemerisEngine.computeCountdownEvents(polar, date, low).nextSolarEvent.state).toBe('always_up');
    expect(EphemerisEngine.computeCountdownEvents(polar, date, high).nextSolarEvent.state).toBe('never_up');
    const opposite = { ...polar, lat: 90 };
    expect(EphemerisEngine.sampleSynodicCycle(polar, date, 8)[0].sun.el).not.toBe(EphemerisEngine.sampleSynodicCycle(opposite, date, 8)[0].sun.el);
  });
  it('covers all 720 hours for each body, including a constant final window', () => {
    const metrics = EphemerisEngine.computeSiteMetrics({ ...polar, horizonProfile: new Array(360).fill(10) }, date);
    for (const types of [['sunlight', 'solar_shadow'], ['earth_los', 'comm_blackout']]) {
      expect(metrics.windows.filter(w => types.includes(w.type)).reduce((sum, w) => sum + w.durationHours, 0)).toBeCloseTo(720, 8);
    }
    expect(metrics.illuminationFraction).toBe(0);
    expect(metrics.earthVisibilityFraction).toBe(0);
  });
  it('evaluates launch slips at their own epochs', () => {
    const site = CURATED_SITES.find(s => s.id === 'apollo-11')!;
    const slips = EphemerisEngine.computeLaunchSlipScenarios(site, date, [0, 7]);
    expect(slips[1].epochDate.getTime() - slips[0].epochDate.getTime()).toBe(7 * 24 * HOUR);
    expect(slips[1].metrics).toEqual(EphemerisEngine.computeSiteMetrics(site, new Date(date.getTime() + 7 * 24 * HOUR)));
    expect(slips[1].metrics.currentSunElevation).not.toBe(slips[0].metrics.currentSunElevation);
  });
  it('preserves negative horizons and avoids rounded-angle visibility caching', () => {
    const horizon = new HorizonManager(new Array(360).fill(-2));
    expect(horizon.getElevationAtAzimuth(0)).toBe(-2);
    horizon.setProfile(new Array(360).fill(1));
    expect(horizon.isBlocked(10, 0.999)).toBe(true);
    expect(horizon.isBlocked(10, 1.001)).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity, -16, 46])('rejects invalid horizon value %s in constructors and updates', value => {
    const profile = new Array(360).fill(0); profile[10] = value;
    expect(() => new HorizonManager(profile)).toThrow();
    expect(() => new HorizonManager().setProfile(profile)).toThrow();
  });
  it('labels supplied data without inferring an external origin', () => {
    expect(terrainLabel({ ...polar, terrainSource: 'user' })).toBe('User-supplied terrain');
    expect(terrainLabel({ ...polar, terrainSource: 'flat-fallback' })).toBe('Approximate terrain');
    expect(CURATED_SITES.every(site => terrainLabel(site) === 'Approximate terrain')).toBe(true);
  });
  it('formats zero durations honestly and dates unambiguously in UTC', () => {
    expect(duration(0)).toBe('0 h');
    expect(duration(76)).toBe('3 d 4 h');
    expect(formatDate(new Date('2026-07-03T23:59:00Z'))).toBe('3 Jul 2026');
  });
  it('distinguishes an upcoming rise from current visibility in the verdict', () => {
    const point = EphemerisEngine.calculatePosition(polar, date).sun;
    const event = { state: 'event' as const, type: 'sunrise' as const, eventDate: new Date(date.getTime() + HOUR),
      hoursRemaining: 1, formattedCountdown: 'Rises in 1 h', windowEnd: new Date(date.getTime() + 720 * HOUR) };
    expect(verdict('Sun', { ...point, isBlocked: true }, event).answer).toBe('Soon');
    expect(verdict('Sun', { ...point, isBlocked: true }, { ...event, hoursRemaining: 72 }).answer).toBe('No');
    expect(verdict('Sun', { ...point, isBlocked: false }, { ...event, type: 'sunset' }).answer).toBe('Yes');
  });
});
