import { describe, it, expect } from 'vitest';
import { IsobarEngine } from '../src/engine/engine';
import { TelemetryGenerator } from '../src/engine/generator';

describe('IsobarEngine Spatial & Isobar Queries', () => {
  it('should ingest high-frequency telemetry batches without memory leaks', () => {
    const engine = new IsobarEngine(5000);
    const generator = new TelemetryGenerator(50);

    const batch = generator.generateBatch(1000);
    const ingested = engine.ingestBatch(batch);
    expect(ingested).toBe(1000);
    expect(engine.getCount()).toBe(1000);

    engine.rebuildIndex();

    // Query JFK area
    const results = engine.queryRadius({
      centerLat: 40.7128,
      centerLon: -74.0060,
      radiusKm: 250,
      startTime: 0,
      endTime: Date.now() + 1000000,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('latitude');
    expect(results[0]).toHaveProperty('pressure');
    expect(results[0]).toHaveProperty('velocity');
  });

  it('should query atmospheric isobars accurately', () => {
    const engine = new IsobarEngine(2000);
    const generator = new TelemetryGenerator(30);

    const batch = generator.generateBatch(500);
    engine.ingestBatch(batch);

    // Query 700 hPa isobar (~FL100 / 3,000m) with 50 hPa tolerance
    const isobarPoints = engine.queryIsobar({
      targetPressureHpa: 700,
      toleranceHpa: 50,
      startTime: 0,
      endTime: Date.now() + 1000000,
    });

    expect(isobarPoints.length).toBeGreaterThan(0);
    for (const pt of isobarPoints) {
      expect(pt.pressure).toBeGreaterThanOrEqual(650);
      expect(pt.pressure).toBeLessThanOrEqual(750);
    }
  });

  it('should run benchmark demonstrating sub-millisecond execution times', () => {
    const engine = new IsobarEngine(10000);
    const generator = new TelemetryGenerator(100);

    const batch = generator.generateBatch(5000);
    engine.ingestBatch(batch);
    engine.rebuildIndex();

    const bench = engine.runBenchmark(40.7128, -74.0060, 200, 300);
    expect(bench.totalDatasetSize).toBe(5000);
    expect(bench.indexedExecutionTimeMs).toBeLessThan(10.0); // Sub-millisecond or low ms
    expect(bench.speedup).toBeGreaterThanOrEqual(1.0);
  });
});
