import { greatCircleDistanceNm, initialBearing, headwindComponent, midpoint } from './distance';

/**
 * Wind data from aviationweather.gov
 */
interface WindReport {
  stationId: string;
  lat: number;
  lon: number;
  altitude: number; // FL
  direction: number; // degrees
  speed: number; // knots
  temperature: number; // Celsius
}

interface WindResult {
  headwindKts: number; // positive = headwind, negative = tailwind
  windDirDeg: number;
  windSpeedKts: number;
  trackDeg: number;
  stationId: string;
  source: string;
}

/**
 * Fetch winds aloft from NOAA Aviation Weather Center (free, no API key).
 * Falls back gracefully if unavailable.
 *
 * @param lat1 - Origin latitude
 * @param lon1 - Origin longitude
 * @param lat2 - Destination latitude
 * @param lon2 - Destination longitude
 * @param altitudeFl - Cruise altitude in flight level (e.g., 410 for FL410)
 * @returns Wind result or null if fetch fails
 */
export async function fetchWindsAloft(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  altitudeFl: number
): Promise<WindResult | null> {
  try {
    // Map FL to available levels
    const availableLevels = [180, 240, 270, 300, 340, 390];
    const level = availableLevels.reduce((prev, curr) =>
      Math.abs(curr - altitudeFl) < Math.abs(prev - altitudeFl) ? curr : prev
    );

    const url = `https://aviationweather.gov/api/data/windtemp?region=all&level=${level * 100}&fcst=06`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const text = await response.text();
    const winds = parseWindsAloftText(text);

    if (winds.length === 0) return null;

    // Find nearest station to leg midpoint
    const mid = midpoint(lat1, lon1, lat2, lon2);
    const nearest = findNearestStation(winds, mid.lat, mid.lon);

    if (!nearest) return null;

    // Calculate track and headwind component
    const track = initialBearing(lat1, lon1, lat2, lon2);
    const hwComponent = headwindComponent(nearest.direction, nearest.speed, track);

    return {
      headwindKts: hwComponent,
      windDirDeg: nearest.direction,
      windSpeedKts: nearest.speed,
      trackDeg: track,
      stationId: nearest.stationId,
      source: `NOAA winds aloft forecast, FL${level}`,
    };
  } catch {
    return null;
  }
}

/**
 * Parse NOAA winds aloft text format.
 * Format is station-based with direction (2 digits * 10) and speed (2 digits in knots).
 */
function parseWindsAloftText(text: string): WindReport[] {
  const reports: WindReport[] = [];
  // Basic parsing - winds aloft data varies in format
  // This handles the common tabular format
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  for (const line of lines) {
    // Try to parse each line - format varies
    const match = line.match(/^(\w{3,4})\s+(\d{4}[+-]?\d{0,2})/);
    if (match) {
      const stationId = match[1];
      const windCode = match[2];

      if (windCode.length >= 4) {
        let dir = parseInt(windCode.substring(0, 2)) * 10;
        let speed = parseInt(windCode.substring(2, 4));

        // Handle light and variable (9900) = calm
        if (dir === 990) {
          dir = 0;
          speed = 0;
        }

        // Handle speeds > 99 kts (direction offset by 50)
        if (dir > 360) {
          dir -= 500;
          speed += 100;
        }

        reports.push({
          stationId,
          lat: 0, lon: 0, // Would need station database for lat/lon
          altitude: 0,
          direction: dir,
          speed,
          temperature: 0,
        });
      }
    }
  }

  return reports;
}

/**
 * Find the nearest reporting station to a given lat/lon.
 */
function findNearestStation(
  stations: WindReport[],
  lat: number,
  lon: number
): WindReport | null {
  if (stations.length === 0) return null;

  let nearest = stations[0];
  let minDist = Infinity;

  for (const station of stations) {
    if (station.lat === 0 && station.lon === 0) continue;
    const dist = greatCircleDistanceNm(lat, lon, station.lat, station.lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = station;
    }
  }

  return nearest;
}

/**
 * Calculate burn rate adjustment from headwind/tailwind.
 * Headwind increases flight time (and thus total burn), tailwind decreases it.
 *
 * @param cruiseSpeedKts - True airspeed in knots
 * @param headwindKts - Headwind component (positive = headwind, negative = tailwind)
 * @returns Multiplier for burn rate (>1 = more burn, <1 = less burn)
 */
export function windBurnMultiplier(cruiseSpeedKts: number, headwindKts: number): number {
  const groundspeed = cruiseSpeedKts - headwindKts;
  if (groundspeed <= 0) return Infinity; // Can't make progress
  return cruiseSpeedKts / groundspeed;
}

/**
 * Apply a simple percentage burn adjustment (Mode A).
 *
 * @param baseBurnGph - Base burn rate
 * @param adjustmentPct - Percentage adjustment (e.g., 8 means +8%)
 * @returns Adjusted burn rate
 */
export function applyBurnAdjustment(baseBurnGph: number, adjustmentPct: number): number {
  return baseBurnGph * (1 + adjustmentPct / 100);
}
