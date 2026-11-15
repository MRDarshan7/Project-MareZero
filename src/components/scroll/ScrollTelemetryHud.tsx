import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { getMissionTelemetry } from '../../ephemeris/telemetryConductor';

export interface ScrollTelemetryHudHandle {
  update: (progress: number) => void;
}

interface ScrollTelemetryHudProps {
  progress?: number;
}

export const ScrollTelemetryHud = forwardRef<ScrollTelemetryHudHandle, ScrollTelemetryHudProps>(
  ({ progress = 0 }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const beatTextRef = useRef<HTMLSpanElement>(null);
    const stageTextRef = useRef<HTMLDivElement>(null);
    const altLabelRef = useRef<HTMLSpanElement>(null);
    const altValRef = useRef<HTMLSpanElement>(null);
    const velLabelRef = useRef<HTMLSpanElement>(null);
    const velValRef = useRef<HTMLSpanElement>(null);

    const lastBeatRef = useRef<number>(-1);
    const lastStageRef = useRef<string>('');
    const lastAltRef = useRef<string>('');
    const lastVelRef = useRef<string>('');
    const lastDescentRef = useRef<boolean | null>(null);

    const updateDom = (p: number) => {
      const isVisible = p > 0.06 && p < 0.88;
      if (!containerRef.current) return;

      if (!isVisible) {
        containerRef.current.style.display = 'none';
        return;
      }

      containerRef.current.style.display = 'block';
      const opacity = Math.min(1, Math.max(0, (p - 0.06) / 0.04)) * Math.min(1, Math.max(0, (0.88 - p) / 0.04));
      containerRef.current.style.opacity = String(opacity);

      const tel = getMissionTelemetry(p);

      if (beatTextRef.current && lastBeatRef.current !== tel.beatIndex) {
        beatTextRef.current.textContent = `Beat ${tel.beatIndex} / 8`;
        lastBeatRef.current = tel.beatIndex;
      }

      if (stageTextRef.current && lastStageRef.current !== tel.stageName) {
        stageTextRef.current.textContent = tel.stageName;
        lastStageRef.current = tel.stageName;
      }

      if (lastDescentRef.current !== tel.isDescent) {
        if (altLabelRef.current) {
          altLabelRef.current.textContent = tel.isDescent ? 'Altitude to surface' : 'Illustrative altitude';
        }
        if (velLabelRef.current) {
          velLabelRef.current.textContent = tel.isDescent ? 'Descent speed' : 'Illustrative speed';
        }
        lastDescentRef.current = tel.isDescent;
      }

      if (altValRef.current && lastAltRef.current !== tel.altitudeStr) {
        altValRef.current.textContent = tel.altitudeStr;
        lastAltRef.current = tel.altitudeStr;
      }

      if (velValRef.current && lastVelRef.current !== tel.velocityStr) {
        velValRef.current.textContent = tel.velocityStr;
        lastVelRef.current = tel.velocityStr;
      }
    };

    useImperativeHandle(ref, () => ({
      update: updateDom
    }));

    // Initial state calculation
    const initTel = getMissionTelemetry(progress);
    const isInitiallyVisible = progress > 0.06 && progress < 0.88;

    return (
      <div
        ref={containerRef}
        style={{
          display: isInitiallyVisible ? 'block' : 'none',
          opacity: isInitiallyVisible ? 1 : 0
        }}
        className="story-telemetry"
      >
        <div className="story-readout-heading"><span>Illustrative flight readout</span><span ref={beatTextRef}>Beat {initTel.beatIndex} / 8</span></div>
        <div ref={stageTextRef} className="story-stage">{initTel.stageName}</div>
        <dl className="story-numbers"><div><dt ref={altLabelRef}>{initTel.isDescent ? 'Altitude to surface' : 'Illustrative altitude'}</dt><dd ref={altValRef}>{initTel.altitudeStr}</dd></div>
          <div><dt ref={velLabelRef}>{initTel.isDescent ? 'Descent speed' : 'Illustrative speed'}</dt><dd ref={velValRef}>{initTel.velocityStr}</dd></div></dl>
      </div>
    );
  }
);
