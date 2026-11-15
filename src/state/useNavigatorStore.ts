import { useState, useEffect, useMemo } from 'react';
import { LandingSite } from '../types';
import { CURATED_SITES } from '../terrain/lolaData';
import { HorizonManager } from '../terrain/horizon';
import { EphemerisEngine, SYNODIC_MONTH_DAYS } from '../ephemeris/engine';

function initialSelection() {
  const params = new URLSearchParams(window.location.search);
  let site = CURATED_SITES.find(s => s.id === params.get('site')) || CURATED_SITES[0];
  try {
    const custom = JSON.parse(params.get('custom') || 'null');
    if (custom && typeof custom.name === 'string' && custom.name.trim() && custom.name.length <= 100
      && Number.isFinite(custom.lat) && Math.abs(custom.lat) <= 90 && Number.isFinite(custom.lon)
      && custom.lon >= -180 && custom.lon <= 360 && Number.isFinite(custom.elevationKm) && Math.abs(custom.elevationKm) <= 15) {
      if (custom.horizonProfile !== undefined) {
        if (!Array.isArray(custom.horizonProfile)) throw new Error('Invalid shared terrain');
        new HorizonManager(custom.horizonProfile);
      }
      site = { id: 'shared-custom', category: 'Custom', name: custom.name.trim(), lat: custom.lat, lon: custom.lon,
        elevationKm: custom.elevationKm, horizonProfile: custom.horizonProfile,
        terrainSource: custom.horizonProfile ? 'user' : 'flat-fallback', description: 'Shared user-defined location. Terrain accuracy is not independently checked.',
        lightingConditions: '', communicationConditions: '', scienceTarget: '' };
    }
  } catch { /* Invalid shared data falls back to the curated selection. */ }
  const parsed = params.get('date');
  const candidate = parsed ? new Date(parsed) : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const date = Number.isFinite(candidate.getTime()) && candidate.getUTCFullYear() >= 1900 && candidate.getUTCFullYear() <= 2100
    ? candidate : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return { site, date };
}

export function useNavigatorStore() {
  const [initial] = useState(initialSelection);
  const [currentSite, setSite] = useState<LandingSite>(initial.site);
  const [customSites, setCustomSites] = useState<LandingSite[]>(initial.site.category === 'Custom' ? [initial.site] : []);
  const [targetDate, setDate] = useState(initial.date);
  const [missionDay, setMissionDay] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [activeTab, setActiveTab] = useState<'today' | 'timeline' | 'compare' | 'analysis'>('today');
  const [technical, setTechnical] = useState(false);
  const allSites = useMemo(() => [...CURATED_SITES, ...customSites], [customSites]);
  const currentEpochDate = useMemo(() => new Date(targetDate.getTime() + missionDay * 86400000), [targetDate, missionDay]);
  const horizonManager = useMemo(() => new HorizonManager(currentSite.horizonProfile), [currentSite]);
  const position = useMemo(() => EphemerisEngine.calculatePosition(currentSite, currentEpochDate, horizonManager), [currentSite, currentEpochDate, horizonManager]);
  const siteMetrics = useMemo(() => EphemerisEngine.computeSiteMetrics(currentSite, currentEpochDate, horizonManager), [currentSite, currentEpochDate, horizonManager]);
  const countdownEvents = useMemo(() => EphemerisEngine.computeCountdownEvents(currentSite, currentEpochDate, horizonManager), [currentSite, currentEpochDate, horizonManager]);
  const synodicSamples = useMemo(() => EphemerisEngine.sampleWindow(currentSite, currentEpochDate, 30, 1440, horizonManager), [currentSite, currentEpochDate, horizonManager]);
  const trail = useMemo(() => EphemerisEngine.sampleWindow(currentSite, new Date(currentEpochDate.getTime() - 12 * 3600000), 1.5, 72, horizonManager), [currentSite, currentEpochDate, horizonManager]);
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setMissionDay(day => (day + playbackSpeed / 24) % SYNODIC_MONTH_DAYS), 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, playbackSpeed]);
  const setTargetDate = (date: Date) => {
    if (Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 2100) {
      setDate(date); setMissionDay(0); setIsPlaying(false);
    }
  };
  const addCustomSite = (site: LandingSite) => { setCustomSites(sites => [...sites, site]); setSite(site); };
  return { currentSite, allSites, targetDate, currentEpochDate, missionDay, activeTab, technical,
    isPlaying, playbackSpeed, horizonManager, position, siteMetrics, countdownEvents, synodicSamples, trail,
    setSite, setTargetDate, setMissionDay, setActiveTab, setTechnical, setIsPlaying, setPlaybackSpeed, addCustomSite };
}
