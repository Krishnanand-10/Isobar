/**
 * Flat TypedArray-backed 2D Spatio-Temporal KD-Tree in strict TypeScript
 * Zero garbage collector allocations during query execution.
 */

import { ColumnarRingBufferTS } from './ring-buffer';
import { haversineDistanceKm, equirectangularDistanceSqKm } from './math';

export class SpatialTemporalKDTreeTS {
  private readonly capacity: number;
  private nodeCount: number = 0;
  public root: number = -1;

  // Flat node storage:
  // nodeBounds (Float64Array): 6 doubles per node [minLat, maxLat, minLon, maxLon, minTime, maxTime]
  private readonly nodeBounds: Float64Array;
  // nodeMeta (Int32Array): 4 ints per node [pointIdx, axis, leftChild, rightChild]
  private readonly nodeMeta: Int32Array;
  // Working buffer for QuickSelect partitioning
  private readonly indexPool: Uint32Array;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
    this.nodeBounds = new Float64Array(this.capacity * 6);
    this.nodeMeta = new Int32Array(this.capacity * 4);
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

    this.root = this.buildRecursive(0, count, 0, ring);
  }

  private buildRecursive(
    start: number,
    end: number,
    depth: number,
    ring: ColumnarRingBufferTS
  ): number {
    if (start >= end) {
      return -1;
    }

    const axis = depth % 2; // 0 = Lat, 1 = Lon
    const mid = start + Math.floor((end - start) / 2);

    this.selectKth(start, end - 1, mid, axis, ring);

    const pointIdx = this.indexPool[mid];
    const lat = ring.latitudes[pointIdx];
    const lon = ring.longitudes[pointIdx];
    const time = ring.timestamps[pointIdx];

    const nodeId = this.nodeCount++;
    const metaOffset = nodeId * 4;
    const boundsOffset = nodeId * 6;

    this.nodeMeta[metaOffset] = pointIdx;
    this.nodeMeta[metaOffset + 1] = axis;
    this.nodeMeta[metaOffset + 2] = -1; // left
    this.nodeMeta[metaOffset + 3] = -1; // right

    this.nodeBounds[boundsOffset] = lat;
    this.nodeBounds[boundsOffset + 1] = lat;
    this.nodeBounds[boundsOffset + 2] = lon;
    this.nodeBounds[boundsOffset + 3] = lon;
    this.nodeBounds[boundsOffset + 4] = time;
    this.nodeBounds[boundsOffset + 5] = time;

    const leftChild = this.buildRecursive(start, mid, depth + 1, ring);
    const rightChild = this.buildRecursive(mid + 1, end, depth + 1, ring);

    let minLat = lat;
    let maxLat = lat;
    let minLon = lon;
    let maxLon = lon;
    let minTime = time;
    let maxTime = time;

    if (leftChild !== -1) {
      const lOff = leftChild * 6;
      if (this.nodeBounds[lOff] < minLat) minLat = this.nodeBounds[lOff];
      if (this.nodeBounds[lOff + 1] > maxLat) maxLat = this.nodeBounds[lOff + 1];
      if (this.nodeBounds[lOff + 2] < minLon) minLon = this.nodeBounds[lOff + 2];
      if (this.nodeBounds[lOff + 3] > maxLon) maxLon = this.nodeBounds[lOff + 3];
      if (this.nodeBounds[lOff + 4] < minTime) minTime = this.nodeBounds[lOff + 4];
      if (this.nodeBounds[lOff + 5] > maxTime) maxTime = this.nodeBounds[lOff + 5];
    }

    if (rightChild !== -1) {
      const rOff = rightChild * 6;
      if (this.nodeBounds[rOff] < minLat) minLat = this.nodeBounds[rOff];
      if (this.nodeBounds[rOff + 1] > maxLat) maxLat = this.nodeBounds[rOff + 1];
      if (this.nodeBounds[rOff + 2] < minLon) minLon = this.nodeBounds[rOff + 2];
      if (this.nodeBounds[rOff + 3] > maxLon) maxLon = this.nodeBounds[rOff + 3];
      if (this.nodeBounds[rOff + 4] < minTime) minTime = this.nodeBounds[rOff + 4];
      if (this.nodeBounds[rOff + 5] > maxTime) maxTime = this.nodeBounds[rOff + 5];
    }

    this.nodeMeta[metaOffset + 2] = leftChild;
    this.nodeMeta[metaOffset + 3] = rightChild;

    this.nodeBounds[boundsOffset] = minLat;
    this.nodeBounds[boundsOffset + 1] = maxLat;
    this.nodeBounds[boundsOffset + 2] = minLon;
    this.nodeBounds[boundsOffset + 3] = maxLon;
    this.nodeBounds[boundsOffset + 4] = minTime;
    this.nodeBounds[boundsOffset + 5] = maxTime;

    return nodeId;
  }

  private selectKth(left: number, right: number, k: number, axis: number, ring: ColumnarRingBufferTS): void {
    const coords = axis === 0 ? ring.latitudes : ring.longitudes;
    while (left < right) {
      const pivotIdx = left + Math.floor((right - left) / 2);
      const pivotVal = coords[this.indexPool[pivotIdx]];

      // Swap pivot to right
      let tmp = this.indexPool[pivotIdx];
      this.indexPool[pivotIdx] = this.indexPool[right];
      this.indexPool[right] = tmp;

      let store = left;
      for (let i = left; i < right; i++) {
        if (coords[this.indexPool[i]] < pivotVal) {
          tmp = this.indexPool[i];
          this.indexPool[i] = this.indexPool[store];
          this.indexPool[store] = tmp;
          store++;
        }
      }

      tmp = this.indexPool[store];
      this.indexPool[store] = this.indexPool[right];
      this.indexPool[right] = tmp;

      if (store === k) {
        return;
      } else if (store < k) {
        left = store + 1;
      } else {
        right = store - 1;
      }
    }
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

    // Stack-based traversal to avoid deep recursion overhead
    const stack = new Int32Array(64);
    let stackPtr = 0;
    stack[stackPtr++] = this.root;

    while (stackPtr > 0 && matched < maxLimit) {
      const nodeId = stack[--stackPtr];
      if (nodeId === -1) continue;

      const bOff = nodeId * 6;
      // 1. Temporal Prune
      if (minTime > this.nodeBounds[bOff + 5] || maxTime < this.nodeBounds[bOff + 4]) {
        continue;
      }

      // 2. Spatial Bounding Box Prune
      if (
        minLat > this.nodeBounds[bOff + 1] ||
        maxLat < this.nodeBounds[bOff] ||
        minLon > this.nodeBounds[bOff + 3] ||
        maxLon < this.nodeBounds[bOff + 2]
      ) {
        continue;
      }

      const mOff = nodeId * 4;
      const pointIdx = this.nodeMeta[mOff];
      const ptTime = ring.timestamps[pointIdx];

      if (ptTime >= minTime && ptTime <= maxTime) {
        const ptLat = ring.latitudes[pointIdx];
        const ptLon = ring.longitudes[pointIdx];

        if (ptLat >= minLat && ptLat <= maxLat && ptLon >= minLon && ptLon <= maxLon) {
          let isMatch = true;
          if (hasRadius) {
            const eqDistSq = equirectangularDistanceSqKm(centerLat, centerLon, ptLat, ptLon);
            if (eqDistSq <= radSq * 1.05) {
              isMatch = haversineDistanceKm(centerLat, centerLon, ptLat, ptLon) <= radiusKm;
            } else {
              isMatch = false;
            }
          }

          if (isMatch) {
            outBuffer[matched++] = pointIdx;
            if (matched >= maxLimit) break;
          }
        }
      }

      const axis = this.nodeMeta[mOff + 1];
      const splitVal = axis === 0 ? ring.latitudes[pointIdx] : ring.longitudes[pointIdx];
      const qMin = axis === 0 ? minLat : minLon;
      const qMax = axis === 0 ? maxLat : maxLon;

      const leftChild = this.nodeMeta[mOff + 2];
      const rightChild = this.nodeMeta[mOff + 3];

      if (qMax >= splitVal && rightChild !== -1 && stackPtr < 63) {
        stack[stackPtr++] = rightChild;
      }
      if (qMin <= splitVal && leftChild !== -1 && stackPtr < 63) {
        stack[stackPtr++] = leftChild;
      }
    }

    return matched;
  }
}
