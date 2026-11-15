# Launch story and dome screenshots

Captured in headless Chrome at 1440 x 900 and 390 x 844. Each required frame was visually inspected. Mobile is viewport emulation, not a physical-device test.

| View | Desktop | Mobile |
|---|---|---|
| Intro: pad | [intro-p0.00-1440x900.png](intro-p0.00-1440x900.png) | [intro-p0.00-390x844.png](intro-p0.00-390x844.png) |
| Intro: ascent | [intro-p0.25-1440x900.png](intro-p0.25-1440x900.png) | [intro-p0.25-390x844.png](intro-p0.25-390x844.png) |
| Intro: fairing | [intro-p0.45-1440x900.png](intro-p0.45-1440x900.png) | [intro-p0.45-390x844.png](intro-p0.45-390x844.png) |
| Intro: descent | [intro-p0.78-1440x900.png](intro-p0.78-1440x900.png) | [intro-p0.78-390x844.png](intro-p0.78-390x844.png) |
| Intro: dome | [intro-p1.00-1440x900.png](intro-p1.00-1440x900.png) | [intro-p1.00-390x844.png](intro-p1.00-390x844.png) |
| Dashboard handoff | [handoff-1440x900.png](handoff-1440x900.png) | [handoff-390x844.png](handoff-390x844.png) |
| Dashboard: Both | [dashboard-both-1440x900.png](dashboard-both-1440x900.png) | [dashboard-both-390x844.png](dashboard-both-390x844.png) |
| Sun hidden | [sun-hidden-1440x900.png](sun-hidden-1440x900.png) | [sun-hidden-390x844.png](sun-hidden-390x844.png) |
| Earth never visible | [earth-never-visible-1440x900.png](earth-never-visible-1440x900.png) | [earth-never-visible-390x844.png](earth-never-visible-390x844.png) |
| Technical on | [technical-1440x900.png](technical-1440x900.png) | [technical-390x844.png](technical-390x844.png) |
| Forward/reverse comparison frame | [reverse-p0.30-1440x900.png](reverse-p0.30-1440x900.png) | [reverse-p0.30-390x844.png](reverse-p0.30-390x844.png) |

Full-page captures show the stacked dome/panorama and content below the viewport:

- [Both mobile](dashboard-both-full-390x844.png)
- [Sun hidden mobile](sun-hidden-full-390x844.png)
- [Earth never visible mobile](earth-never-visible-full-390x844.png)
- [Technical desktop](technical-full-1440x900.png) / [Technical mobile](technical-full-390x844.png)

The default date at capture was 15 Nov 2026 UTC. The hidden-Sun example is Shackleton on 3 Jul 2026 at 12:00 UTC. The Earth-never-visible example is Chang'e-4 on 18 Jan 2026 at 00:00 UTC. Both views use the same engine result and synthetic approximate horizon. The intro's flight altitude and speed are explicitly illustrative.

[verification.json](verification.json) records viewport/style/copy audits, scene snapshots, zero console errors, the shared-canvas/site/date handoff, guarded session storage and reduced-motion checks. At both sizes the p=0.3 image hashes and camera/lander matrices match exactly before and after the forward-to-0.6/reverse-to-0 sweep. The p=1 story screenshot holds the automatic handoff only for capture; normal scrolling opens the dashboard. Scrolling back above the entry point reverses the story.

Reproduce with a local Vite server and Chrome installed:

```bash
node scripts/captureAlmanac.mjs
# Refresh the story and repeat reverse/session/storage checks:
node scripts/captureAlmanac.mjs --story-only
# Refresh handoff screenshots and check all three view sizes:
node scripts/captureAlmanac.mjs --handoff-only
# Compatibility entry point:
node captureDocsScreens.js
```

Earlier numbered cinematic, dashboard-first and optional-3D screenshots remain historical references; the table above identifies the current design. Existing rocket-branding images were preserved.
