/**
 * Isobar Engine Orchestrator
 * Bridges WebAssembly zero-copy memory buffers and strict TypeScript typed array fallback.
 */

import { ColumnarRingBufferTS } from './ring-buffer';
import { SpatialTemporalKDTreeTS } from './kdtree';
import { SpatialTemporalRTreeTS } from './rtree';
import { haversineDistanceKm, boundingBoxFromRadius } from './math';
import {
  TelemetryPoint,
  SpatialTemporalQueryParams,
  IsobarQueryParams,
  QueryBenchmarkResult,
  EngineStats,
} from './types';

export class IsobarEngine {
  private capacity: number;
  private mode: 'wasm' | 'typescript' = 'typescript';
  private activeIndexing: 'kdtree' | 'rtree' = 'kdtree';

  // WASM instance
  private wasmEngine: any = null;
  private wasmMemory: WebAssembly.Memory | null = null;

  // TypeScript Engine
  private ringTS: ColumnarRingBufferTS;
  private kdtreeTS: SpatialTemporalKDTreeTS;
  private rtreeTS: SpatialTemporalRTreeTS;

  // Output result buffer
  private readonly queryResultBuffer: Uint32Array;
  private callsignMap: Map<number, string> = new Map();

  // Metrics
  private totalIngested: number = 0;
  private lastIngestBatchLatencyMs: number = 0;
  private ingestionRatePerSec: number = 0;
  private lastIngestTime: number = performance.now();

  constructor(capacity: number = 100_000) {
    this.capacity = capacity;
    this.ringTS = new ColumnarRingBufferTS(capacity);
    this.kdtreeTS = new SpatialTemporalKDTreeTS(capacity);
    this.rtreeTS = new SpatialTemporalRTreeTS(capacity);
    this.queryResultBuffer = new Uint32Array(Math.min(capacity, 65536));
  }

  /**
   * Initializes WebAssembly module if available, otherwise runs strict TypeScript engine.
   */
  public async initWasm(): Promise<boolean> {
    try {
      // Dynamic import of wasm module
      const wasmModule = await import('../../pkg/isobar_core.js');
      if (wasmModule && wasmModule.IsobarEngineWasm) {
        if (typeof wasmModule.default === 'function') {
          await wasmModule.default();
        }
        this.wasmEngine = new wasmModule.IsobarEngineWasm(this.capacity);
        this.wasmMemory = (wasmModule as any).wasm?.memory || null;
        this.mode = 'wasm';
        console.log('[Isobar] Initialized native WebAssembly Engine with zero-copy shared memory.');
        return true;
      }
    } catch (err) {
      console.warn('[Isobar] Running in High-Performance strict TypeScript TypedArray mode:', err);
    }
    this.mode = 'typescript';
    return false;
  }

  public setMode(mode: 'wasm' | 'typescript'): void {
    if (mode === 'wasm' && !this.wasmEngine) {
      console.warn('WASM engine not available, remaining in TypeScript mode.');
      return;
    }
    this.mode = mode;
  }

  public setIndexingMode(index: 'kdtree' | 'rtree'): void {
    this.activeIndexing = index;
    if (this.mode === 'wasm' && this.wasmEngine) {
      this.wasmEngine.set_indexing_mode(index === 'rtree');
    }
    this.rebuildIndex();
  }

  /**
   * Ingests a single telemetry point with zero GC spikes.
   */
  public ingestPoint(point: TelemetryPoint): number {
    this.totalIngested++;
    if (point.callsign) {
      this.callsignMap.set(point.entityId, point.callsign);
    }

    if (this.mode === 'wasm' && this.wasmEngine) {
      return this.wasmEngine.ingest(
        point.timestamp,
        point.latitude,
        point.longitude,
        point.altitude,
        point.pressure,
        point.velocity,
        point.heading,
        point.entityId
      );
    } else {
      return this.ringTS.push(
        point.timestamp,
        point.latitude,
        point.longitude,
        point.altitude,
        point.pressure,
        point.velocity,
        point.heading,
        point.entityId
      );
    }
  }

  /**
   * High-throughput batch ingestion.
   */
  public ingestBatch(batch: {
    timestamps: Float64Array;
    latitudes: Float64Array;
    longitudes: Float64Array;
    altitudes: Float64Array;
    pressures: Float64Array;
    velocities: Float64Array;
    headings: Float32Array;
    entityIds: Uint32Array;
    callsigns?: string[];
  }): number {
    const t0 = performance.now();
    const len = batch.timestamps.length;

    if (batch.callsigns) {
      for (let i = 0; i < len; i++) {
        if (batch.callsigns[i]) {
          this.callsignMap.set(batch.entityIds[i], batch.callsigns[i]);
        }
      }
    }

    if (this.mode === 'wasm' && this.wasmEngine) {
      this.wasmEngine.ingest_batch(
        batch.timestamps,
        batch.latitudes,
        batch.longitudes,
        batch.altitudes,
        batch.pressures,
        batch.velocities,
        batch.headings,
        batch.entityIds
      );
    } else {
      for (let i = 0; i < len; i++) {
        this.ringTS.push(
          batch.timestamps[i],
          batch.latitudes[i],
          batch.longitudes[i],
          batch.altitudes[i],
          batch.pressures[i],
          batch.velocities[i],
          batch.headings[i],
          batch.entityIds[i]
        );
      }
    }

    const t1 = performance.now();
    this.lastIngestBatchLatencyMs = t1 - t0;
    this.totalIngested += len;

    const dt = (t1 - this.lastIngestTime) / 1000;
    if (dt >= 0.5) {
      this.ingestionRatePerSec = Math.round(len / Math.max(0.001, (t1 - t0) / 1000));
      this.lastIngestTime = t1;
    }

    return len;
  }

  /**
   * Rebuilds spatial-temporal index.
   */
  public rebuildIndex(): void {
    if (this.mode === 'wasm' && this.wasmEngine) {
      this.wasmEngine.rebuild_index();
    } else {
      if (this.activeIndexing === 'kdtree') {
        this.kdtreeTS.rebuild(this.ringTS);
      } else {
        this.rtreeTS.rebuild(this.ringTS);
      }
    }
  }

  /**
   * Spatial-temporal radius query: returns matched point records.
   */
  public queryRadius(params: SpatialTemporalQueryParams): TelemetryPoint[] {
    const centerLat = params.centerLat ?? 0;
    const centerLon = params.centerLon ?? 0;
    const radiusKm = params.radiusKm ?? 100;
    const startTime = params.startTime;
    const endTime = params.endTime;

    let matchCount = 0;

    if (this.mode === 'wasm' && this.wasmEngine) {
      matchCount = this.wasmEngine.query_radius(centerLat, centerLon, radiusKm, startTime, endTime);
    } else {
      const { minLat, minLon, maxLat, maxLon } = boundingBoxFromRadius(centerLat, centerLon, radiusKm);
      if (this.activeIndexing === 'kdtree') {
        matchCount = this.kdtreeTS.queryRange(
          minLat, minLon, maxLat, maxLon,
          startTime, endTime,
          centerLat, centerLon, radiusKm,
          this.ringTS, this.queryResultBuffer
        );
      } else {
        matchCount = this.rtreeTS.queryRange(
          minLat, minLon, maxLat, maxLon,
          startTime, endTime,
          centerLat, centerLon, radiusKm,
          this.ringTS, this.queryResultBuffer
        );
      }
    }

    const limit = Math.min(matchCount, params.limit ?? 500);
    const results: TelemetryPoint[] = [];

    for (let i = 0; i < limit; i++) {
      const idx = this.queryResultBuffer[i];
      results.push(this.getPointData(idx));
    }

    return results;
  }

  /**
   * Atmospheric Isobar query: extracts points on a constant pressure surface.
   */
  public queryIsobar(params: IsobarQueryParams): TelemetryPoint[] {
    let matchCount = 0;
    if (this.mode === 'wasm' && this.wasmEngine) {
      matchCount = this.wasmEngine.query_isobar(
        params.targetPressureHpa,
        params.toleranceHpa,
        params.startTime,
        params.endTime
      );
    } else {
      const minP = params.targetPressureHpa - params.toleranceHpa;
      const maxP = params.targetPressureHpa + params.toleranceHpa;
      const count = this.ringTS.count;
      const startIdx = this.ringTS.count < this.ringTS.capacity ? 0 : this.ringTS.head;

      for (let i = 0; i < count; i++) {
        const idx = (startIdx + i) % this.ringTS.capacity;
        const t = this.ringTS.timestamps[idx];
        if (t >= params.startTime && t <= params.endTime) {
          const p = this.ringTS.pressures[idx];
          if (p >= minP && p <= maxP) {
            this.queryResultBuffer[matchCount++] = idx;
            if (matchCount >= this.queryResultBuffer.length) break;
          }
        }
      }
    }

    const limit = Math.min(matchCount, params.limit ?? 500);
    const results: TelemetryPoint[] = [];
    for (let i = 0; i < limit; i++) {
      results.push(this.getPointData(this.queryResultBuffer[i]));
    }
    return results;
  }

  /**
   * Sub-millisecond Execution Benchmark:
   * Compares Spatial-Temporal Indexing against Naive Brute Force scan.
   */
  public runBenchmark(centerLat: number, centerLon: number, radiusKm: number, durationSec: number = 60): QueryBenchmarkResult {
    const count = this.getCount();
    if (count === 0) {
      return {
        matchCount: 0,
        indexedExecutionTimeMs: 0,
        naiveScanExecutionTimeMs: 0,
        speedup: 1,
        totalDatasetSize: 0,
        mode: this.mode,
      };
    }

    const latestTime = this.getLatestTimestamp();
    const startTime = latestTime - durationSec * 1000;
    const endTime = latestTime;

    // 1. Indexed query time
    const t0 = performance.now();
    let indexedMatches = 0;
    if (this.mode === 'wasm' && this.wasmEngine) {
      indexedMatches = this.wasmEngine.query_radius(centerLat, centerLon, radiusKm, startTime, endTime);
    } else {
      const { minLat, minLon, maxLat, maxLon } = boundingBoxFromRadius(centerLat, centerLon, radiusKm);
      indexedMatches = this.kdtreeTS.queryRange(
        minLat, minLon, maxLat, maxLon,
        startTime, endTime,
        centerLat, centerLon, radiusKm,
        this.ringTS, this.queryResultBuffer
      );
    }
    const t1 = performance.now();
    const indexedTime = Math.max(0.005, t1 - t0);

    // 2. Naive scan time
    const t2 = performance.now();
    let naiveMatches = 0;
    if (this.mode === 'wasm' && this.wasmEngine) {
      naiveMatches = this.wasmEngine.naive_scan_radius(centerLat, centerLon, radiusKm, startTime, endTime);
    } else {
      const startIdx = this.ringTS.count < this.ringTS.capacity ? 0 : this.ringTS.head;
      for (let i = 0; i < count; i++) {
        const idx = (startIdx + i) % this.ringTS.capacity;
        const t = this.ringTS.timestamps[idx];
        if (t >= startTime && t <= endTime) {
          const lat = this.ringTS.latitudes[idx];
          const lon = this.ringTS.longitudes[idx];
          if (haversineDistanceKm(centerLat, centerLon, lat, lon) <= radiusKm) {
            naiveMatches++;
          }
        }
      }
    }
    const t3 = performance.now();
    const naiveTime = Math.max(0.01, t3 - t2);

    const speedup = Number((naiveTime / indexedTime).toFixed(1));

    return {
      matchCount: indexedMatches,
      indexedExecutionTimeMs: Number(indexedTime.toFixed(3)),
      naiveScanExecutionTimeMs: Number(naiveTime.toFixed(3)),
      speedup: Math.max(1.0, speedup),
      totalDatasetSize: count,
      mode: this.mode,
    };
  }

  public getPointData(idx: number): TelemetryPoint {
    if (this.mode === 'wasm' && this.wasmMemory) {
      // Direct pointer reading from WASM linear memory
      const wasm = this.wasmEngine;
      const memBuffer = this.wasmMemory.buffer;

      const timestamps = new Float64Array(memBuffer, wasm.get_timestamps_ptr(), wasm.get_capacity());
      const latitudes = new Float64Array(memBuffer, wasm.get_latitudes_ptr(), wasm.get_capacity());
      const longitudes = new Float64Array(memBuffer, wasm.get_longitudes_ptr(), wasm.get_capacity());
      const altitudes = new Float64Array(memBuffer, wasm.get_altitudes_ptr(), wasm.get_capacity());
      const pressures = new Float64Array(memBuffer, wasm.get_pressures_ptr(), wasm.get_capacity());
      const velocities = new Float64Array(memBuffer, wasm.get_velocities_ptr(), wasm.get_capacity());
      const headings = new Float32Array(memBuffer, wasm.get_headings_ptr(), wasm.get_capacity());
      const entityIds = new Uint32Array(memBuffer, wasm.get_entity_ids_ptr(), wasm.get_capacity());

      const entityId = entityIds[idx];
      return {
        timestamp: timestamps[idx],
        latitude: latitudes[idx],
        longitude: longitudes[idx],
        altitude: altitudes[idx],
        pressure: pressures[idx],
        velocity: velocities[idx],
        heading: headings[idx],
        entityId,
        callsign: this.callsignMap.get(entityId) ?? `FL-${entityId}`,
      };
    } else {
      const pt = this.ringTS.get(idx);
      return {
        ...pt,
        callsign: this.callsignMap.get(pt.entityId) ?? `FL-${pt.entityId}`,
      };
    }
  }

  public getCount(): number {
    return this.mode === 'wasm' && this.wasmEngine ? this.wasmEngine.get_count() : this.ringTS.count;
  }

  public getHead(): number {
    return this.mode === 'wasm' && this.wasmEngine ? this.wasmEngine.get_head() : this.ringTS.head;
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public getLatestTimestamp(): number {
    const count = this.getCount();
    if (count === 0) return performance.now();
    const lastIdx = (this.getHead() - 1 + this.capacity) % this.capacity;
    return this.getPointData(lastIdx).timestamp;
  }

  public getStats(): EngineStats {
    const count = this.getCount();
    const bytesPerPoint = 56;
    return {
      capacity: this.capacity,
      count,
      head: this.getHead(),
      memoryUsageBytes: this.capacity * bytesPerPoint,
      mode: this.mode,
      activeIndexing: this.activeIndexing,
      ingestionRatePerSec: this.ingestionRatePerSec,
      lastIngestBatchLatencyMs: Number(this.lastIngestBatchLatencyMs.toFixed(3)),
    };
  }

  public clear(): void {
    if (this.mode === 'wasm' && this.wasmEngine) {
      this.wasmEngine.clear();
    } else {
      this.ringTS.clear();
    }
    this.totalIngested = 0;
  }
}
