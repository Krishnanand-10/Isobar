/**
 * High-frequency Atmospheric & ADS-B Telemetry Stream Generator
 * Simulates high-density commercial air traffic transponder streams and meteorological weather station networks.
 */

import { altitudeToPressureHpa } from './math';

export interface SimulatedFlight {
  id: number;
  callsign: string;
  lat: number;
  lon: number;
  altMeters: number;
  velocityKnots: number;
  headingDeg: number;
  targetAltitude: number;
}

const CALLSIGN_PREFIXES = ['UAL', 'AAL', 'DAL', 'BAW', 'DLH', 'AFR', 'QFA', 'SIA', 'ANA', 'JAL', 'KLM', 'SWA', 'METEO', 'RADAR'];

export class TelemetryGenerator {
  private flights: SimulatedFlight[] = [];
  private nextEntityId: number = 1000;

  constructor(flightCount: number = 250) {
    this.initFlights(flightCount);
  }

  private initFlights(count: number): void {
    this.flights = [];
    // Distribute around major flight corridors (North America / Atlantic / Europe)
    const corridors = [
      { lat: 40.7128, lon: -74.0060 }, // New York
      { lat: 34.0522, lon: -118.2437 }, // Los Angeles
      { lat: 51.5074, lon: -0.1278 }, // London
      { lat: 48.8566, lon: 2.3522 }, // Paris
      { lat: 25.2048, lon: 55.2708 }, // Dubai
      { lat: 1.3521, lon: 103.8198 }, // Singapore
      { lat: 35.6762, lon: 139.6503 }, // Tokyo
      { lat: 41.8781, lon: -87.6298 }, // Chicago
    ];

    for (let i = 0; i < count; i++) {
      const anchor = corridors[i % corridors.length];
      const prefix = CALLSIGN_PREFIXES[i % CALLSIGN_PREFIXES.length];
      const flightNum = 100 + (i * 37) % 899;
      const callsign = `${prefix}${flightNum}`;

      const spreadLat = (Math.random() - 0.5) * 8.0;
      const spreadLon = (Math.random() - 0.5) * 12.0;

      const altMeters = 3000 + Math.random() * 9000; // 3,000m to 12,000m (FL100 - FL400)
      const velocityKnots = 220 + Math.random() * 320; // 220 to 540 knots
      const headingDeg = Math.random() * 360;

      this.flights.push({
        id: this.nextEntityId++,
        callsign,
        lat: anchor.lat + spreadLat,
        lon: anchor.lon + spreadLon,
        altMeters,
        velocityKnots,
        headingDeg,
        targetAltitude: altMeters + (Math.random() - 0.5) * 2000,
      });
    }
  }

  /**
   * Generates a batch of high-frequency telemetry points.
   */
  public generateBatch(
    count: number,
    baseTimestamp: number = performance.now()
  ): {
    timestamps: Float64Array;
    latitudes: Float64Array;
    longitudes: Float64Array;
    altitudes: Float64Array;
    pressures: Float64Array;
    velocities: Float64Array;
    headings: Float32Array;
    entityIds: Uint32Array;
    callsigns: string[];
  } {
    const timestamps = new Float64Array(count);
    const latitudes = new Float64Array(count);
    const longitudes = new Float64Array(count);
    const altitudes = new Float64Array(count);
    const pressures = new Float64Array(count);
    const velocities = new Float64Array(count);
    const headings = new Float32Array(count);
    const entityIds = new Uint32Array(count);
    const callsigns: string[] = new Array(count);

    const fCount = this.flights.length;

    for (let i = 0; i < count; i++) {
      const flight = this.flights[i % fCount];

      // Kinematic update
      const headingRad = flight.headingDeg * (Math.PI / 180);
      const speedKmPerSec = (flight.velocityKnots * 1.852) / 3600;
      const dt = 1.0; // 1 second step

      // Update position
      flight.lat += (speedKmPerSec * dt * Math.cos(headingRad)) / 111.0;
      flight.lon += (speedKmPerSec * dt * Math.sin(headingRad)) / (111.0 * Math.cos(flight.lat * (Math.PI / 180)));

      // Boundary wraparound
      if (flight.lat > 85.0) flight.lat = -85.0;
      if (flight.lat < -85.0) flight.lat = 85.0;
      if (flight.lon > 180.0) flight.lon -= 360.0;
      if (flight.lon < -180.0) flight.lon += 360.0;

      // Small altitude oscillation
      if (Math.abs(flight.altMeters - flight.targetAltitude) > 100) {
        flight.altMeters += (flight.targetAltitude - flight.altMeters) * 0.01;
      }

      // Atmospheric pressure at current flight altitude
      const pressure = altitudeToPressureHpa(flight.altMeters);

      // Random jitter for sensor simulation
      const jitterTime = baseTimestamp + i * 0.05;

      timestamps[i] = jitterTime;
      latitudes[i] = flight.lat;
      longitudes[i] = flight.lon;
      altitudes[i] = flight.altMeters;
      pressures[i] = pressure;
      velocities[i] = flight.velocityKnots;
      headings[i] = flight.headingDeg;
      entityIds[i] = flight.id;
      callsigns[i] = flight.callsign;
    }

    return {
      timestamps,
      latitudes,
      longitudes,
      altitudes,
      pressures,
      velocities,
      headings,
      entityIds,
      callsigns,
    };
  }

  public get activeFlights(): SimulatedFlight[] {
    return this.flights;
  }
}
