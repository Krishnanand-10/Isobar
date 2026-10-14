import { describe, it, expect } from 'vitest';
import { ColumnarRingBufferTS } from '../src/engine/ring-buffer';
import { SpatialTemporalKDTreeTS } from '../src/engine/kdtree';
import { haversineDistanceKm, boundingBoxFromRadius } from '../src/engine/math';

describe('SpatialTemporalKDTreeTS', () => {
  it('should build and return exact matches matching naive scan', () => {
    const ring = new ColumnarRingBufferTS(1000);
    const centerLat = 51.5074; // London
    const centerLon = -0.1278;

    for (let i = 0; i < 500; i++) {
      const lat = centerLat + ((i % 25) - 12) * 0.08;
      const lon = centerLon + (((i * 3) % 25) - 12) * 0.08;
      const time = 10000 + i * 50;
      ring.push(time, lat, lon, 2500, 1012, 230, 180, i);
    }

    const tree = new SpatialTemporalKDTreeTS(1000);
    tree.rebuild(ring);

    const radiusKm = 75.0;
    const startTime = 12000;
    const endTime = 28000;
    const { minLat, minLon, maxLat, maxLon } = boundingBoxFromRadius(centerLat, centerLon, radiusKm);

    const outBuffer = new Uint32Array(500);
    const kdMatches = tree.queryRange(
      minLat, minLon, maxLat, maxLon,
      startTime, endTime,
      centerLat, centerLon, radiusKm,
      ring, outBuffer
    );

    // Naive scan check
    let naiveMatches = 0;
    for (let i = 0; i < ring.count; i++) {
      const t = ring.timestamps[i];
      if (t >= startTime && t <= endTime) {
        const d = haversineDistanceKm(centerLat, centerLon, ring.latitudes[i], ring.longitudes[i]);
        if (d <= radiusKm) {
          naiveMatches++;
        }
      }
    }

    expect(kdMatches).toBe(naiveMatches);
    expect(kdMatches).toBeGreaterThan(0);
  });
});
