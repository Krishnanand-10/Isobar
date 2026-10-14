/**
 * Geodesic, Spatial, and Atmospheric Mathematics for Isobar
 * Rigorous spherical trigonometry and ISA standard atmosphere formulas.
 */

export const EARTH_RADIUS_KM = 6371.0088;
export const STANDARD_SEA_LEVEL_PRESSURE_HPA = 1013.25;
const DEG_TO_RAD = Math.PI / 180.0;
const RAD_TO_DEG = 180.0 / Math.PI;

/**
 * Computes exact geodesic distance between two coordinate pairs using the Haversine formula.
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;

  const lat1Rad = lat1 * DEG_TO_RAD;
  const lat2Rad = lat2 * DEG_TO_RAD;

  const sinDLat2 = Math.sin(dLat * 0.5);
  const sinDLon2 = Math.sin(dLon * 0.5);

  const a = sinDLat2 * sinDLat2 + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDLon2 * sinDLon2;
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0.0, 1.0 - a)));

  return EARTH_RADIUS_KM * c;
}

/**
 * Fast equirectangular squared distance for low-latency candidate screening.
 */
export function equirectangularDistanceSqKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const meanLatRad = ((lat1 + lat2) * 0.5) * DEG_TO_RAD;
  const cosLat = Math.cos(meanLatRad);
  const x = (lon2 - lon1) * DEG_TO_RAD * cosLat;
  const y = (lat2 - lat1) * DEG_TO_RAD;
  return (x * x + y * y) * (EARTH_RADIUS_KM * EARTH_RADIUS_KM);
}

/**
 * Computes bounding box from center and radius in kilometers.
 */
export function boundingBoxFromRadius(
  centerLat: number,
  centerLon: number,
  radiusKm: number
): { minLat: number; minLon: number; maxLat: number; maxLon: number } {
  const deltaLat = (radiusKm / EARTH_RADIUS_KM) * RAD_TO_DEG;
  const minLat = Math.max(-90.0, centerLat - deltaLat);
  const maxLat = Math.min(90.0, centerLat + deltaLat);

  const cosLat = Math.abs(Math.cos(centerLat * DEG_TO_RAD));
  const deltaLon = cosLat > 1e-6 ? (radiusKm / (EARTH_RADIUS_KM * cosLat)) * RAD_TO_DEG : 180.0;

  const minLon = Math.max(-180.0, centerLon - deltaLon);
  const maxLon = Math.min(180.0, centerLon + deltaLon);

  return { minLat, minLon, maxLat, maxLon };
}

/**
 * International Standard Atmosphere (ISA): Pressure (hPa) to Geopotential Altitude (m).
 */
export function pressureToAltitudeMeters(pressureHpa: number): number {
  if (pressureHpa <= 0) return 0;
  return 44330.0 * (1.0 - Math.pow(pressureHpa / STANDARD_SEA_LEVEL_PRESSURE_HPA, 1.0 / 5.255));
}

/**
 * International Standard Atmosphere (ISA): Altitude (m) to Expected Pressure (hPa).
 */
export function altitudeToPressureHpa(altitudeM: number): number {
  return STANDARD_SEA_LEVEL_PRESSURE_HPA * Math.pow(Math.max(0.0, 1.0 - altitudeM / 44330.0), 5.255);
}
