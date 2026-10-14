/**
 * Flat TypedArray-backed 2D Spatio-Temporal R-Tree in strict TypeScript
 * Packed R-Tree with hierarchical MBR spatial-temporal bounding boxes.
 */

import { ColumnarRingBufferTS } from './ring-buffer';
import { haversineDistanceKm, equirectangularDistanceSqKm } from './math';

const RTREE_M = 8; // Branching factor

export class SpatialTemporalRTreeTS {
  private readonly capacity: number;
  private nodeCount: number = 0;
  public root: number = -1;

  // mbrBounds: [minLat, maxLat, minLon, maxLon, minTime, maxTime] (6 doubles per node)
  private readonly mbrBounds: Float64Array;
  // nodeChildren: RTREE_M int32 children per node
  private readonly nodeChildren: Int32Array;
  // nodeMeta: [childCount, isLeaf] (2 uint8 per node)
  private readonly nodeMeta: Uint8Array;
  private readonly indexPool: Uint32Array;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
    const maxNodes = Math.ceil(this.capacity * 1.5) + 32;
    this.mbrBounds = new Float64Array(maxNodes * 6);
    this.nodeChildren = new Int32Array(maxNodes * RTREE_M);
    this.nodeMeta = new Uint8Array(maxNodes * 2);
    this.indexPool = new Uint32Array(this.capacity);
  }

  public rebuild(ring: ColumnarRingBufferTS): void {
    this.nodeCount = 0;
    const count = ring.count;
    if (count === 0) {
      this.root = -1;
      return;
    }

    const startIdx = ring.count < ring.capacity ? 0 : ring.head;
    for (let i = 0; i < count; i++) {
      this.indexPool[i] = (startIdx + i) % ring.capacity;
    }

    // Spatial Morton-like key sort
    const validIndices = Array.from(this.indexPool.subarray(0, count));
    validIndices.sort((a, b) => {
      const latA = ring.latitudes[a];
      const lonA = ring.longitudes[a];
      const latB = ring.latitudes[b];
      const lonB = ring.longitudes[b];
      const keyA = ((latA + 90) * 1000) * 360000 + ((lonA + 180) * 1000);
      const keyB = ((latB + 90) * 1000) * 360000 + ((lonB + 180) * 1000);
      return keyA - keyB;
    });

    let currentLevelNodes: number[] = [];
    let i = 0;

    // Pack leaves
    while (i < validIndices.length) {
      const chunkEnd = Math.min(i + RTREE_M, validIndices.length);
      const nodeId = this.nodeCount++;
      const bOff = nodeId * 6;
      const cOff = nodeId * RTREE_M;
      const mOff = nodeId * 2;

      let minLat = Infinity, maxLat = -Infinity;
      let minLon = Infinity, maxLon = -Infinity;
      let minTime = Infinity, maxTime = -Infinity;
      let childCount = 0;

      for (let j = i; j < chunkEnd; j++) {
        const pt = validIndices[j];
        const lat = ring.latitudes[pt];
        const lon = ring.longitudes[pt];
        const time = ring.timestamps[pt];

        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (time < minTime) minTime = time;
        if (time > maxTime) maxTime = time;

        this.nodeChildren[cOff + childCount] = pt;
        childCount++;
      }

      this.mbrBounds[bOff] = minLat;
      this.mbrBounds[bOff + 1] = maxLat;
      this.mbrBounds[bOff + 2] = minLon;
      this.mbrBounds[bOff + 3] = maxLon;
      this.mbrBounds[bOff + 4] = minTime;
      this.mbrBounds[bOff + 5] = maxTime;

      this.nodeMeta[mOff] = childCount;
      this.nodeMeta[mOff + 1] = 1; // isLeaf = 1

      currentLevelNodes.push(nodeId);
      i = chunkEnd;
    }

    // Pack non-leaf levels
    while (currentLevelNodes.length > 1) {
      const nextLevel: number[] = [];
      let k = 0;
      while (k < currentLevelNodes.length) {
        const chunkEnd = Math.min(k + RTREE_M, currentLevelNodes.length);
        const nodeId = this.nodeCount++;
        const bOff = nodeId * 6;
        const cOff = nodeId * RTREE_M;
        const mOff = nodeId * 2;

        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;
        let minTime = Infinity, maxTime = -Infinity;
        let childCount = 0;

        for (let j = k; j < chunkEnd; j++) {
          const childId = currentLevelNodes[j];
          const cbOff = childId * 6;

          if (this.mbrBounds[cbOff] < minLat) minLat = this.mbrBounds[cbOff];
          if (this.mbrBounds[cbOff + 1] > maxLat) maxLat = this.mbrBounds[cbOff + 1];
          if (this.mbrBounds[cbOff + 2] < minLon) minLon = this.mbrBounds[cbOff + 2];
          if (this.mbrBounds[cbOff + 3] > maxLon) maxLon = this.mbrBounds[cbOff + 3];
          if (this.mbrBounds[cbOff + 4] < minTime) minTime = this.mbrBounds[cbOff + 4];
          if (this.mbrBounds[cbOff + 5] > maxTime) maxTime = this.mbrBounds[cbOff + 5];

          this.nodeChildren[cOff + childCount] = childId;
          childCount++;
        }

        this.mbrBounds[bOff] = minLat;
        this.mbrBounds[bOff + 1] = maxLat;
        this.mbrBounds[bOff + 2] = minLon;
        this.mbrBounds[bOff + 3] = maxLon;
        this.mbrBounds[bOff + 4] = minTime;
        this.mbrBounds[bOff + 5] = maxTime;

        this.nodeMeta[mOff] = childCount;
        this.nodeMeta[mOff + 1] = 0; // isLeaf = 0

        nextLevel.push(nodeId);
        k = chunkEnd;
      }
      currentLevelNodes = nextLevel;
    }

    this.root = currentLevelNodes.length > 0 ? currentLevelNodes[0] : -1;
  }

  public queryRange(
    minLat: number,
    minLon: number,
    maxLat: number,
    maxLon: number,
    minTime: number,
    maxTime: number,
    centerLat: number,
    centerLon: number,
    radiusKm: number,
    ring: ColumnarRingBufferTS,
    outBuffer: Uint32Array
  ): number {
    if (this.root === -1 || outBuffer.length === 0) return 0;

    let matched = 0;
    const hasRadius = radiusKm < 1e8;
    const radSq = radiusKm * radiusKm;
    const maxLimit = outBuffer.length;

    const stack = new Int32Array(64);
    let stackPtr = 0;
    stack[stackPtr++] = this.root;

    while (stackPtr > 0 && matched < maxLimit) {
      const nodeId = stack[--stackPtr];
      if (nodeId === -1) continue;

      const bOff = nodeId * 6;
      // Intersection test
      if (
        this.mbrBounds[bOff] > maxLat ||
        this.mbrBounds[bOff + 1] < minLat ||
        this.mbrBounds[bOff + 2] > maxLon ||
        this.mbrBounds[bOff + 3] < minLon ||
        this.mbrBounds[bOff + 4] > maxTime ||
        this.mbrBounds[bOff + 5] < minTime
      ) {
        continue;
      }

      const mOff = nodeId * 2;
      const count = this.nodeMeta[mOff];
      const isLeaf = this.nodeMeta[mOff + 1] === 1;
      const cOff = nodeId * RTREE_M;

      if (isLeaf) {
        for (let i = 0; i < count; i++) {
          const pt = this.nodeChildren[cOff + i];
          const time = ring.timestamps[pt];
          if (time >= minTime && time <= maxTime) {
            const lat = ring.latitudes[pt];
            const lon = ring.longitudes[pt];
            if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
              let isMatch = true;
              if (hasRadius) {
                const eqDistSq = equirectangularDistanceSqKm(centerLat, centerLon, lat, lon);
                if (eqDistSq <= radSq * 1.05) {
                  isMatch = haversineDistanceKm(centerLat, centerLon, lat, lon) <= radiusKm;
                } else {
                  isMatch = false;
                }
              }
              if (isMatch) {
                outBuffer[matched++] = pt;
                if (matched >= maxLimit) break;
              }
            }
          }
        }
      } else {
        for (let i = 0; i < count; i++) {
          if (stackPtr < 63) {
            stack[stackPtr++] = this.nodeChildren[cOff + i];
          }
        }
      }
    }

    return matched;
  }
}
