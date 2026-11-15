import { ThreeConductor } from '../../scene/ThreeConductor';

/** The story and both dashboard projections share one scene and one ephemeris result. */
export interface SceneBridge {
  conductor: ThreeConductor | null;
  error: string;
  registerDomeHost: (host: HTMLDivElement | null) => void;
  subscribeFrame: (listener: () => void) => () => void;
}
