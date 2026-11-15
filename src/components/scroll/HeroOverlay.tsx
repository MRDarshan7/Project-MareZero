import React, { forwardRef, useImperativeHandle, useRef } from 'react';
export interface HeroOverlayHandle { update: (progress: number) => void; }
interface HeroOverlayProps { progress?: number; onSkipToDashboard: () => void; }
export const HeroOverlay = forwardRef<HeroOverlayHandle, HeroOverlayProps>(({ progress = 0, onSkipToDashboard }, ref) => {
  const container = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ update: p => {
    if (!container.current) return;
    const opacity = Math.max(0, 1 - p / 0.10);
    container.current.style.opacity = String(opacity);
    container.current.style.visibility = opacity <= 0.01 ? 'hidden' : 'visible';
    container.current.setAttribute('aria-hidden', String(opacity <= 0.01));
  } }));
  return <div ref={container} className="story-hero" style={{ opacity: Math.max(0, 1 - progress / 0.1) }}>
    <h1>Lunar Landing Site Navigator</h1>
    <p>See where the Sun and Earth sit over a Moon landing site, and whether a lander could make power and call home.</p>
    <button onClick={onSkipToDashboard}>Enter the dashboard</button>
    <span className="story-scroll-hint">Scroll to follow the flight</span>
  </div>;
});
