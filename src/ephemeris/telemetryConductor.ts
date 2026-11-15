/**
 * Deterministic Mission Telemetry & Flight Beat State Machine
 * Guarantees strictly monotonic altitude and velocity profiles,
 * synchronized flight stage labels, and captions.
 */

export interface MissionTelemetry {
  progress: number;
  beatIndex: number;
  beatName: string;
  stageName: string;
  altitudeKm: number;
  altitudeStr: string;
  velocityKmh: number;
  velocityStr: string;
  caption: string;
  isDescent: boolean;
  isLanded: boolean;
  isDashboard: boolean;
}

export function getMissionTelemetry(p: number): MissionTelemetry {
  const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
  const prog = clamp(p);

  let beatIndex = 0;
  let beatName = 'Launch pad';
  let stageName = 'On the pad';
  let altitudeKm = 0;
  let velocityKmh = 0;
  let caption = 'Launch story: preparation';
  let isDescent = false;
  let isLanded = false;
  let isDashboard = false;

  if (prog < 0.08) {
    // 0-8%: Hero
    beatIndex = 0;
    beatName = 'Hero';
    stageName = 'On the pad';
    altitudeKm = 0;
    velocityKmh = 0;
    caption = 'On the pad, ready to begin';
  } else if (prog < 0.18) {
    // 8-18%: Liftoff
    beatIndex = 1;
    beatName = 'Liftoff';
    stageName = 'Booster ascent';
    const t = (prog - 0.08) / 0.10;
    altitudeKm = 0.001 + t * t * 15.0; // 0 to 15 km
    velocityKmh = t * 2400; // 0 to 2,400 km/h
    caption = 'Liftoff and release from the pad';
  } else if (prog < 0.35) {
    // 18-35%: Ascent
    beatIndex = 2;
    beatName = 'Ascent';
    stageName = 'Booster ascent';
    const t = (prog - 0.18) / 0.17;
    altitudeKm = 15.0 + t * 85.0; // 15 to 100 km (Kármán line)
    velocityKmh = 2400 + t * 7600; // 2,400 to 10,000 km/h
    caption = 'Climbing toward space';
  } else if (prog < 0.45) {
    // 35-45%: Booster MECO & Separation
    beatIndex = 3;
    beatName = 'Booster separation';
    stageName = 'Upper stage';
    const t = (prog - 0.35) / 0.10;
    altitudeKm = 100.0 + t * 120.0; // 100 to 220 km
    velocityKmh = 10000 + t * 12000; // 10,000 to 22,000 km/h
    caption = 'The booster separates; the upper stage continues';
  } else if (prog < 0.55) {
    // 45-55%: Fairing separation
    beatIndex = 4;
    beatName = 'Fairing separation';
    stageName = 'Toward the Moon';
    const t = (prog - 0.45) / 0.10;
    altitudeKm = 220.0 + t * 384180.0; // 220 km to 384,400 km (Translunar)
    velocityKmh = 22000 + (1 - t * 0.4) * 6000; // TLI burn velocity
    caption = 'The fairing opens to reveal the lander';
  } else if (prog < 0.62) {
    // 55-62%: Lander release
    beatIndex = 5;
    beatName = 'Lander release';
    stageName = 'Coasting toward the Moon';
    const t = (prog - 0.55) / 0.07;
    altitudeKm = 384400.0 - t * 350000.0; // Distance to Moon closing
    velocityKmh = 25600 - t * 18000;
    caption = 'The lander separates and unfolds';
  } else if (prog < 0.80) {
    // 62-80%: Approach & Powered Descent
    beatIndex = 6;
    beatName = 'Lunar descent';
    stageName = 'Descending';
    isDescent = true;
    const t = (prog - 0.62) / 0.18;
    // Descent from 15,000 meters to 150 meters
    altitudeKm = (15.0 * Math.pow(1 - t, 1.8));
    // Velocity strictly monotonically decreasing from 5,800 km/h to 120 km/h
    velocityKmh = 5800.0 * Math.pow(1 - t, 1.4) + 120.0;
    caption = 'The lander descends toward the surface';
  } else if (prog < 0.86) {
    // 80-86%: Touchdown
    beatIndex = 7;
    beatName = 'Touchdown';
    stageName = 'Approaching the surface';
    isDescent = true;
    const t = (prog - 0.80) / 0.06;
    // Altitude descends from 150 meters to 0
    altitudeKm = Math.max(0, 0.15 * (1 - t));
    // Speed decelerates from 120 km/h to 0 km/h
    velocityKmh = Math.max(0, 120.0 * (1 - t));
    if (t >= 0.8) {
      isLanded = true;
      caption = 'The lander reaches the surface';
    } else {
      caption = 'Approaching the landing site';
    }
  } else {
    // 86-100%: Sky dome
    beatIndex = 8;
    beatName = 'Sky dome';
    stageName = 'On the surface';
    altitudeKm = 0;
    velocityKmh = 0;
    isLanded = true;
    isDashboard = true;
    caption = 'The landing site becomes a sky instrument';
  }

  // Format strings
  let altitudeStr = '';
  if (altitudeKm < 1.0) {
    altitudeStr = `${Math.round(altitudeKm * 1000)} m`;
  } else if (altitudeKm < 1000) {
    altitudeStr = `${altitudeKm.toFixed(1)} km`;
  } else {
    altitudeStr = `${Math.round(altitudeKm).toLocaleString()} km`;
  }

  const velocityStr = `${Math.round(velocityKmh).toLocaleString()} km/h`;

  return {
    progress: prog,
    beatIndex,
    beatName,
    stageName,
    altitudeKm,
    altitudeStr,
    velocityKmh,
    velocityStr,
    caption,
    isDescent,
    isLanded,
    isDashboard
  };
}
