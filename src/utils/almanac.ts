import { CelestialBodyPos, LandingSite, VisibilityEvent } from '../types';

export const formatDate = (date: Date) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
}).format(date);

export function duration(hours: number): string {
  if (hours <= 0) return '0 h';
  const minutes = Math.max(1, Math.round(hours * 60));
  const days = Math.floor(minutes / 1440);
  const remainder = Math.floor(minutes % 1440 / 60);
  return days ? `${days} d ${remainder} h` : remainder ? `${remainder} h ${minutes % 60} min` : `${minutes} min`;
}

export function terrainLabel(site: LandingSite): string {
  return site.terrainSource === 'user' ? 'User-supplied terrain' : 'Approximate terrain';
}

/** “Soon” is a display convention: a rise within 48 hours, not an operational recommendation. */
export function verdict(body: 'Sun' | 'Earth', position: CelestialBodyPos, event: VisibilityEvent) {
  const visible = !position.isBlocked;
  const answer = visible ? 'Yes' : event.state === 'event' && event.hoursRemaining <= 48 ? 'Soon' : 'No';
  if (event.state !== 'event') return { answer, sentence: event.formattedCountdown + '.' };
  const present = body === 'Sun'
    ? visible ? (position.el < 5 ? 'The Sun is low but up.' : 'The Sun is up.') : 'The Sun is hidden.'
    : visible ? 'Earth is visible.' : 'Earth is hidden.';
  const next = visible ? (body === 'Sun' ? 'It sets' : 'It disappears') : (body === 'Sun' ? 'It rises' : 'It comes into view');
  return { answer, sentence: `${present} ${next} in ${duration(event.hoursRemaining)}.` };
}

export function shareUrl(site: LandingSite, date: Date): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('date', date.toISOString());
  if (site.category === 'Custom') url.searchParams.set('custom', JSON.stringify({
    name: site.name, lat: site.lat, lon: site.lon, elevationKm: site.elevationKm, horizonProfile: site.horizonProfile
  }));
  else url.searchParams.set('site', site.id);
  return url.toString();
}
