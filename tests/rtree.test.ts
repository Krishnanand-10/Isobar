import { describe, it, expect } from 'vitest';
import { ColumnarRingBufferTS } from '../src/engine/ring-buffer';
import { SpatialTemporalRTreeTS } from '../src/engine/rtree';
import { haversineDistanceKm, boundingBoxFromRadius } from '../src/engine/math';

describe('SpatialTemporalRTreeTS', () => {
  it('should hierarchically index and query spatial range accurately', () => {
    const ring = new ColumnarRingBufferTS(1000);
    const centerLat = 37.7749; // San Francisco
    const centerLon = -122.4194;

    for (let i = 0; i < 400; i++) {
      const lat = centerLat + ((i % 20) - 10) * 0.05;
      const lon = centerLon + (((i * 4) % 20) - 10) * 0.05;
      const time = 5000 + i * 100;
      ring.push(time, lat, lon, 4000, 1008, 280, 270, i);
    }

    const rtree = new SpatialTemporalRTreeTS(1000);
    rtree.rebuild(ring);

    const radiusKm = 40.0;
    const startTime = 10000;
    const endTime = 30000;
    const { minLat, minLon, maxLat, maxLon } = boundingBoxFromRadius(centerLat, centerLon, radiusKm);

    const outBuffer = new Uint32Array(400);
    const rtreeMatches = rtree.queryRange(
      minLat, minLon, maxLat, maxLon,
      startTime, endTime,
      centerLat, centerLon, radiusKm,
      ring, outBuffer
    );

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

    expect(rtreeMatches).toBe(naiveMatches);
  });
});
