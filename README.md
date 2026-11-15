# Lunar Landing Site Navigator

A field almanac for sunlight and Earth visibility at lunar locations. The app opens on a short, reversible scroll-driven launch story, with a 300vh track. **Enter the dashboard**, the fixed **Skip to the dashboard** link, or `?skip=1` bypass it. The choice is remembered for the session when storage is available. The selected site and today's UTC date carry into the paused dashboard; **Watch the launch story** returns to the story.

## Run locally

```bash
npm install
npm run dev
```

Validation:

```bash
npx tsc --noEmit
npm test
npm run build
```

## What the readouts mean

- **Can it make power?** reports whether the centre of the Sun clears the selected horizon. It does not model an actual power system.
- **Can it phone home?** reports whether the centre of Earth clears the horizon. Radio equipment, link budgets and relay spacecraft are outside this model.
- **Yes** means visible now. **Soon** means a rise within 48 hours. Otherwise the answer is **No**, with a computed event time or an explicit statement that there is no rise in the next 30 days.
- **Stays up** and **does not rise** refer to the finite 30-day window, not all time. Event searches use a 30-minute coarse scan, then bisection to within one minute. Very short visibility windows between scan samples may be missed.
- **Sunlight outlook** is an illustrative heuristic: `75 * sunlight fraction + 25 * max(0, 1 - longest dark stretch / 120 hours)`. Its weights and reference duration are display choices. Earth visibility is separate.

## Sky positions and reference data

Runtime positions come from **astronomy-engine**, not a live remote ephemeris. J2000 equatorial Moon-to-Sun and Moon-to-Earth vectors are rotated into the Moon's body-fixed frame with passive rotations. The observer's position is subtracted before calculating local directions.

The ten stored benchmark rows in [horizonsValidation.ts](src/ephemeris/horizonsValidation.ts) are from real JPL Horizons queries: Shackleton, Malapert and Apollo 11 on 1 January, 3 July and 15 November 2026, plus Chang'e-4 on 3 July. Tests require agreement within **0.1 degrees** in azimuth and elevation. Generated rows retain complete query URLs and raw response lines. The tests also include multi-date libration, phase, polar, touchdown and frame-math checks. This does not establish accuracy at every site and time.

```bash
node scripts/queryHorizons.js
node scripts/queryHorizons.js --update-change4
node scripts/queryHorizons.js --update-additional
```

[JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) and [astronomy-engine](https://github.com/cosinekitty/astronomy) provide the underlying reference system and calculation library. The app uses a spherical Moon of radius 1737.4 km, no atmospheric refraction, and point-centre visibility. The Sun's limb and equipment constraints are not included.

## Terrain is approximate

**All bundled terrain is synthetic.** The profiles are invented analytic curves. They are labeled **Approximate terrain** and must not be used as measured lunar topography.

Add site accepts a JSON array of exactly 360 finite elevations, one per degree of azimuth from north clockwise. Values must be between -15 and +45 degrees; negative horizons are preserved. An imported profile is labeled **User-supplied terrain**, without inferring its origin or accuracy. Without a profile, the app uses an explicitly labeled flat 0.5-degree fallback.

The historical `scripts/extractLolaHorizon.js` filename is retained for compatibility, but the script generates a **synthetic demonstration** and reads no measured elevation data. Its output metadata says so.

## Views and exports

- **Today:** the 3D dome and SVG panorama share the same computed positions. Desktop defaults to Both (45/55 split); mobile defaults to Dome, with Both stacking the views. A matte lander carries through from the story on the same persistent canvas. Both views state their height scaling; disc enlargement preserves the approximate 1.9/0.53 Earth/Sun diameter ratio. Trails cover the previous 12 and next 24 hours. A 30-day timeline and computed verdicts sit alongside the controls.
- **Dome controls:** drag to orbit, scroll to zoom, or use the orbit/reset buttons. No automatic orbit or playback; reduced motion removes scroll smoothing.
- **Timeline:** visible and hidden windows, UTC dates, durations on hover or keyboard focus, and a today marker when today falls inside the window.
- **Compare:** up to three independent site/date combinations, computed differences, and +7/+14/+21-day slips.
- **Technical:** directions, distances, illustrative array output, the sunlight heuristic and data notes. Analysis/ranking is available only in this mode.
- **Share / CSV / PNG:** share the selected site/time, export computed samples/windows, or export the horizon image. Custom share links include the supplied profile.

## Screenshots

Run the current dashboard capture and layout checks with Chrome installed:

```bash
node scripts/captureAlmanac.mjs
# or the compatibility entry point:
node captureDocsScreens.js
```

The current story/dome captures and verification report are indexed in [docs/screens/README.md](docs/screens/README.md). They include five scroll positions, the handoff, default Both view, hidden Sun, farside Earth and Technical mode at desktop and mobile sizes. Forward/reverse checks compare the exact rendered image and camera/lander matrices on the same scene instance. `?debug=1` exposes a progress slider and a read-only scene snapshot for reproducible checks.

## Attribution

Not affiliated with or endorsed by NASA. No measured terrain dataset is bundled. This is an explanatory visualization, not a mission-planning or engineering validation tool.
