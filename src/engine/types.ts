/**
 * Isobar Telemetry Engine — Type Definitions
 * Mathematical and algorithmic precision for spatial-temporal telemetry data.
 */

export interface TelemetryPoint {
  timestamp: number;    // Milliseconds epoch (Float64)
  latitude: number;     // Degrees -90 to +90 (Float64)
  longitude: number;    // Degrees -180 to +180 (Float64)
  altitude: number;     // Meters / Barometric altitude (Float64)
  pressure: number;     // Hectopascals (hPa / mbar) (Float64)
  velocity: number;     // Knots / Ground speed (Float64)
  heading: number;      // Heading in degrees 0-360 (Float32)
  entityId: number;     // Numeric transponder ID (Uint32)
  callsign?: string;    // Human-readable flight/sensor callsign (e.g. "UAL842", "STN-04")
}

export interface SpatialBoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface SpatialTemporalQueryParams {
  centerLat?: number;
  centerLon?: number;
  radiusKm?: number;
  bbox?: SpatialBoundingBox;
  startTime: number;
  endTime: number;
  limit?: number;
}

export interface IsobarQueryParams {
  targetPressureHpa: number;
  toleranceHpa: number;
  startTime: number;
  endTime: number;
  limit?: number;
}

export interface QueryBenchmarkResult {
  matchCount: number;
  indexedExecutionTimeMs: number;
  naiveScanExecutionTimeMs: number;
  speedup: number;
  totalDatasetSize: number;
  mode: 'wasm' | 'typescript';
}

export interface EngineStats {
  capacity: number;
  count: number;
  head: number;
  memoryUsageBytes: number;
  mode: 'wasm' | 'typescript';
  activeIndexing: 'kdtree' | 'rtree';
  ingestionRatePerSec: number;
  lastIngestBatchLatencyMs: number;
}
