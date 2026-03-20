/**
 * Haversine formula for great circle distance.
 * @see https://en.wikipedia.org/wiki/Haversine_formula
 */

const EARTH_RADIUS_NM = 3440.065;

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function greatCircleDistanceNm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate initial bearing from point 1 to point 2 (for wind component calculation).
 * Returns bearing in degrees (0-360).
 */
export function initialBearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = Math.atan2(y, x);
  return (brng * 180 / Math.PI + 360) % 360;
}

/**
 * Calculate headwind component given wind direction, speed, and track.
 * Positive = headwind, negative = tailwind.
 */
export function headwindComponent(
  windDirDeg: number,
  windSpeedKts: number,
  trackDeg: number
): number {
  const angleDiff = toRad(windDirDeg - trackDeg);
  return windSpeedKts * Math.cos(angleDiff);
}

/**
 * Midpoint between two lat/lon coordinates (for nearest weather station lookup).
 */
export function midpoint(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): { lat: number; lon: number } {
  const dLon = toRad(lon2 - lon1);
  const Bx = Math.cos(toRad(lat2)) * Math.cos(dLon);
  const By = Math.cos(toRad(lat2)) * Math.sin(dLon);
  const lat = Math.atan2(
    Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)),
    Math.sqrt((Math.cos(toRad(lat1)) + Bx) ** 2 + By ** 2)
  );
  const lon = toRad(lon1) + Math.atan2(By, Math.cos(toRad(lat1)) + Bx);
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}
