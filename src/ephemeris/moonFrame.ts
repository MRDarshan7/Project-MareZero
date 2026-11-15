/** Cartesian vector; rotation preserves the caller's distance units. */
export interface FrameVector {
  x: number;
  y: number;
  z: number;
}

/** Astronomy.RotationAxis convention: right ascension in hours, other angles in degrees. */
interface MoonAxis {
  ra: number;
  dec: number;
  spin: number;
}

const DEG2RAD = Math.PI / 180;

/**
 * J2000 equatorial -> lunar body-fixed, using passive frame rotations:
 * M = R3(W) R1(90 - dec) R3(15 * ra + 90).
 * R3(t): (x,y,z) -> (cx+sy, -sx+cy, z)
 * R1(t): (x,y,z) -> (x, cy+sz, -sy+cz)
 */
export function toMoonFixed(vector: FrameVector, axis: MoonAxis): FrameVector {
  const alpha = (15 * axis.ra + 90) * DEG2RAD;
  const tilt = (90 - axis.dec) * DEG2RAD;
  const spin = axis.spin * DEG2RAD;

  const x1 = Math.cos(alpha) * vector.x + Math.sin(alpha) * vector.y;
  const y1 = -Math.sin(alpha) * vector.x + Math.cos(alpha) * vector.y;
  const y2 = Math.cos(tilt) * y1 + Math.sin(tilt) * vector.z;
  const z2 = -Math.sin(tilt) * y1 + Math.cos(tilt) * vector.z;

  return {
    x: Math.cos(spin) * x1 + Math.sin(spin) * y2,
    y: -Math.sin(spin) * x1 + Math.cos(spin) * y2,
    z: z2
  };
}

/** Selenographic latitude/longitude in degrees, longitude positive east. */
export function frameCoordinates(vector: FrameVector): { lat: number; lon: number; distance: number } {
  const distance = Math.hypot(vector.x, vector.y, vector.z);
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, vector.z / distance))) / DEG2RAD,
    lon: Math.atan2(vector.y, vector.x) / DEG2RAD,
    distance
  };
}
