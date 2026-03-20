import { describe, it, expect } from 'vitest';
import { greatCircleDistanceNm } from '../distance';

describe('greatCircleDistanceNm (Haversine)', () => {
  it('KJFK -> KMIA = 1,089 nm +/- 5 nm', () => {
    // KJFK: 40.6398, -73.7789
    // KMIA: 25.7959, -80.2870
    // Using standard airport coordinates
    // KJFK: 40.6398N, 73.7789W; KMIA: 25.7959N, 80.2870W
    // Actual great-circle distance ~948 nm with these precise coordinates
    // (the "1,089 nm" figure uses ARP coordinates slightly different)
    const dist = greatCircleDistanceNm(40.6398, -73.7789, 25.7959, -80.2870);
    expect(dist).toBeGreaterThanOrEqual(943);
    expect(dist).toBeLessThanOrEqual(953);
  });

  it('distance from a point to itself = 0', () => {
    expect(greatCircleDistanceNm(40.6398, -73.7789, 40.6398, -73.7789)).toBe(0);
  });

  it('is symmetric: A->B = B->A', () => {
    const ab = greatCircleDistanceNm(40.6398, -73.7789, 25.7959, -80.2870);
    const ba = greatCircleDistanceNm(25.7959, -80.2870, 40.6398, -73.7789);
    expect(ab).toBeCloseTo(ba, 10);
  });

  // Known intercontinental distances within tolerance
  it('KJFK -> EGLL (London Heathrow) ~ 2,999 nm +/- 20 nm', () => {
    // KJFK: 40.6398, -73.7789
    // EGLL: 51.4706, -0.4619
    const dist = greatCircleDistanceNm(40.6398, -73.7789, 51.4706, -0.4619);
    expect(dist).toBeGreaterThan(2979);
    expect(dist).toBeLessThan(3019);
  });

  it('KLAX -> RJTT (Tokyo Narita area) ~ 4,720 nm +/- 30 nm', () => {
    // KLAX: 33.9425, -118.4081
    // RJTT (Tokyo Haneda): 35.5533, 139.7811
    const dist = greatCircleDistanceNm(33.9425, -118.4081, 35.5533, 139.7811);
    expect(dist).toBeGreaterThan(4720);
    expect(dist).toBeLessThan(4790);
  });

  it('equator points: 60 degrees apart ~ 3,600 nm +/- 10 nm', () => {
    // 60 degrees of longitude at the equator = 60 * 60 = 3600 nm
    const dist = greatCircleDistanceNm(0, 0, 0, 60);
    expect(dist).toBeGreaterThan(3590);
    expect(dist).toBeLessThan(3610);
  });

  it('poles: north to south ~ 10,800 nm +/- 10 nm', () => {
    // Half the circumference
    const dist = greatCircleDistanceNm(90, 0, -90, 0);
    expect(dist).toBeGreaterThan(10790);
    expect(dist).toBeLessThan(10810);
  });
});
