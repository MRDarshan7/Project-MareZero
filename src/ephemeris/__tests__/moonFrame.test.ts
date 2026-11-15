import { describe, expect, it } from 'vitest';
import { frameCoordinates, toMoonFixed } from '../moonFrame';

describe('Passive lunar frame rotations', () => {
  it.each([
    { name: 'identity', axis: { ra: -6, dec: 90, spin: 0 }, input: { x: 1, y: 2, z: 3 }, expected: [1, 2, 3] },
    { name: 'passive R3 spin', axis: { ra: -6, dec: 90, spin: 90 }, input: { x: 1, y: 0, z: 0 }, expected: [0, -1, 0] },
    { name: 'passive R1 tilt', axis: { ra: -6, dec: 0, spin: 0 }, input: { x: 0, y: 1, z: 0 }, expected: [0, 0, -1] },
    { name: 'RA hours converted to degrees', axis: { ra: 6, dec: 90, spin: 0 }, input: { x: 1, y: 0, z: 0 }, expected: [-1, 0, 0] },
    { name: 'right-to-left rotation order', axis: { ra: 0, dec: 0, spin: 90 }, input: { x: 1, y: 2, z: 3 }, expected: [3, -2, 1] }
  ])('$name', ({ axis, input, expected }) => {
    const actual = toMoonFixed(input, axis);
    [actual.x, actual.y, actual.z].forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12));
  });

  it('maps the specified north pole to +Z and preserves vector length', () => {
    const axis = { ra: 17.8, dec: 64.5, spin: 123.4 };
    const ra = axis.ra * Math.PI / 12;
    const dec = axis.dec * Math.PI / 180;
    const north = { x: 7 * Math.cos(dec) * Math.cos(ra), y: 7 * Math.cos(dec) * Math.sin(ra), z: 7 * Math.sin(dec) };
    const fixed = toMoonFixed(north, axis);
    expect(fixed.x).toBeCloseTo(0, 12);
    expect(fixed.y).toBeCloseTo(0, 12);
    expect(fixed.z).toBeCloseTo(7, 12);
    const arbitrary = toMoonFixed({ x: 2, y: -3, z: 5 }, axis);
    expect(Math.hypot(arbitrary.x, arbitrary.y, arbitrary.z)).toBeCloseTo(Math.sqrt(38), 12);
  });

  it('returns latitude, east-positive longitude and the vector norm', () => {
    const point = frameCoordinates({ x: 0, y: -3, z: Math.sqrt(3) });
    expect(point.lat).toBeCloseTo(30, 12);
    expect(point.lon).toBeCloseTo(-90, 12);
    expect(point.distance).toBeCloseTo(Math.sqrt(12), 12);
  });
});
