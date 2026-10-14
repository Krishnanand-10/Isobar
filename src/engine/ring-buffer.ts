/**
 * Zero-GC Flat Columnar Ring Buffer in strict TypeScript
 * Preallocates continuous TypedArrays for fixed-capacity circular time-series telemetry streams.
 */

export class ColumnarRingBufferTS {
  public readonly capacity: number;
  public head: number = 0;
  public count: number = 0;

  // Contiguous typed array columns
  public readonly timestamps: Float64Array;
  public readonly latitudes: Float64Array;
  public readonly longitudes: Float64Array;
  public readonly altitudes: Float64Array;
  public readonly pressures: Float64Array;
  public readonly velocities: Float64Array;
  public readonly headings: Float32Array;
  public readonly entityIds: Uint32Array;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
    this.timestamps = new Float64Array(this.capacity);
    this.latitudes = new Float64Array(this.capacity);
    this.longitudes = new Float64Array(this.capacity);
    this.altitudes = new Float64Array(this.capacity);
    this.pressures = new Float64Array(this.capacity);
    this.velocities = new Float64Array(this.capacity);
    this.headings = new Float32Array(this.capacity);
    this.entityIds = new Uint32Array(this.capacity);
  }

  /**
   * Pushes a new telemetry record in O(1) time with 0 heap allocation.
   */
  public push(
    timestamp: number,
    lat: number,
    lon: number,
    alt: number,
    pressure: number,
    velocity: number,
    heading: number,
    entityId: number
  ): number {
    const idx = this.head;
    this.timestamps[idx] = timestamp;
    this.latitudes[idx] = lat;
    this.longitudes[idx] = lon;
    this.altitudes[idx] = alt;
    this.pressures[idx] = pressure;
    this.velocities[idx] = velocity;
    this.headings[idx] = heading;
    this.entityIds[idx] = entityId;

    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
    return idx;
  }

  public clear(): void {
    this.head = 0;
    this.count = 0;
  }

  public get(idx: number) {
    return {
      timestamp: this.timestamps[idx],
      latitude: this.latitudes[idx],
      longitude: this.longitudes[idx],
      altitude: this.altitudes[idx],
      pressure: this.pressures[idx],
      velocity: this.velocities[idx],
      heading: this.headings[idx],
      entityId: this.entityIds[idx],
    };
  }

  public get totalBytes(): number {
    // 6 * 8 (Float64) + 1 * 4 (Float32) + 1 * 4 (Uint32) = 56 bytes per point
    return this.capacity * 56;
  }
}
