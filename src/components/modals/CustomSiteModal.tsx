import React, { useState } from 'react';
import { LandingSite } from '../../types';
import { HorizonManager } from '../../terrain/horizon';
import { Dialog } from '../almanac/Dialog';

export function CustomSiteModal({ isOpen, onClose, onAddCustomSite }: {
  isOpen: boolean; onClose: () => void; onAddCustomSite: (site: LandingSite) => void;
}) {
  const [name, setName] = useState('');
  const [lat, setLat] = useState('-89.5');
  const [lon, setLon] = useState('0');
  const [elevation, setElevation] = useState('0');
  const [profile, setProfile] = useState<number[] | undefined>();
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [invalidProfile, setInvalidProfile] = useState(false);
  if (!isOpen) return null;
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(''); setProfile(undefined); setFilename(''); setInvalidProfile(false);
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed) || parsed.length !== 360 || parsed.some(v => typeof v !== 'number')) throw new Error('Use a JSON array of exactly 360 numbers.');
      new HorizonManager(parsed);
      setProfile(parsed); setFilename(file.name);
    } catch (error) { setError(error instanceof Error ? error.message : 'Invalid terrain profile.'); setInvalidProfile(true); }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const latitude = Number(lat), longitude = Number(lon), elevationKm = Number(elevation);
    if (!name.trim() || ![latitude, longitude, elevationKm].every(Number.isFinite) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 360 || elevationKm < -15 || elevationKm > 15) {
      setError('Enter a name, latitude -90 to 90, longitude -180 to 360 and height -15 to 15 km.'); return;
    }
    if (invalidProfile) return;
    onAddCustomSite({ id: `custom-${Date.now()}`, name: name.trim(), category: 'Custom', lat: latitude, lon: longitude,
      elevationKm, horizonProfile: profile, terrainSource: profile ? 'user' : 'flat-fallback', isApproximateTerrain: !profile,
      description: profile ? 'User-defined location and terrain. Profile accuracy has not been independently checked.' : 'User-defined location with a flat 0.5 degree fallback horizon. No measured terrain.',
      lightingConditions: '', communicationConditions: '', scienceTarget: '' });
    onClose();
  };
  return <Dialog title="Add a lunar site" onClose={onClose}><form onSubmit={submit} className="custom-form">
    <label>Site name<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
    <div className="coordinate-inputs"><label>Latitude (degrees)<input required type="number" step="any" min="-90" max="90" value={lat} onChange={event => setLat(event.target.value)} /><small>South is negative.</small></label>
      <label>Longitude (degrees)<input required type="number" step="any" min="-180" max="360" value={lon} onChange={event => setLon(event.target.value)} /><small>East is positive.</small></label>
      <label>Height (km)<input required type="number" step="any" min="-15" max="15" value={elevation} onChange={event => setElevation(event.target.value)} /><small>Above the reference sphere.</small></label></div>
    <label>Optional terrain profile<input type="file" accept=".json,application/json" onChange={upload} /></label>
    <p className="muted">360 elevations, one for each direction from 0° north to 359°. Finite values between −15° and 45°; negative horizons are preserved.</p>
    <p>{filename ? `User-supplied terrain: ${filename}. Accuracy is your responsibility.` : 'Approximate terrain: a flat 0.5° fallback is used without an imported profile.'}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" disabled={invalidProfile}>Add site</button>
  </form></Dialog>;
}
